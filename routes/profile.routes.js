const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const M = require('../models');
const { authMiddleware, getRoleModel } = require('../middleware/auth');
const cfg = require('../config');
const { logAction } = require('../utils/logAction');
const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const { sanitizeToString } = require('../utils/sanitizeQuery');

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const targetModel = getRoleModel(req.user.role);
    if (!targetModel) return res.status(400).json({ error: 'Invalid role' });
    const userDoc = await targetModel.findOne({ username: req.user.username }).select('-password').lean();
    if (!userDoc) return res.status(404).json({ error: 'User not found' });

    const base = {
      _id: userDoc._id,
      role: req.user.role,
      name: userDoc.fullName,
      username: userDoc.username,
      email: userDoc.email || '',
      loginCount: userDoc.loginCount || 0,
      lastLogin: userDoc.lastLogin || null,
      firstLogin: userDoc.firstLogin || null,
      mustChangePassword: userDoc.mustChangePassword || false,
      createdAt: userDoc.createdAt,
      updatedAt: userDoc.updatedAt,
    };

    if (req.user.role === 'admin') {
      Object.assign(base, {
        fullName: userDoc.fullName,
        firstName: userDoc.firstName || '',
        lastName: userDoc.lastName || '',
        employeeNo: userDoc.employeeNo || '',
        department: userDoc.department || '',
        isAdmin: userDoc.isAdmin !== false ? true : false,
        adminRights: userDoc.adminRights || 'all',
      });
    } else if (req.user.role === 'teacher') {
      const specials = Array.isArray(userDoc.specials) ? userDoc.specials : [];
      Object.assign(base, {
        fullName: userDoc.fullName,
        firstName: userDoc.firstName || '',
        lastName: userDoc.lastName || '',
        employeeNo: userDoc.employeeNo || '',
        department: userDoc.department || '',
        designation: userDoc.designation || 'Assistant Professor',
        isHod: specials.some(s => s.option === 'isHod'),
        HoddeptName: (specials.find(s => s.option === 'isHod') || {}).value || '',
        isClassAdvisor: specials.some(s => s.option === 'isClassAdvisor'),
        className: (specials.find(s => s.option === 'isClassAdvisor') || {}).value || '',
        isTimeTableCoordinator: specials.some(s => s.option === 'isTimeTableCoordinator'),
        TTdeptName: (specials.find(s => s.option === 'isTimeTableCoordinator') || {}).value || '',
        isWarden: specials.some(s => s.option === 'isWarden'),
        isExamCoordinator: specials.some(s => s.option === 'isExamCoordinator'),
        isPlacementCoordinator: specials.some(s => s.option === 'isPlacementCoordinator'),
        isAdmin: userDoc.isAdmin || false,
        adminRights: userDoc.adminRights || '',
        specials: specials,
      });
    } else if (req.user.role === 'student') {
      Object.assign(base, {
        fullName: userDoc.fullName,
        firstName: userDoc.firstName || '',
        lastName: userDoc.lastName || '',
        registerNo: userDoc.registerNo || '',
        class: userDoc.class || '',
        classId: userDoc.classId || '',
        className: userDoc.class || '',
        section: userDoc.section || '',
        branch: userDoc.branch || '',
        course: userDoc.courseType || '',
        department: userDoc.department || '',
        deptId: userDoc.deptId || '',
        deptName: userDoc.department || '',
        currentYear: userDoc.currentYear || '',
        academicYear: userDoc.admissionYear || '',
        isRep: userDoc.isRep || false,
      });
    }

    res.json(base);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/profile/me — update own editable fields ──
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const targetModel = getRoleModel(req.user.role);
    if (!targetModel) return res.status(400).json({ error: 'Invalid role' });
    const user = await targetModel.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'Profile not found' });

    const ALWAYS_PROTECTED = [
      'role', 'isAdmin', 'adminRights',
      'isHOD', 'HoddeptName', 'isClassAdvisor', 'advisorClassName', 'advisorClassId',
      'isTimeTableCoordinator', 'TTdeptName',
      'isWarden', 'isExamCoordinator', 'isPlacementCoord',
      'isClassRep', 'isAssiClassRep', 'isSportsRep', 'isCulturalRep',
      'active', 'failedLogins', 'lockedUntil', 'loginCount', 'firstLogin',
      'lastLogin', 'mustChangePassword', 'password', 'username',
    ];

    const updates = { ...req.body };
    ALWAYS_PROTECTED.forEach(k => delete updates[k]);

    if (updates.fullName || updates.name) {
      user.fullName = updates.fullName || updates.name;
    }
    if (updates.firstName) user.firstName = updates.firstName;
    if (updates.lastName) user.lastName = updates.lastName;
    if (updates.email !== undefined) user.email = updates.email;

    if (req.user.role === 'admin' || req.user.role === 'teacher') {
      if (updates.employeeNo !== undefined) user.employeeNo = updates.employeeNo;
      if (updates.empId !== undefined) user.employeeNo = updates.empId;
      if (updates.department !== undefined) user.department = updates.department;
      if (updates.dept !== undefined) user.department = updates.dept;
      if (req.user.role === 'teacher') {
        if (updates.designation !== undefined) user.designation = updates.designation;
        if (updates.desig !== undefined) user.designation = updates.desig;
      }
    }
    if (req.user.role === 'student') {
      if (updates.registerNo !== undefined) user.registerNo = updates.registerNo;
      if (updates.regNo !== undefined) user.registerNo = updates.regNo;
      if (updates.class !== undefined) user.class = updates.class;
      if (updates.className !== undefined) user.class = updates.className;
      if (updates.section !== undefined) user.section = updates.section;
      if (updates.branch !== undefined) user.branch = updates.branch;
      if (updates.department !== undefined) user.department = updates.department;
      if (updates.deptName !== undefined) user.department = updates.deptName;
    }

    await user.save();

    // Shadow user no longer stores name/email, only username/role/trackId/status
    // No sync needed here since those fields don't change in profile self-edit

    await logAction(user.trackId || req.user._id, user.fullName, req.user.role, 'Profile Updated', 'Own profile self-edited', 'data', 'info', req.ip);
    const { password: _pw, ...safe } = user.toObject();
    res.json(safe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/profile/users — admin or Manage User right: list all users ──
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const reqUser = await M.User.findById(req.user._id).lean();
    const rights = reqUser?.adminRights;
    const canManage = req.user.role === 'admin'
      || rights === 'all'
      || (Array.isArray(rights) && rights.includes('managePage'));

    if (!canManage) return res.status(403).json({ error: 'Manage User right required' });

    const filter = {};
    if (req.query.role) filter.role = sanitizeToString(req.query.role);
    if (req.query.search) {
      const re = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ username: re }, { trackId: re }];
    }
    const users = await M.User.find(filter).sort({ role: 1, username: 1 }).lean();

    // Enrich with names from role-specific models
    const enriched = await Promise.all(users.map(async u => {
      let name = '';
      const model = getRoleModel(u.role);
      if (model) {
        const doc = await model.findOne({ trackId: u.trackId }, 'fullName').lean();
        name = doc ? doc.fullName : '';
      }
      return { ...u, name: name || u.username };
    }));

    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/profile/users/:id — Manage User: edit any user ──
router.put('/users/:id', authMiddleware, async (req, res) => {
  try {
    const reqUser = await M.User.findById(req.user._id).lean();
    const rights = reqUser?.adminRights;
    const canManage = req.user.role === 'admin'
      || rights === 'all'
      || (Array.isArray(rights) && rights.includes('managePage'));

    if (!canManage) return res.status(403).json({ error: 'Manage User right required' });

    const { password, name, status, active, ...data } = req.body;

    const user = await M.User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update role-specific model for name/password
    const model = getRoleModel(user.role);
    if (model) {
      const roleDoc = await model.findOne({ trackId: user.trackId });
      if (roleDoc) {
        if (password) roleDoc.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
        if (name || data.fullName) roleDoc.fullName = name || data.fullName;
        if (data.firstName) roleDoc.firstName = data.firstName;
        if (data.lastName) roleDoc.lastName = data.lastName;
        if (data.email !== undefined) roleDoc.email = data.email;
        if (data.employeeNo !== undefined) roleDoc.employeeNo = data.employeeNo;
        if (data.department !== undefined) roleDoc.department = data.department;
        if (data.designation !== undefined) roleDoc.designation = data.designation;
        await roleDoc.save();
      }
    }

    // Update shadow user status
    if (status) {
      user.status = status;
      if (status === 'active') {
        await M.LoginHistory.updateOne(
          { trackId: user.trackId },
          { $set: { failedLogins: 0, lockedUntil: null } }
        );
      }
    }
    if (active !== undefined) {
      user.status = active ? 'active' : 'inactive';
      if (active) {
        await M.LoginHistory.updateOne(
          { trackId: user.trackId },
          { $set: { failedLogins: 0, lockedUntil: null } }
        );
      }
    }
    await user.save();

    await logAction(req.user._id, req.user.name, req.user.role, 'User Updated (Manage User)',
      `${user.username}`, 'data', 'info', req.ip);
    res.json({ ...user.toObject(), name: name || user.username });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;