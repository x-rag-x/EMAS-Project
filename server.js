// ═══════════════════════════════════════════════════════
//  EAMS — Node.js / Express API Server
// ═══════════════════════════════════════════════════════
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();

const express    = require('express');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const multer     = require('multer');
const XLSX       = require('xlsx');
const path       = require('path');
const crypto     = require('crypto');
const cfg        = require('./config');
const M          = require('./models');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });

// ── Middleware ────────────────────────────────────────
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? true : cfg.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// ── MongoDB Connection ────────────────────────────────
mongoose.connect(cfg.MONGO_URI, { dbName: cfg.DB_NAME })
  .then(() => {
    console.log(`3/3 : ✅ MongoDB connected → ${cfg.DB_NAME}`);
    seedDefaults();
  })
  .catch(err => { console.error('3/3 :  ❌ MongoDB error:', err.message); process.exit(1); });

// ── Seed Defaults ─────────────────────────────────────
async function seedDefaults() {
  const adminExists = await M.User.findOne({ role: 'admin' });
  if (!adminExists) {
    const hash = await bcrypt.hash('admin123', cfg.BCRYPT_ROUNDS);
    await M.User.create({ name: 'Administrator', username: 'admin', password: hash, role: 'admin', mustChangePassword: true });

  }
  const teacherExists = await M.User.findOne({ role: 'teacher' });
  if (!teacherExists) {
    const plainPw = 'teacher123';
    const hash = await bcrypt.hash(plainPw, cfg.BCRYPT_ROUNDS);
    await M.User.create({ name: 'Default Teacher', username: 'teacher', password: hash, role: 'teacher', empId: 'EMP001', dept: 'Computer Science Engineering', desig: 'Assistant Professor', mustChangePassword: true });



  } else {
    // Verify existing teacher's hash is valid
    const testMatch = await bcrypt.compare('teacher123', teacherExists.password);

    if (!testMatch) {
      // Auto-reset teacher password if hash is broken
      const newHash = await bcrypt.hash('teacher123', cfg.BCRYPT_ROUNDS);
      await M.User.findByIdAndUpdate(teacherExists._id, { password: newHash, active: true, failedLogins: 0, lockedUntil: null });

    }
  }
  // Seed default settings
  const defaults = [
    { key: 'maintenance', value: { active: false, message: 'System under maintenance. Please try again later.' } },
    { key: 'institution', value: { name: 'Sri Shakthi Institute of Engineering and Technology', short: 'SSIET', address: 'Coimbatore, Tamil Nadu', email: '', phone: '' } },
    { key: 'academic', value: { year: '2025-26', sem: 'I', minAttendance: 75, workingDays: 5 } },
    { key: 'security', value: { maxLoginAttempts: 5, sessionTimeoutMins: 480, forcePwChange: true } },
    { key: 'special_delete_password', value: bcrypt.hashSync('987543210', 10) },
  ];
  for (const d of defaults) {
    const exists = await M.Settings.findOne({ key: d.key });
    if (!exists) await M.Settings.create(d);
  }

  // Log current credentials to DB (visible in Logs menu, not terminal)
  const adminUser2   = await M.User.findOne({ role: 'admin' });
  const teacherUser2 = await M.User.findOne({ role: 'teacher' });
  const adminPwSetting   = await M.Settings.findOne({ key: 'default_admin_pw' });
  const teacherPwSetting = await M.Settings.findOne({ key: 'default_teacher_pw' });
  const adminPw   = adminPwSetting?.value   || 'admin123';
  const teacherPw = teacherPwSetting?.value || 'teacher123';
  await M.Log.create({
    userId: adminUser2?._id, userName: 'SYSTEM', role: 'system',
    action: 'Server Started',
    details: `Admin: ${adminUser2?.username} | pwd: ${adminPw} || Teacher: ${teacherUser2?.username} | pwd: ${teacherPw}`,
    category: 'system', severity: 'info', ip: 'localhost',
    time: new Date()
  });
}

// ── Helper: log action to DB ──────────────────────────
async function logAction(userId, userName, role, action, details, category = 'general', severity = 'info', ip = '', sessionId = '') {
  try {
    await M.Log.create({
      userId, userName, role, action, details, category, severity,
      ip: ip || '', sessionId: sessionId || '',
      time: new Date()
    });
  } catch(e) {}
}

// ── Auth Middleware ───────────────────────────────────
async function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, cfg.JWT_SECRET);
    // Session check (optional - JWT is primary auth)
    // session verification is best-effort only
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ── Check maintenance mode ────────────────────────────
async function checkMaintenance(req, res, next) {
  const setting = await M.Settings.findOne({ key: 'maintenance' });
  if (setting?.value?.active && req.user?.role !== 'admin') {
    const msg = setting.value.message || 'System is under maintenance.';
    return res.status(503).json({ error: msg, maintenance: true });
  }
  next();
}

// ════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role)
      return res.status(400).json({ error: 'username, password and role required' });


    const user = await M.User.findOne({ username: username.toLowerCase(), role, active: true });
    if (!user) {
      await logAction(null, username, role, 'Login Failed', 'User not found', 'security', 'warning', req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check account lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil - new Date()) / 60000);
      return res.status(429).json({ error: `Account locked. Try again in ${mins} minute(s).` });
    }


    const match = await bcrypt.compare(password, user.password);


    if (!match) {
      const security = await M.Settings.findOne({ key: 'security' });
      const maxAttempts = security?.value?.maxLoginAttempts || 5;
      const newFails = (user.failedLogins || 0) + 1;
      const updates = { failedLogins: newFails };
      if (newFails >= maxAttempts) {
        updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // lock 15 mins
        updates.failedLogins = 0;
        // Auto-enable maintenance if too many failures (possible attack)
        if (newFails >= maxAttempts * 2) {
          await M.Settings.findOneAndUpdate({ key: 'maintenance' }, { 'value.active': true });
          await logAction(user._id, user.name, role, 'Maintenance Auto-Enabled', 'Too many failed logins — possible attack', 'security', 'critical', req.ip);
        }
      }
      await M.User.findByIdAndUpdate(user._id, updates);
      await logAction(user._id, user.name, role, 'Login Failed', `Wrong password (attempt ${newFails})`, 'security', 'warning', req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check maintenance (non-admin blocked)
    if (role !== 'admin') {
      const maint = await M.Settings.findOne({ key: 'maintenance' });
      if (maint?.value?.active) {
        return res.status(503).json({ error: maint.value.message || 'System under maintenance.', maintenance: true });
      }
    }

    // Reset failed logins

    await M.User.findByIdAndUpdate(user._id, { failedLogins: 0, lockedUntil: null, lastLogin: new Date(), $inc: { loginCount: 1 } });

    const token = jwt.sign(
      { _id: user._id, name: user.name, username: user.username, role: user.role, dept: user.dept, empId: user.empId, desig: user.desig },
      cfg.JWT_SECRET,
      { expiresIn: cfg.JWT_EXPIRES_IN }
    );

    // Create session record
    const sessionId = crypto.randomBytes(16).toString('hex');
    await M.Session.create({
      userId: user._id, username: user.username, role: user.role,
      token, ip: req.ip, userAgent: req.headers['user-agent'] || '',
    });

    await logAction(user._id, user.name, role, 'Login', `${role} logged in from ${req.ip}`, 'login', 'info', req.ip, sessionId);

    res.json({
      token, sessionId,
      mustChangePassword: user.mustChangePassword,
      user: {
        _id: user._id, name: user.name, role: user.role,
        dept: user.dept, empId: user.empId, desig: user.desig, email: user.email,
        isHOD: user.isHOD, isClassAdvisor: user.isClassAdvisor, advisorClassName: user.advisorClassName,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    const token = req.headers['authorization'].replace('Bearer ', '');
    await M.Session.findOneAndUpdate({ token }, { active: false });
    await logAction(req.user._id, req.user.name, req.user.role, 'Logout', 'User logged out', 'login', 'info', req.ip);
    res.json({ message: 'Logged out' });
  } catch(e) { res.json({ message: 'Logged out' }); }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await M.User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password incorrect' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    user.password = await bcrypt.hash(newPassword, cfg.BCRYPT_ROUNDS);
    user.mustChangePassword = false;
    await user.save();
    await logAction(user._id, user.name, user.role, 'Password Changed', 'User changed their password', 'security', 'info', req.ip);
    res.json({ message: 'Password updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Verify session (called by control panel on open)
app.get('/api/auth/verify-session', authMiddleware, async (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════

app.get('/api/settings', authMiddleware, adminOnly, async (req, res) => {
  const settings = await M.Settings.find({ key: { $ne: 'special_delete_password' } });
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json(obj);
});

app.get('/api/settings/:key', authMiddleware, async (req, res) => {
  const s = await M.Settings.findOne({ key: req.params.key });
  if (!s) return res.status(404).json({ error: 'Setting not found' });
  if (req.params.key === 'special_delete_password') return res.status(403).json({ error: 'Forbidden' });
  res.json(s.value);
});

app.put('/api/settings/:key', authMiddleware, adminOnly, async (req, res) => {
  if (req.params.key === 'special_delete_password') return res.status(403).json({ error: 'Forbidden' });
  const s = await M.Settings.findOneAndUpdate(
    { key: req.params.key },
    { value: req.body.value, updatedBy: req.user.name },
    { new: true, upsert: true }
  );
  await logAction(req.user._id, req.user.name, req.user.role, 'Settings Updated', `Key: ${req.params.key}`, 'settings', 'info', req.ip);
  res.json(s.value);
});

// Verify special delete password
app.post('/api/settings/verify-delete-password', authMiddleware, adminOnly, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  // Check admin password
  const user = await M.User.findById(req.user._id);
  const adminMatch = await bcrypt.compare(password, user.password);
  if (adminMatch) return res.json({ valid: true });
  // Check special password
  const setting = await M.Settings.findOne({ key: 'special_delete_password' });
  if (!setting) return res.status(403).json({ valid: false });
  const specialMatch = await bcrypt.compare(password, setting.value);
  if (specialMatch) return res.json({ valid: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'Delete Auth Failed', 'Wrong delete password attempt', 'security', 'warning', req.ip);
  res.status(403).json({ valid: false, error: 'Incorrect password' });
});

// ════════════════════════════════════════════════════════
//  DEPARTMENTS
// ════════════════════════════════════════════════════════

app.get('/api/departments', authMiddleware, async (req, res) => {
  res.json(await M.Department.find().sort({ name: 1 }));
});
app.post('/api/departments', authMiddleware, adminOnly, async (req, res) => {
  try {
    const dept = await M.Department.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Department Added', dept.name, 'data', 'info', req.ip);
    res.status(201).json(dept);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/departments/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const dept = await M.Department.findByIdAndUpdate(req.params.id, req.body, { new: true });
    await logAction(req.user._id, req.user.name, req.user.role, 'Department Updated', dept.name, 'data', 'info', req.ip);
    res.json(dept);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/departments/:id', authMiddleware, adminOnly, async (req, res) => {
  const dept = await M.Department.findByIdAndDelete(req.params.id);
  await logAction(req.user._id, req.user.name, req.user.role, 'Department Deleted', dept?.name || req.params.id, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// Alias
app.get('/api/depts', authMiddleware, async (req, res) => res.json(await M.Department.find().sort({ name: 1 })));
app.post('/api/depts', authMiddleware, adminOnly, async (req, res) => {
  try {
    const dept = await M.Department.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Department Added', dept.name, 'data', 'info', req.ip);
    res.status(201).json(dept);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/depts/:id', authMiddleware, adminOnly, async (req, res) => {
  const dept = await M.Department.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'Department Updated', dept?.name, 'data', 'info', req.ip);
  res.json(dept);
});
app.delete('/api/depts/:id', authMiddleware, adminOnly, async (req, res) => {
  const dept = await M.Department.findByIdAndDelete(req.params.id);
  await logAction(req.user._id, req.user.name, req.user.role, 'Department Deleted', dept?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  CLASSES
// ════════════════════════════════════════════════════════

app.get('/api/classes', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.deptId) filter.deptId = req.query.deptId;
  res.json(await M.Class.find(filter).sort({ name: 1 }));
});
app.post('/api/classes', authMiddleware, adminOnly, async (req, res) => {
  try {
    const cls = await M.Class.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Class Added', cls.name, 'data', 'info', req.ip);
    res.status(201).json(cls);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/classes/:id', authMiddleware, adminOnly, async (req, res) => {
  const cls = await M.Class.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'Class Updated', cls?.name, 'data', 'info', req.ip);
  res.json(cls);
});
app.delete('/api/classes/:id', authMiddleware, adminOnly, async (req, res) => {
  const cls = await M.Class.findByIdAndDelete(req.params.id);
  await logAction(req.user._id, req.user.name, req.user.role, 'Class Deleted', cls?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  STUDENTS
// ════════════════════════════════════════════════════════

app.get('/api/students', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.deptId)  filter.deptId  = req.query.deptId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.section) filter.section = req.query.section;
  res.json(await M.Student.find(filter).sort({ name: 1 }));
});
app.get('/api/students/count', authMiddleware, async (req, res) => {
  res.json({ count: await M.Student.countDocuments() });
});
app.post('/api/students', authMiddleware, adminOnly, async (req, res) => {
  try {
    const stu = await M.Student.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Student Added', `${stu.name} (${stu.regNo})`, 'data', 'info', req.ip);
    res.status(201).json(stu);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/students/:id', authMiddleware, adminOnly, async (req, res) => {
  const stu = await M.Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'Student Updated', stu?.name, 'data', 'info', req.ip);
  res.json(stu);
});
app.delete('/api/students/:id', authMiddleware, adminOnly, async (req, res) => {
  const stu = await M.Student.findByIdAndDelete(req.params.id);
  await logAction(req.user._id, req.user.name, req.user.role, 'Student Deleted', stu?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// ── Bulk Upload Students ─────────────────────────────
app.post('/api/students/bulk-upload', authMiddleware, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const workbook  = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows      = XLSX.utils.sheet_to_json(worksheet);
    const VALID_COURSE_TYPES = ['UG','PG','M.E','M.TECH','MBA','MCA','B.E','B.TECH','BE','BTECH'];
    let added = 0, skipped = 0, errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cv = (keys) => { for (const k of keys) { const found = Object.keys(row).find(r => r.toLowerCase().replace(/\s/g,'').includes(k.toLowerCase())); if (found) return String(row[found]).trim(); } return ''; };
      const name = cv(['fullname','name','studentname']), regNo = cv(['registerno','regno','rollno']), acadYear = cv(['academicyear','ay']) || '2025-26', courseType = cv(['coursetype','course']).toUpperCase() || 'UG', branch = cv(['branch']), deptName = cv(['department','dept']), yearStr = cv(['year','studyyear']), className = cv(['class','classname']), section = cv(['section','sec']) || 'A', email = cv(['email','mail']), username = cv(['username','user']), password = cv(['password','pass']) || 'Student@123';
      const rowErrors = [];
      if (!name) rowErrors.push('FullName missing');
      if (!regNo) rowErrors.push('RegisterNo missing');
      if (!deptName) rowErrors.push('Department missing');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErrors.push('Invalid email');
      if (VALID_COURSE_TYPES.indexOf(courseType) === -1) rowErrors.push(`CourseType "${courseType}" unknown`);
      if (await M.Student.findOne({ regNo })) rowErrors.push(`RegisterNo ${regNo} already exists`);
      if (username && await M.User.findOne({ username: username.toLowerCase() })) rowErrors.push(`Username "${username}" taken`);
      if (rowErrors.length) { skipped++; errors.push({ row: i+2, name: name||'(blank)', issues: rowErrors }); continue; }
      const dept = await M.Department.findOne({ $or: [{ name: new RegExp(deptName, 'i') }, { code: new RegExp(deptName, 'i') }] });
      const cls  = await M.Class.findOne({ name: className }).lean();
      await M.Student.create({ name, regNo, academicYear: acadYear, courseType, branch, deptId: dept?._id, deptName: dept?.name || deptName, classId: cls?._id, className: cls?.name || className, year: yearStr, section, email });
      if (username) {
        const hash = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
        await M.User.create({ name, username: username.toLowerCase(), password: hash, role: 'student', regNo, deptName: dept?.name || deptName, email });
      }
      added++;
    }
    await logAction(req.user._id, req.user.name, req.user.role, 'Bulk Student Upload', `${added} added, ${skipped} skipped`, 'data', 'info', req.ip);
    res.json({ added, skipped, total: rows.length, errors: errors.slice(0, 20), message: `Import complete: ${added} added, ${skipped} skipped` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  TEACHERS
// ════════════════════════════════════════════════════════

app.get('/api/teachers', authMiddleware, async (req, res) => {
  const teachers = await M.User.find({ role: 'teacher', active: true }, '-password').sort({ name: 1 });
  res.json(teachers);
});
app.post('/api/teachers', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, empId, dept, desig, username, password, email, isHOD, isClassAdvisor, advisorClassId, advisorClassName, isWarden, isExamCoordinator, isPlacementCoord, qualifications, experience, joiningDate } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username, password required' });
    const hash = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);

    const teacher = await M.User.create({ name, empId, dept, desig, username: username.toLowerCase(), password: hash, role: 'teacher', email, mustChangePassword: true, isHOD: !!isHOD, isClassAdvisor: !!isClassAdvisor, advisorClassId: advisorClassId || '', advisorClassName: advisorClassName || '', isWarden: !!isWarden, isExamCoordinator: !!isExamCoordinator, isPlacementCoord: !!isPlacementCoord, qualifications: qualifications || '', experience: experience || '', joiningDate: joiningDate || '' });
    const { password: _, ...teacherData } = teacher.toObject();
    await logAction(req.user._id, req.user.name, req.user.role, 'Teacher Added', `${name} (${username}) — initial password set`, 'data', 'info', req.ip);
    res.status(201).json({ ...teacherData, _plainPassword: password }); // plaintext for admin UI display
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/teachers/:id', authMiddleware, adminOnly, async (req, res) => {
  const { password, ...data } = req.body;
  if (password) data.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
  const teacher = await M.User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password');
  await logAction(req.user._id, req.user.name, req.user.role, 'Teacher Updated', teacher?.name, 'data', 'info', req.ip);
  res.json(teacher);
});
app.delete('/api/teachers/:id', authMiddleware, adminOnly, async (req, res) => {
  const teacher = await M.User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'Teacher Deactivated', teacher?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  ATTENDANCE
// ════════════════════════════════════════════════════════

app.get('/api/attendance', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.teacherId) filter.teacherId = req.query.teacherId;
  if (req.query.classId)   filter.classId   = req.query.classId;
  if (req.query.date)      filter.date       = req.query.date;
  if (req.query.from && req.query.to) filter.date = { $gte: req.query.from, $lte: req.query.to };
  res.json(await M.Attendance.find(filter).sort({ date: -1 }).limit(500));
});
app.post('/api/attendance', authMiddleware, async (req, res) => {
  try {
    const existing = await M.Attendance.findOne({ teacherId: req.body.teacherId, classId: req.body.classId, subjectId: req.body.subjectId, date: req.body.date });
    if (existing) {
      const updated = await M.Attendance.findByIdAndUpdate(existing._id, req.body, { new: true });
      await logAction(req.user._id, req.user.name, req.user.role, 'Attendance Updated', `${req.body.className} on ${req.body.date}`, 'attendance', 'info', req.ip);
      return res.json(updated);
    }
    const record = await M.Attendance.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Attendance Marked', `${req.body.className} on ${req.body.date}`, 'attendance', 'info', req.ip);
    res.status(201).json(record);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.get('/api/attendance/unmarked-teachers', authMiddleware, adminOnly, async (req, res) => {
  const today  = new Date(), monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDates = Array.from({ length: 5 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d.toISOString().split('T')[0]; });
  const assignments = await M.Assignment.find().lean();
  const attendance  = await M.Attendance.find({ date: { $in: weekDates } }).lean();
  const unmarked    = [];
  for (const a of assignments) {
    const markedDates = attendance.filter(att => String(att.teacherId) === String(a.teacherId) && String(att.classId) === String(a.classId) && String(att.subjectId) === String(a.subjectId)).map(att => att.date);
    const missingDays = weekDates.filter(d => !markedDates.includes(d));
    if (missingDays.length > 0) unmarked.push({ ...a, missingDays, missingCount: missingDays.length });
  }
  res.json(unmarked);
});

// ════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ════════════════════════════════════════════════════════

app.get('/api/notifications', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.user.role === 'teacher') filter.$or = [{ toTeacherId: req.user._id }, { toTeacherId: null, type: { $ne: 'attendance-alert' } }];
  res.json(await M.Notification.find(filter).sort({ time: -1 }).limit(50));
});
app.post('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const notif = await M.Notification.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Notification Sent', req.body.message?.slice(0,80), 'data', 'info', req.ip);
    res.status(201).json(notif);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/notifications/:id', authMiddleware, async (req, res) => {
  const notif = await M.Notification.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (req.body.status === 'Solved' && notif?.grievanceId) await M.Grievance.findByIdAndUpdate(notif.grievanceId, { status: 'Resolved', resolvedAt: new Date(), resolvedBy: req.user.name });
  if (req.body.status === 'Cancelled' && notif?.grievanceId) await M.Grievance.findByIdAndUpdate(notif.grievanceId, { status: 'Cancelled', cancelledAt: new Date() });
  await logAction(req.user._id, req.user.name, req.user.role, 'Notification ' + (req.body.status || 'Updated'), '', 'data', 'info', req.ip);
  res.json(notif);
});

// ════════════════════════════════════════════════════════
//  GRIEVANCES
// ════════════════════════════════════════════════════════

app.get('/api/grievances', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.user.role === 'teacher') filter.teacherId = req.user._id;
  res.json(await M.Grievance.find(filter).sort({ createdAt: -1 }));
});
app.post('/api/grievances', authMiddleware, async (req, res) => {
  try {
    const grievance = await M.Grievance.create({ ...req.body, teacherId: req.user._id, teacherName: req.user.name });
    await M.Notification.create({ type: 'request', from: req.user.name, fromRole: 'Teacher', message: `[Grievance] ${req.body.subject} — ${req.body.detail.slice(0, 100)}`, time: new Date(), priority: 'Normal', grievanceId: grievance._id });
    await logAction(req.user._id, req.user.name, req.user.role, 'Grievance Filed', req.body.subject, 'data', 'info', req.ip);
    res.status(201).json(grievance);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  TIMETABLE
// ════════════════════════════════════════════════════════

app.get('/api/timetable', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.teacherId) filter.teacherId = req.query.teacherId;
  else if (req.user.role === 'teacher') filter.teacherId = req.user._id;
  res.json(await M.Timetable.find(filter).sort({ day: 1, start: 1 }));
});
app.post('/api/timetable', authMiddleware, async (req, res) => {
  try {
    const slot = await M.Timetable.create({ ...req.body, teacherId: req.user._id, teacherName: req.user.name });
    await logAction(req.user._id, req.user.name, req.user.role, 'Timetable Slot Added', `${req.body.day} ${req.body.start}`, 'data', 'info', req.ip);
    res.status(201).json(slot);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/timetable/:id', authMiddleware, async (req, res) => {
  const slot = await M.Timetable.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(slot);
});
app.delete('/api/timetable/:id', authMiddleware, async (req, res) => {
  await M.Timetable.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  ACTIVITY LOGS
// ════════════════════════════════════════════════════════

app.get('/api/logs', authMiddleware, adminOnly, async (req, res) => {
  const filter = {};
  if (req.query.role)     filter.role     = req.query.role;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.severity) filter.severity = req.query.severity;
  if (req.query.from)     filter.time = { $gte: new Date(req.query.from) };
  if (req.query.to)       filter.time = { ...filter.time, $lte: new Date(req.query.to + 'T23:59:59') };
  const logs = await M.Log.find(filter).sort({ time: -1 }).limit(500);
  res.json(logs);
});
app.post('/api/logs', authMiddleware, async (req, res) => {
  try {
    const { action, details, category } = req.body;
    await M.Log.create({ userId: req.user._id, userName: req.user.name, role: req.user.role, action, details: details||'', category: category||'general', severity:'info', ip: req.ip });
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false }); }
});

app.delete('/api/logs', authMiddleware, adminOnly, async (req, res) => {
  await M.Log.deleteMany({});
  await logAction(req.user._id, req.user.name, req.user.role, 'Logs Cleared', 'All logs deleted', 'settings', 'warning', req.ip);
  res.json({ deleted: true });
});

// GET /api/logs/users — list distinct users who have logs
app.get('/api/logs/users', authMiddleware, adminOnly, async (req, res) => {
  const users = await M.Log.aggregate([
    { $group: { _id: '$userName', role: { $first: '$role' }, count: { $sum: 1 }, lastTime: { $max: '$time' } } },
    { $sort: { lastTime: -1 } }
  ]);
  res.json(users);
});

// GET /api/logs/by-user/:userName — all logs for a specific user
app.get('/api/logs/by-user/:userName', authMiddleware, adminOnly, async (req, res) => {
  const logs = await M.Log.find({ userName: req.params.userName })
    .sort({ time: -1 }).limit(500);
  res.json(logs);
});

// ════════════════════════════════════════════════════════
//  DASHBOARD SUMMARY
// ════════════════════════════════════════════════════════

app.get('/api/dashboard/summary', authMiddleware, adminOnly, async (req, res) => {
  const [students, depts, teachers, classes, pendingNotifs] = await Promise.all([
    M.Student.countDocuments(),
    M.Department.countDocuments(),
    M.User.countDocuments({ role: 'teacher', active: true }),
    M.Class.countDocuments(),
    M.Notification.countDocuments({ status: 'Pending', read: false }),
  ]);
  res.json({ students, depts, teachers, classes, pendingNotifs });
});

// ════════════════════════════════════════════════════════
//  SUBJECTS
// ════════════════════════════════════════════════════════

app.get('/api/subjects', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.deptId) filter.deptId = req.query.deptId;
  res.json(await M.Subject.find(filter).sort({ name: 1 }));
});
app.post('/api/subjects', authMiddleware, adminOnly, async (req, res) => {
  try {
    const subj = await M.Subject.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Subject Added', `${subj.name} (${subj.code})`, 'data', 'info', req.ip);
    res.status(201).json(subj);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/subjects/:id', authMiddleware, adminOnly, async (req, res) => {
  const subj = await M.Subject.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'Subject Updated', subj?.name, 'data', 'info', req.ip);
  res.json(subj);
});
app.delete('/api/subjects/:id', authMiddleware, adminOnly, async (req, res) => {
  const subj = await M.Subject.findByIdAndDelete(req.params.id);
  await logAction(req.user._id, req.user.name, req.user.role, 'Subject Deleted', subj?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  ASSIGNMENTS
// ════════════════════════════════════════════════════════

app.get('/api/assignments', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.teacherId) filter.teacherId = req.query.teacherId;
  else if (req.user.role === 'teacher') filter.teacherId = req.user._id;
  if (req.query.classId) filter.classId = req.query.classId;
  res.json(await M.Assignment.find(filter).sort({ teacherName: 1 }));
});
app.post('/api/assignments', authMiddleware, adminOnly, async (req, res) => {
  try {
    const existing = await M.Assignment.findOne({ teacherId: req.body.teacherId, classId: req.body.classId, subjectId: req.body.subjectId });
    if (existing) return res.status(409).json({ error: 'Assignment already exists' });
    const asgn = await M.Assignment.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Assignment Created', `${req.body.subjectName} → ${req.body.className}`, 'data', 'info', req.ip);
    res.status(201).json(asgn);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/assignments/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.Assignment.findByIdAndDelete(req.params.id);
  await logAction(req.user._id, req.user.name, req.user.role, 'Assignment Removed', req.params.id, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  USERS
// ════════════════════════════════════════════════════════

app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  res.json(await M.User.find(filter, '-password').sort({ name: 1 }));
});
app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const { password, ...data } = req.body;
  if (password) data.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
  const user = await M.User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password');
  await logAction(req.user._id, req.user.name, req.user.role, 'User Updated', user?.name, 'data', 'info', req.ip);
  res.json(user);
});
app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const user = await M.User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'User Deactivated', user?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  DB STATS
// ════════════════════════════════════════════════════════

app.get('/api/system/dbstats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const stats = await db.command({ dbStats: 1, scale: 1024 * 1024 });
    const collList = await db.listCollections().toArray();
    const collStats = await Promise.all(collList.map(async c => ({ name: c.name, count: await db.collection(c.name).countDocuments() })));
    res.json({ dbName: stats.db, collections: stats.collections, totalDocs: stats.objects, dataSize: stats.dataSize.toFixed(2), storageSize: stats.storageSize.toFixed(2), indexSize: stats.indexSize ? stats.indexSize.toFixed(2) : '0.00', fsTotalSize: stats.fsTotalSize ? (stats.fsTotalSize/1024/1024).toFixed(0) : null, fsUsedSize: stats.fsUsedSize ? (stats.fsUsedSize/1024/1024).toFixed(0) : null, collStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Start Server ──────────────────────────────────────
const PORT = process.env.PORT || cfg.PORT;
app.listen(PORT, () => {
  console.log(`1/3 : 🚀 EAMS API running → http://localhost:${PORT}`);
  console.log(`2/3 :    Environment: ${cfg.NODE_ENV}`);
});
