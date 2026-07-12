const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const M = require('../models');
const cfg = require('../config');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

router.get('/trackid/:trackId', authMiddleware, async (req, res) => {
  try {
    const teacher = await M.Teacher.findOne(
      { trackId: req.params.trackId.trim() },
      'fullName specials trackId'
    ).lean();
    if (!teacher) return res.status(404).json({ error: 'TrackID not found' });
    const isHodVal = teacher.specials?.some(s => s.option === 'isHod');
    res.json({ fullName: teacher.fullName, isHod: isHodVal, trackId: teacher.trackId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const activeUsers = await M.User.find({ role: 'teacher', status: 'active' }, 'trackId').select('-password').lean();
    const activeTrackIds = activeUsers.map(u => u.trackId);
    
    const teachers = await M.Teacher.find({ trackId: { $in: activeTrackIds } }, '-password').sort({ fullName: 1 });
    const mapped = teachers.map(t => {
      const isHodVal = t.specials?.some(s => s.option === 'isHod');
      const isClassAdvisorVal = t.specials?.some(s => s.option === 'isClassAdvisor');
      const isTTCoordVal = t.specials?.some(s => s.option === 'isTimeTableCoordinator');
      return {
        _id: t._id,
        name: t.fullName,
        empId: t.employeeNo,
        employeeNo: t.employeeNo,
        dept: t.department,
        department: t.department,
        desig: t.designation,
        designation: t.designation,
        email: t.email,
        username: t.username,
        trackId: t.trackId,
        isHOD: isHodVal,
        isClassAdvisor: isClassAdvisorVal,
        isTimeTableCoordinator: isTTCoordVal,
        specials: t.specials || [],
        adminRights: t.adminRights || [],
        active: true,
        status: 'active',
        mustChangePassword: t.mustChangePassword,
      };
    });
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { fullName, firstName, lastName, employeeNo, department, designation, username, password, email, specials, adminRights } = req.body;

    if (!fullName || !username || !password) {
      return res.status(400).json({
        error: 'fullName, username, password required'
      });
    }
    const hash = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
    
    // Track ID generation (fallback if not provided)
    const generatedTrackId = 'TRTCH' + employeeNo;

    const teacher = await M.Teacher.create({
      fullName, firstName: firstName, lastName: lastName, employeeNo: employeeNo,
      department: department, designation: designation, email: email, username: username.toLowerCase().trim(), password: hash,
      trackId: req.body.trackId || generatedTrackId, specials: specials || [],
      adminRights: (Array.isArray(adminRights) && adminRights.length) ? adminRights : ['none'],
      isAdmin: false, mustChangePassword: true
    });
    await M.User.create({ username: username.toLowerCase().trim(), role: 'teacher', trackId: teacher.trackId, status: 'active' });

    const { password: _, ...teacherData } = teacher.toObject();
    await logAction( req.user.trackId || req.user._id, req.user.name, req.user.role, 'Teacher Added', `${fullName} (${username}) — initial password set`, 'data', 'info', req.ip );
    res.status(201).json({ ...teacherData, name: teacher.fullName, empId: teacher.employeeNo, dept: teacher.department, desig: teacher.designation, _plainPassword: password });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { password, name, empId, dept, desig, email, username, specials, adminRights, active, status } = req.body;
    const teacher = await M.Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    const oldUsername = teacher.username;

    if (name) teacher.fullName = name;
    if (empId !== undefined) teacher.employeeNo = empId;
    if (dept !== undefined) teacher.department = dept;
    if (desig !== undefined) teacher.designation = desig;
    if (email !== undefined) teacher.email = email;
    if (username) teacher.username = username.toLowerCase().trim();

    if (password) {
      teacher.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
    }

    if (specials !== undefined) {
      teacher.specials = specials;
    }

    if (adminRights !== undefined) {
      teacher.adminRights = (Array.isArray(adminRights) && adminRights.length) ? adminRights : ['none'];
    }

    await teacher.save();

    // Sync shadow user
    let shadowUser = await M.User.findOne({ username: oldUsername, role: 'teacher' });
    if (shadowUser) {
      if (username) shadowUser.username = username.toLowerCase().trim();
      if (active !== undefined) shadowUser.status = active ? 'active' : 'inactive';
      if (status) shadowUser.status = status;
      await shadowUser.save();
    }

    const { password: _, ...safeTeacher } = teacher.toObject();
    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Teacher Updated', teacher.fullName, 'data', 'info', req.ip);
    res.json({ ...safeTeacher, name: teacher.fullName, empId: teacher.employeeNo, dept: teacher.department, desig: teacher.designation });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const teacher = await M.Teacher.findById(req.params.id).select('-password');
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    
    await M.UndoLog.create({
      collectionName: 'teachers', label: `Teacher: ${teacher.fullName} (@${teacher.username})`,
      snapshot: teacher.toObject(), deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
    
    await M.Teacher.findByIdAndDelete(req.params.id);
    
    // Also delete shadow user
    await M.User.deleteOne({ username: teacher.username, role: 'teacher' });
    
    // Also delete assignments
    await M.Assignment.deleteMany({ teacherId: req.params.id });
    
    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Teacher Deleted', teacher.fullName, 'data', 'warning', req.ip);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;