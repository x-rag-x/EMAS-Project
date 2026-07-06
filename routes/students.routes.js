const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const M = require('../models');
const cfg = require('../config');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/students -> Fetch students
router.get('/', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.deptId) filter.deptId = req.query.deptId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.section) filter.section = req.query.section;
  
  const list = await M.Student.find(filter).sort({ fullName: 1 }).lean();
  const trackIds = list.map(s => s.trackId);
  const shadowUsers = await M.User.find({ trackId: { $in: trackIds } }).lean();
  const shadowMap = new Map(shadowUsers.map(u => [u.trackId, u]));
  
  const mapped = list.map(s => {
    const shadow = shadowMap.get(s.trackId);
    return {
      ...s,
      name: s.fullName,
      regNo: s.registerNo,
      deptName: s.department,
      academicYear: s.admissionYear,
      className: s.class,
      active: shadow ? shadow.status === 'active' : true,
      status: shadow ? shadow.status : 'active'
    };
  });
  res.json(mapped);
});

router.get('/count', authMiddleware, async (req, res) => {
  res.json({ count: await M.Student.countDocuments() });
});

// GET /api/students/exam-search -> Search students for exam hall assignment
router.get('/exam-search', authMiddleware, async (req, res) => {
  try {
    const { q, depts, year } = req.query;
    if (!q || q.trim().length < 3) {
      return res.json([]);
    }

    const filter = {
      $or: [
        { fullName: new RegExp(q, 'i') },
        { registerNo: new RegExp(q, 'i') }
      ]
    };

    // Filter by departments if provided
    if (depts) {
      const deptList = depts.split(',').map(d => d.trim()).filter(Boolean);
      if (deptList.length > 0) {
        filter.department = { $in: deptList.map(d => new RegExp(d, 'i')) };
      }
    }

    // Fetch students and populate classId to filter by year
    let students = await M.Student.find(filter).populate('classId').lean();

    // Filter by year if provided
    if (year) {
      // Map year (I, II, III, IV) to class year or match directly
      const romanToWord = { 'I': 'I Year', 'II': 'II Year', 'III': 'III Year', 'IV': 'IV Year' };
      const targetYearWord = romanToWord[year.toUpperCase()] || year;
      students = students.filter(s => {
        const classYear = s.classId?.year || '';
        return classYear.toLowerCase().includes(targetYearWord.toLowerCase()) || 
               classYear.toLowerCase().includes(year.toLowerCase());
      });
    }

    // Map to frontend expected structure
    const mapped = students.map(s => ({
      _id: s._id,
      name: s.fullName,
      regNo: s.registerNo,
      deptName: s.department,
      year: s.classId?.year || s.class || '',
      className: s.class
    }));

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, regNo, academicYear, courseType, branch, deptId, deptName, classId, className, section, email, username, password, isRep, batchTrackId } = req.body;
    
    // Check if student exists
    const exists = await M.Student.findOne({ registerNo: regNo });
    if (exists) return res.status(400).json({ error: 'Student with this Register No already exists' });

    const generatedTrackId = 'TRSTU_' + Math.random().toString(36).substr(2, 9).toUpperCase();
    
    const defaultPassword = password || cfg.STUDENT_PASSWORD;
    const hash = await bcrypt.hash(defaultPassword, cfg.BCRYPT_ROUNDS);

    const generatedUsername = username || regNo.toLowerCase();

    const stu = await M.Student.create({
      fullName: name,
      registerNo: regNo,
      class: className || '',
      classId,
      section: section || 'A',
      courseType: courseType || 'UG',
      branch: branch || 'None',
      department: deptName || '',
      deptId,
      admissionYear: academicYear || '',
      batchTrackId: batchTrackId || '',
      email: email || '',
      username: generatedUsername,
      password: hash,
      trackId: generatedTrackId,
      isRep: !!isRep,
      mustChangePassword: true
    });

    // Create shadow user in M.User
    await M.User.create({ username: generatedUsername, role: 'student', trackId: generatedTrackId, status: 'active' });

    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Student Added', `${stu.fullName} (${stu.registerNo})`, 'data', 'info', req.ip);
    res.status(201).json({ ...stu.toObject(), name: stu.fullName, regNo: stu.registerNo });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, regNo, academicYear, courseType, branch, deptId, deptName, classId, className, section, email, username, password, isRep, active, status, batchTrackId } = req.body;
    
    const stu = await M.Student.findById(req.params.id);
    if (!stu) return res.status(404).json({ error: 'Student not found' });

    const oldUsername = stu.username;

    if (name) stu.fullName = name;
    if (regNo) stu.registerNo = regNo;
    if (className !== undefined) stu.class = className;
    if (classId !== undefined) stu.classId = classId;
    if (section !== undefined) stu.section = section;
    if (courseType !== undefined) stu.courseType = courseType;
    if (branch !== undefined) stu.branch = branch;
    if (deptName !== undefined) stu.department = deptName;
    if (deptId !== undefined) stu.deptId = deptId;
    if (academicYear !== undefined) stu.admissionYear = academicYear;
    if (batchTrackId !== undefined) stu.batchTrackId = batchTrackId;
    if (email !== undefined) stu.email = email;
    if (username) stu.username = username.toLowerCase().trim();
    if (isRep !== undefined) stu.isRep = isRep;

    if (password) {
      stu.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
    }

    await stu.save();

    // Sync shadow user
    let shadowUser = await M.User.findOne({ username: oldUsername, role: 'student' });
    if (shadowUser) {
      if (username) shadowUser.username = username.toLowerCase().trim();
      if (active !== undefined) shadowUser.status = active ? 'active' : 'inactive';
      if (status) shadowUser.status = status;
      await shadowUser.save();
    }

    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Student Updated', stu.fullName, 'data', 'info', req.ip);
    res.json({ ...stu.toObject(), name: stu.fullName, regNo: stu.registerNo });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const stu = await M.Student.findById(req.params.id);
    if (!stu) return res.status(404).json({ error: 'Student not found' });

    await M.UndoLog.create({
      collectionName: 'students', label: `Student: ${stu.fullName} (${stu.registerNo})`,
      snapshot: stu.toObject(), deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
    
    await M.Student.findByIdAndDelete(req.params.id);
    
    // Delete shadow user
    await M.User.deleteOne({ username: stu.username, role: 'student' });

    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Student Deleted', stu.fullName, 'data', 'warning', req.ip);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bulk Upload Students ─────────────────────────────
router.post('/bulk-upload', authMiddleware, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet);
    const VALID_COURSE_TYPES = ['UG', 'PG', 'M.E', 'M.TECH', 'B.E', 'B.TECH'];
    let added = 0, skipped = 0, errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cv = (keys) => { for (const k of keys) { const found = Object.keys(row).find(r => r.toLowerCase().replace(/\s/g, '').includes(k.toLowerCase())); if (found) return String(row[found]).trim(); } return ''; };
      const name = cv(['fullname', 'name', 'studentname']), regNo = cv(['registerno', 'regno', 'rollno']), acadYear = cv(['academicyear', 'ay']) || '2025-26', courseType = cv(['coursetype', 'course']).toUpperCase() || 'UG', branch = cv(['branch']), deptName = cv(['department', 'dept']), className = cv(['class', 'classname']), section = cv(['section', 'sec']) || 'A', email = cv(['email', 'mail']), username = cv(['username', 'user']), password = cv(['password', 'pass']) || 'Student@123';
      const rowErrors = [];
      if (!name) rowErrors.push('FullName missing');
      if (!regNo) rowErrors.push('RegisterNo missing');
      if (!deptName) rowErrors.push('Department missing');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErrors.push('Invalid email');
      if (VALID_COURSE_TYPES.indexOf(courseType) === -1) rowErrors.push(`CourseType "${courseType}" unknown`);
      if (await M.Student.findOne({ registerNo: regNo })) rowErrors.push(`RegisterNo ${regNo} already exists`);
      if (username && await M.User.findOne({ username: username.toLowerCase() })) rowErrors.push(`Username "${username}" taken`);
      if (rowErrors.length) { skipped++; errors.push({ row: i + 2, name: name || '(blank)', issues: rowErrors }); continue; }
      const dept = await M.Department.findOne({ $or: [{ name: new RegExp(deptName, 'i') }, { code: new RegExp(deptName, 'i') }] });
      const cls = await M.Class.findOne({ name: className }).lean();
      
      const generatedTrackId = 'TRSTU_' + Math.random().toString(36).substr(2, 9).toUpperCase();
      const defaultPassword = password || cfg.STUDENT_PASSWORD;
      const hash = await bcrypt.hash(defaultPassword, cfg.BCRYPT_ROUNDS);
      const generatedUsername = username || regNo.toLowerCase();

      await M.Student.create({
        fullName: name,
        registerNo: regNo,
        class: className || cls?.name || '',
        classId: cls?._id,
        section,
        courseType,
        branch,
        department: dept?.name || deptName,
        deptId: dept?._id,
        admissionYear: acadYear,
        email,
        username: generatedUsername,
        password: hash,
        trackId: generatedTrackId,
        isRep: false,
        mustChangePassword: true
      });

      await M.User.create({
        username: generatedUsername,
        role: 'student',
        trackId: generatedTrackId,
        status: 'active',
      });

      added++;
    }
    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Bulk Student Upload', `${added} added, ${skipped} skipped`, 'data', 'info', req.ip);
    res.json({ added, skipped, total: rows.length, errors: errors.slice(0, 20), message: `Import complete: ${added} added, ${skipped} skipped` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
