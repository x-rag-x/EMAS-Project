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
    { key: 'maintenance', value: { active: false, message: 'System under maintenance. Please try again later.', affectedRoles: ['teacher','student'], endTime: null, startedAt: null } },
    { key: 'institution', value: { name: 'Sri Shakthi Institute of Engineering and Technology', short: 'SIET', address: 'Coimbatore, Tamil Nadu', email: '', phone: '' } },
    { key: 'academic', value: { year: '2025-26', sem: 'I', minAttendance: 75, workingDays: 6 } },
    { key: 'security', value: { maxLoginAttempts: 3, sessionTimeoutMins: 480, forcePwChange: true } },
    { key: 'special_delete_password', value: bcrypt.hashSync('987543210', 10) },
    { key: 'college_ips', value: ['127.0.0.1', '::1', '192.', '10.'] },
    { key: 'tokenSystem', value: { enabled: false } },
  ];
  for (const d of defaults) {
    const exists = await M.Settings.findOne({ key: d.key });
    if (!exists) await M.Settings.create(d);
  }
  // ── Migrate: patch any old maintenance record missing new fields (runs once, harmless after)
  await M.Settings.findOneAndUpdate(
    { key: 'maintenance', 'value.affectedRoles': { $exists: false } },
    { $set: { 'value.affectedRoles': ['teacher','student'], 'value.endTime': null, 'value.startedAt': null } }
  );

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
    const v = setting.value;
    const affected = v.affectedRoles?.length ? v.affectedRoles : ['teacher','student'];
    if (affected.includes(req.user?.role)) {
      return res.status(503).json({
        error: v.message || 'System is under maintenance.',
        maintenance: true,
        message: v.message || 'System is under maintenance.',
        affectedRoles: affected,
        endTime: v.endTime || null,
        startedAt: v.startedAt || null,
      });
    }
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
        const v = maint.value;
        const affected = v.affectedRoles?.length ? v.affectedRoles : ['teacher','student'];
        if (affected.includes(role)) {
          return res.status(503).json({
            error: v.message || 'System under maintenance.',
            maintenance: true,
            message: v.message || 'System under maintenance.',
            affectedRoles: affected,
            endTime: v.endTime || null,
            startedAt: v.startedAt || null,
          });
        }
      }
    }

    // Reset failed logins — stamp firstLogin only on very first successful login
    const _loginUpd = { failedLogins: 0, lockedUntil: null, lastLogin: new Date(), $inc: { loginCount: 1 } };
    if (!user.firstLogin) _loginUpd.firstLogin = new Date();
    await M.User.findByIdAndUpdate(user._id, _loginUpd);

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

    // Re-fetch user to get updated firstLogin value
    const freshUser = await M.User.findById(user._id).lean();
    res.json({
      token, sessionId,
      mustChangePassword: freshUser.mustChangePassword,
      user: {
        _id: freshUser._id, name: freshUser.name, role: freshUser.role,
        dept: freshUser.dept, empId: freshUser.empId, desig: freshUser.desig,
        email: freshUser.email, username: freshUser.username,
        isHOD: freshUser.isHOD, HoddeptName: freshUser.HoddeptName,
        isClassAdvisor: freshUser.isClassAdvisor, advisorClassName: freshUser.advisorClassName,
        isTimeTableCoordinator: freshUser.isTimeTableCoordinator, TTdeptName: freshUser.TTdeptName,
        isAdmin: freshUser.isAdmin, adminRights: freshUser.adminRights,
        isClassRep: freshUser.isClassRep, regNo: freshUser.regNo, deptName: freshUser.deptName,
        loginCount: freshUser.loginCount, lastLogin: freshUser.lastLogin,
        firstLogin: freshUser.firstLogin || null,
        active: freshUser.active,
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
  // Special detailed logging for maintenance changes
  if (req.params.key === 'maintenance') {
    const v = req.body.value || {};
    const prevSetting = await M.Settings.findOne({ key: 'maintenance' });
    const action = v.active ? 'Maintenance Mode Enabled' : 'Maintenance Mode Disabled';
    const affected = (v.affectedRoles || []).join(', ') || 'none';
    const endInfo = v.endTime ? ` | End: ${new Date(v.endTime).toLocaleString('en-IN')}` : '';
    const details = `Roles blocked: ${affected}${endInfo} | Msg: "${(v.message||'').slice(0,60)}"`;
    await logAction(req.user._id, req.user.name, req.user.role, action, details, 'maintenance', v.active ? 'warning' : 'info', req.ip);
  } else {
    await logAction(req.user._id, req.user.name, req.user.role, 'Settings Updated', `Key: ${req.params.key}`, 'settings', 'info', req.ip);
  }
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
  const dept = await M.Department.findById(req.params.id).lean();
  if (dept) {
    await M.UndoLog.create({ collectionName: 'departments', label: `Department: ${dept.name}`,
      snapshot: dept, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10*24*60*60*1000) });
    await M.Department.findByIdAndDelete(req.params.id);
  }
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
  const dept = await M.Department.findById(req.params.id).lean();
  if (dept) {
    await M.UndoLog.create({ collectionName: 'departments', label: `Department: ${dept.name}`,
      snapshot: dept, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10*24*60*60*1000) });
    await M.Department.findByIdAndDelete(req.params.id);
  }
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
  const cls = await M.Class.findById(req.params.id).lean();
  if (cls) {
    await M.UndoLog.create({ collectionName: 'classes', label: `Class: ${cls.name}`,
      snapshot: cls, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10*24*60*60*1000) });
    await M.Class.findByIdAndDelete(req.params.id);
  }
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
  const stu = await M.Student.findById(req.params.id).lean();
  if (stu) {
    await M.UndoLog.create({ collectionName: 'students', label: `Student: ${stu.name} (${stu.regNo})`,
      snapshot: stu, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10*24*60*60*1000) });
    await M.Student.findByIdAndDelete(req.params.id);
  }
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
  const teacher = await M.User.findById(req.params.id).lean();
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  await M.UndoLog.create({ collectionName: 'teachers', label: `Teacher: ${teacher.name} (@${teacher.username})`,
    snapshot: teacher, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10*24*60*60*1000) });
  await M.User.findByIdAndDelete(req.params.id);
  await M.Assignment.deleteMany({ teacherId: req.params.id });
  await logAction(req.user._id, req.user.name, req.user.role, 'Teacher Deleted', teacher.name, 'data', 'warning', req.ip);
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
      // Fire-and-forget: check for unauthorized absences
      checkUnauthorizedAbsences(req.body.classId, req.body.date, req.body.className).catch(() => {});
      return res.json(updated);
    }
    const record = await M.Attendance.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Attendance Marked', `${req.body.className} on ${req.body.date}`, 'attendance', 'info', req.ip);
    // Fire-and-forget: check for unauthorized absences
    checkUnauthorizedAbsences(req.body.classId, req.body.date, req.body.className).catch(() => {});
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

// ── Live Session Endpoints ──────────────────────────────
app.post('/api/live-session/start', authMiddleware, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Only teachers can start live sessions' });
  const { classId, subjectId, date } = req.body;
  if (!classId || !subjectId || !date) return res.status(400).json({ error: 'classId, subjectId, date required' });
  
  // Close any existing active sessions for this teacher/class
  await M.LiveSession.updateMany({ teacherId: req.user._id, classId, active: true }, { active: false });
  
  const passcode = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

  const session = await M.LiveSession.create({
    teacherId: req.user._id, classId, subjectId, date, passcode, expiresAt, active: true, markedStudents: []
  });
  res.status(201).json(session);
});

app.get('/api/live-session/active', authMiddleware, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
  try {
    // Find student's classId
    const student = await M.Student.findOne({ userId: req.user._id });
    if (!student || !student.classId) return res.json({ active: false });

    // Find active session for this class
    const session = await M.LiveSession.findOne({ classId: student.classId, active: true, expiresAt: { $gt: new Date() } }).populate('subjectId', 'name').lean();
    if (!session) return res.json({ active: false });

    // Check if already marked
    const alreadyMarked = session.markedStudents.some(s => String(s.studentId) === String(student._id));
    
    res.json({ active: true, sessionId: session._id, subjectName: session.subjectId?.name || 'Subject', alreadyMarked });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/live-session/mark', authMiddleware, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
  const { sessionId, passcode } = req.body;
  
  try {
    const student = await M.Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const session = await M.LiveSession.findById(sessionId);
    if (!session || !session.active || session.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Session is no longer active' });
    }

    // IP Check
    const settings = await M.Settings.findOne({ key: 'college_ips' });
    const allowed = settings ? settings.value : [];
    let isAllowed = allowed.length === 0; // if empty, allow all
    if (!isAllowed) {
       for (const ip of allowed) {
         if (req.ip.startsWith(ip) || (ip === '::1' && req.ip === '::1') || (ip === '127.0.0.1' && req.ip === '127.0.0.1') || req.ip.includes(ip)) {
           isAllowed = true; break;
         }
       }
    }
    if (!isAllowed) return res.status(403).json({ error: 'Must connect via College Wi-Fi' });

    // Passcode Check
    if (session.passcode !== passcode) {
      return res.status(400).json({ error: 'Incorrect Passcode' });
    }

    // Already marked?
    const alreadyMarked = session.markedStudents.some(s => String(s.studentId) === String(student._id));
    if (alreadyMarked) return res.json({ success: true, message: 'Already marked' });

    session.markedStudents.push({
      studentId: student._id,
      regNo: student.regNo,
      time: new Date(),
      ip: req.ip
    });
    await session.save();

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/live-session/status/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teachers only' });
  const session = await M.LiveSession.findOne({ _id: req.params.id, teacherId: req.user._id });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ active: session.active, expiresAt: session.expiresAt, markedStudents: session.markedStudents });
});

app.post('/api/live-session/end/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teachers only' });
  await M.LiveSession.findOneAndUpdate({ _id: req.params.id, teacherId: req.user._id }, { active: false });
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════
//  STUDENT PORTAL  — /api/student/me
// ════════════════════════════════════════════════════════

app.get('/api/student/me', authMiddleware, checkMaintenance, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });

    // ── User record
    const user = await M.User.findById(req.user._id).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ── Student profile — try userId first, fall back to regNo then name, auto-link if found
    let student = await M.Student.findOne({ userId: req.user._id }).lean();
    if (!student && user.regNo) {
      student = await M.Student.findOneAndUpdate(
        { regNo: user.regNo },
        { $set: { userId: req.user._id } },
        { new: true }
      ).lean();
    }
    if (!student) {
      student = await M.Student.findOneAndUpdate(
        { name: user.name },
        { $set: { userId: req.user._id } },
        { new: true }
      ).lean();
    }
    if (!student) {
      // No Student profile record at all — return user info with empty attendance so portal loads
      const academic2 = await M.Settings.findOne({ key: 'academic' });
      const minReq2 = academic2?.value?.minAttendance || 75;
      return res.json({
        user: { _id: user._id, name: user.name, username: user.username, email: user.email, lastLogin: user.lastLogin, loginCount: user.loginCount },
        student: { name: user.name, regNo: user.regNo || '—', deptName: user.deptName || '—', className: '—', year: '—', section: '—', academicYear: '—', courseType: '—', branch: '—', email: user.email || '—', bloodGroup: '—', parentContact: '—' },
        attendance: { subjects: [], totalPresent: 0, totalAbsent: 0, totalClasses: 0, overall: 0, minRequired: minReq2 },
      });
    }

    // ── Minimum attendance requirement
    const academic = await M.Settings.findOne({ key: 'academic' });
    const minRequired = academic?.value?.minAttendance || 75;

    // ── All attendance records for this student's class
    const allAttendance = await M.Attendance.find({ classId: student.classId }).lean();

    // ── Aggregate per subject
    const subjectMap = {}; // subjectId → { subjectName, teacherName, present, absent, dates[] }

    for (const rec of allAttendance) {
      const sid = String(rec.subjectId);
      if (!subjectMap[sid]) {
        subjectMap[sid] = {
          subjectId:   sid,
          subjectName: rec.subjectName || 'Unknown',
          teacherName: rec.teacherName || '—',
          present: 0,
          absent:  0,
          total:   0,
          dates:   [],
        };
      }
      const entry = subjectMap[sid];
      // Find this student's record in the attendance doc
      const myRecord = rec.records.find(r =>
        (r.studentId && String(r.studentId) === String(student._id)) ||
        (r.regNo && r.regNo === student.regNo)
      );
      if (myRecord) {
        entry.total++;
        if (myRecord.status === 'present') entry.present++;
        else entry.absent++;
        entry.dates.push({ date: rec.date, status: myRecord.status });
      }
    }

    const subjects = Object.values(subjectMap).map(s => ({
      ...s,
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
      dates: s.dates.sort((a, b) => a.date.localeCompare(b.date)),
    }));

    // ── Overall totals
    const totalPresent = subjects.reduce((n, s) => n + s.present, 0);
    const totalAbsent  = subjects.reduce((n, s) => n + s.absent,  0);
    const totalClasses = subjects.reduce((n, s) => n + s.total,   0);
    const overall      = totalClasses > 0 ? Math.round((totalPresent / totalClasses) * 100) : 0;

    res.json({
      user: { _id: user._id, name: user.name, username: user.username, email: user.email, lastLogin: user.lastLogin, loginCount: user.loginCount },
      student,
      attendance: {
        subjects,
        totalPresent,
        totalAbsent,
        totalClasses,
        overall,
        minRequired,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════
//  TOKEN SYSTEM — Helpers
// ════════════════════════════════════════════════════════

// HMAC sign attendance data for tamper detection
function signAttendanceData(payload) {
  const hmac = crypto.createHmac('sha256', cfg.HMAC_SECRET);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

// Check if token system is enabled (reads DB first, falls back to config)
async function isTokenSystemEnabled() {
  const setting = await M.Settings.findOne({ key: 'tokenSystem' });
  if (setting) return !!setting.value?.enabled;
  return !!cfg.TOKEN_SCHEMA.enabled;
}

// Get token config (merge DB overrides with config.js defaults)
function getTokenConfig() {
  return cfg.TOKEN_SCHEMA;
}

// Ensure a StudentToken record exists for a student, creating if needed
async function ensureTokenRecord(studentId, userId, student) {
  let record = await M.StudentToken.findOne({ userId });
  if (record) return record;

  const tc = getTokenConfig();
  // Determine semester from StudentUser or student record
  let sem = 'I';
  const stuUser = await M.StudentUser.findOne({ _id: userId }).lean()
    || await M.StudentUser.findOne({ username: (await M.User.findById(userId).lean())?.username }).lean();
  if (stuUser?.currentSem) sem = stuUser.currentSem;

  const isFirstSem = sem === 'I' || sem === '1';
  const initial = isFirstSem ? tc.initialTokens.sem1 : tc.initialTokens.sem2;

  record = await M.StudentToken.create({
    studentId, userId,
    regNo: student?.regNo || '',
    studentName: student?.name || '',
    className: student?.className || '',
    semester: sem,
    tokens: initial,
    maxTokens: tc.maxTokens,
    initialTokens: initial,
    history: [{
      action: 'init', feature: 'system', amount: initial,
      balance: initial, reason: `Initial allocation (Sem ${sem})`,
      date: new Date()
    }]
  });
  return record;
}

// Compute attendance data for a student (extracted from /api/student/me logic)
async function computeStudentAttendance(student) {
  const allAttendance = await M.Attendance.find({ classId: student.classId }).lean();
  const subjectMap = {};
  for (const rec of allAttendance) {
    const sid = String(rec.subjectId);
    if (!subjectMap[sid]) {
      subjectMap[sid] = {
        subjectId: sid, subjectName: rec.subjectName || 'Unknown',
        teacherName: rec.teacherName || '—',
        present: 0, absent: 0, total: 0, dates: [],
      };
    }
    const entry = subjectMap[sid];
    const myRecord = rec.records.find(r =>
      (r.studentId && String(r.studentId) === String(student._id)) ||
      (r.regNo && r.regNo === student.regNo)
    );
    if (myRecord) {
      entry.total++;
      if (myRecord.status === 'present') entry.present++;
      else entry.absent++;
      entry.dates.push({ date: rec.date, status: myRecord.status });
    }
  }
  // Lookup subject type (Theory/Lab) for each subject
  const subjectIds = Object.keys(subjectMap);
  const subjects = await M.Subject.find({ _id: { $in: subjectIds } }).lean();
  const typeMap = {};
  subjects.forEach(s => { typeMap[String(s._id)] = s.type || 'Theory'; });

  const subjectList = Object.values(subjectMap).map(s => ({
    ...s,
    type: typeMap[s.subjectId] || 'Theory',
    percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
    dates: s.dates.sort((a, b) => a.date.localeCompare(b.date)),
  }));

  const totalPresent = subjectList.reduce((n, s) => n + s.present, 0);
  const totalAbsent  = subjectList.reduce((n, s) => n + s.absent, 0);
  const totalClasses = subjectList.reduce((n, s) => n + s.total, 0);
  const overall      = totalClasses > 0 ? Math.round((totalPresent / totalClasses) * 100) : 0;

  return { subjects: subjectList, totalPresent, totalAbsent, totalClasses, overall };
}

// Get color indicator from percentage
function getColorIndicator(pct) {
  if (pct >= 90) return { color: 'green', emoji: '🟢', label: '90–100%' };
  if (pct >= 75) return { color: 'orange', emoji: '🟠', label: '75–89%' };
  return { color: 'red', emoji: '🔴', label: '< 75%' };
}

// Check if a cooldown is active
function isCooldownActive(until) {
  if (!until) return false;
  return new Date(until) > new Date();
}

// Calculate days remaining on a cooldown
function cooldownDaysLeft(until) {
  if (!until) return 0;
  const diff = new Date(until) - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
}

// ════════════════════════════════════════════════════════
//  TOKEN SYSTEM — Public check
// ════════════════════════════════════════════════════════

app.get('/api/settings/token-system', authMiddleware, async (req, res) => {
  const enabled = await isTokenSystemEnabled();
  res.json({ enabled, config: getTokenConfig() });
});

// ════════════════════════════════════════════════════════
//  TOKEN SYSTEM — Student endpoints
// ════════════════════════════════════════════════════════

// GET /api/student/token-status — token balance, cooldowns, blocks
app.get('/api/student/token-status', authMiddleware, checkMaintenance, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
    const enabled = await isTokenSystemEnabled();
    if (!enabled) return res.json({ enabled: false });

    const student = await M.Student.findOne({ userId: req.user._id }).lean()
      || await M.Student.findOne({ regNo: (await M.User.findById(req.user._id).lean())?.regNo }).lean();
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const tokenRec = await ensureTokenRecord(student._id, req.user._id, student);
    const tc = getTokenConfig();
    const now = new Date();

    // Build cooldown status
    const cooldownStatus = {};
    for (const key of ['overallColor','overallPercent','theory','lab']) {
      const until = tokenRec.cooldowns?.[key]?.until;
      cooldownStatus[key] = {
        active: isCooldownActive(until),
        until: until || null,
        daysLeft: cooldownDaysLeft(until),
      };
    }

    // Build block status
    const blockStatus = {
      overall: { active: isCooldownActive(tokenRec.blocks?.overall?.until), until: tokenRec.blocks?.overall?.until, daysLeft: cooldownDaysLeft(tokenRec.blocks?.overall?.until) },
      all: { active: isCooldownActive(tokenRec.blocks?.all?.until), until: tokenRec.blocks?.all?.until, daysLeft: cooldownDaysLeft(tokenRec.blocks?.all?.until) },
    };

    // Free check eligibility
    let freeCheckAvailable = false;
    if (!tokenRec.freeCheckUsed || (tokenRec.freeCheckAvailableAfter && now >= tokenRec.freeCheckAvailableAfter)) {
      // Check if attendance < 75%
      const att = await computeStudentAttendance(student);
      if (att.overall < tc.freeCheck.threshold) freeCheckAvailable = true;
    }

    res.json({
      enabled: true,
      tokens: tokenRec.tokens,
      maxTokens: tokenRec.maxTokens,
      semester: tokenRec.semester,
      costs: tc.costs,
      cooldowns: cooldownStatus,
      blocks: blockStatus,
      freeCheckAvailable,
      freeCheckAfter: tokenRec.freeCheckAvailableAfter,
      history: (tokenRec.history || []).slice(-20).reverse(),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/student/spend-token — spend tokens to unlock a view
app.post('/api/student/spend-token', authMiddleware, checkMaintenance, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
    const enabled = await isTokenSystemEnabled();
    if (!enabled) return res.status(400).json({ error: 'Token system not active' });

    const { feature, useFreeCheck } = req.body; // feature: 'overallColor','overallPercent','theory','lab'
    const tc = getTokenConfig();
    const validFeatures = ['overallColor','overallPercent','theory','lab'];
    if (!validFeatures.includes(feature)) return res.status(400).json({ error: 'Invalid feature' });

    const student = await M.Student.findOne({ userId: req.user._id }).lean()
      || await M.Student.findOne({ regNo: (await M.User.findById(req.user._id).lean())?.regNo }).lean();
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const tokenRec = await ensureTokenRecord(student._id, req.user._id, student);
    const now = new Date();

    // Check if ALL views are blocked (penalty)
    if (isCooldownActive(tokenRec.blocks?.all?.until)) {
      return res.status(403).json({ error: 'All attendance views are blocked', blockedUntil: tokenRec.blocks.all.until, daysLeft: cooldownDaysLeft(tokenRec.blocks.all.until) });
    }

    // Check if overall is blocked (for overall features)
    if ((feature === 'overallColor' || feature === 'overallPercent') && isCooldownActive(tokenRec.blocks?.overall?.until)) {
      return res.status(403).json({ error: 'Overall view is blocked', blockedUntil: tokenRec.blocks.overall.until, daysLeft: cooldownDaysLeft(tokenRec.blocks.overall.until) });
    }

    // Check if feature is on cooldown
    if (isCooldownActive(tokenRec.cooldowns?.[feature]?.until)) {
      return res.status(403).json({ error: `${feature} is on cooldown`, cooldownUntil: tokenRec.cooldowns[feature].until, daysLeft: cooldownDaysLeft(tokenRec.cooldowns[feature].until) });
    }

    // Check if blocked by another feature's cooldown (e.g. overallPercent blocks all)
    for (const [blocker, blockedFeatures] of Object.entries(tc.blocks)) {
      if (blockedFeatures.includes(feature) && isCooldownActive(tokenRec.cooldowns?.[blocker]?.until)) {
        return res.status(403).json({ error: `${feature} is blocked by ${blocker} cooldown`, cooldownUntil: tokenRec.cooldowns[blocker].until, daysLeft: cooldownDaysLeft(tokenRec.cooldowns[blocker].until) });
      }
    }

    // Handle free check for <75% students
    if (useFreeCheck && feature === 'overallColor') {
      const att = await computeStudentAttendance(student);
      if (att.overall < tc.freeCheck.threshold) {
        const canUseFree = !tokenRec.freeCheckUsed || (tokenRec.freeCheckAvailableAfter && now >= tokenRec.freeCheckAvailableAfter);
        if (canUseFree) {
          // Grant free check — no token deduction, set cooldown for free check
          const freeCheckNextAvail = new Date(now.getTime() + tc.freeCheck.cooldownDays * 86400000);
          await M.StudentToken.findByIdAndUpdate(tokenRec._id, {
            freeCheckUsed: true,
            freeCheckAvailableAfter: freeCheckNextAvail,
            [`lastCheck.${feature}`]: now,
            [`cooldowns.${feature}.until`]: new Date(now.getTime() + tc.cooldowns[feature] * 86400000),
            $push: { history: { action: 'free_check', feature, amount: 0, balance: tokenRec.tokens, reason: 'Free check (attendance < 75%)', date: now } }
          });
          // Return unlocked data
          const data = await computeStudentAttendance(student);
          const academic = await M.Settings.findOne({ key: 'academic' });
          const minRequired = academic?.value?.minAttendance || 75;
          const payload = { overall: data.overall, indicator: getColorIndicator(data.overall), feature, unlocked: true, minRequired };
          payload._sig = signAttendanceData(payload);
          return res.json(payload);
        }
      }
      return res.status(400).json({ error: 'Free check not available' });
    }

    // Check token balance
    const cost = tc.costs[feature];
    if (tokenRec.tokens < cost) {
      return res.status(400).json({ error: `Not enough tokens (need ${cost}, have ${tokenRec.tokens})`, cost, balance: tokenRec.tokens });
    }

    // Atomic spend: deduct tokens, set cooldown, set all blocked features
    const cooldownEnd = new Date(now.getTime() + tc.cooldowns[feature] * 86400000);
    const updateOps = {
      $inc: { tokens: -cost },
      $set: {
        [`lastCheck.${feature}`]: now,
        [`cooldowns.${feature}.until`]: cooldownEnd,
      },
      $push: {
        history: { action: 'spend', feature, amount: -cost, balance: tokenRec.tokens - cost, reason: `Viewed ${feature}`, date: now }
      }
    };

    // Set blocked features from this view's cooldown block list
    const blockedByThis = tc.blocks[feature] || [];
    for (const bf of blockedByThis) {
      if (bf !== feature) { // Already set above for the feature itself
        updateOps.$set[`cooldowns.${bf}.until`] = cooldownEnd;
      }
    }

    // Enforce min tokens
    const newBalance = tokenRec.tokens - cost;
    if (newBalance < tc.minTokens) {
      return res.status(400).json({ error: 'Token balance would go below minimum', balance: tokenRec.tokens });
    }

    await M.StudentToken.findByIdAndUpdate(tokenRec._id, updateOps);

    // Compute attendance data for the unlocked view
    const att = await computeStudentAttendance(student);
    const academic = await M.Settings.findOne({ key: 'academic' });
    const minRequired = academic?.value?.minAttendance || 75;
    let responsePayload = {};

    if (feature === 'overallColor') {
      responsePayload = {
        feature, unlocked: true, cost,
        overall: getColorIndicator(att.overall),
        minRequired, newBalance,
      };
    } else if (feature === 'overallPercent') {
      responsePayload = {
        feature, unlocked: true, cost,
        overall: att.overall,
        indicator: getColorIndicator(att.overall),
        totalPresent: att.totalPresent, totalAbsent: att.totalAbsent, totalClasses: att.totalClasses,
        minRequired, newBalance,
      };
      // Bonus check after overall percentage view
      const bonusCooldownActive = isCooldownActive(tokenRec.bonusCooldowns?.attendanceBonus?.until);
      if (!bonusCooldownActive) {
        let bonusTokens = 0, bonusReason = '';
        if (att.overall >= 95) { bonusTokens = tc.bonuses.attendance95.tokens; bonusReason = 'Attendance ≥ 95%'; }
        else if (att.overall >= 85) { bonusTokens = tc.bonuses.attendance85.tokens; bonusReason = 'Attendance ≥ 85%'; }
        if (bonusTokens > 0) {
          const capped = Math.min(newBalance + bonusTokens, tc.maxTokens);
          const actualBonus = capped - newBalance;
          if (actualBonus > 0) {
            const bonusCdEnd = new Date(now.getTime() + tc.bonuses.attendance95.cooldownDays * 86400000);
            await M.StudentToken.findByIdAndUpdate(tokenRec._id, {
              $inc: { tokens: actualBonus },
              $set: { 'bonusCooldowns.attendanceBonus.until': bonusCdEnd },
              $push: { history: { action: 'bonus', feature: 'attendanceBonus', amount: actualBonus, balance: capped, reason: bonusReason, date: now } }
            });
            responsePayload.bonus = { tokens: actualBonus, reason: bonusReason, newBalance: capped };
            // Create student notification for bonus
            await M.StudentNotification.create({
              studentId: student._id, userId: req.user._id, type: 'token-bonus',
              title: '🎉 Bonus Tokens!', message: `+${actualBonus} tokens for ${bonusReason}`,
            });
          }
        }
      }
    } else if (feature === 'theory') {
      responsePayload = {
        feature, unlocked: true, cost,
        subjects: att.subjects.filter(s => s.type === 'Theory').map(s => ({
          subjectName: s.subjectName, teacherName: s.teacherName,
          indicator: getColorIndicator(s.percentage), type: s.type,
        })),
        newBalance,
      };
    } else if (feature === 'lab') {
      responsePayload = {
        feature, unlocked: true, cost,
        subjects: att.subjects.filter(s => s.type === 'Lab').map(s => ({
          subjectName: s.subjectName, teacherName: s.teacherName,
          indicator: getColorIndicator(s.percentage), type: s.type,
        })),
        newBalance,
      };
    }

    responsePayload._sig = signAttendanceData(responsePayload);
    await logAction(req.user._id, req.user.name, 'student', 'Token Spent', `${feature} (-${cost} tokens, balance: ${newBalance})`, 'token', 'info', req.ip);
    res.json(responsePayload);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/student/attendance-view — token-gated attendance data
app.get('/api/student/attendance-view', authMiddleware, checkMaintenance, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });

    const student = await M.Student.findOne({ userId: req.user._id }).lean()
      || await M.Student.findOne({ regNo: (await M.User.findById(req.user._id).lean())?.regNo }).lean();
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const enabled = await isTokenSystemEnabled();
    const att = await computeStudentAttendance(student);
    const academic = await M.Settings.findOne({ key: 'academic' });
    const minRequired = academic?.value?.minAttendance || 75;

    if (!enabled) {
      // Token system off — return full data (existing behavior)
      const payload = {
        tokenSystem: false,
        subjects: att.subjects,
        totalPresent: att.totalPresent, totalAbsent: att.totalAbsent,
        totalClasses: att.totalClasses, overall: att.overall, minRequired,
      };
      payload._sig = signAttendanceData(payload);
      return res.json(payload);
    }

    // Token system on — return color-only by default
    const tokenRec = await ensureTokenRecord(student._id, req.user._id, student);

    const payload = {
      tokenSystem: true,
      // Always free: color-based overall
      overallIndicator: getColorIndicator(att.overall),
      // Subject-wise color indicators (always free)
      subjects: att.subjects.map(s => ({
        subjectId: s.subjectId, subjectName: s.subjectName,
        teacherName: s.teacherName, type: s.type,
        indicator: getColorIndicator(s.percentage),
        // Only include detailed data if not on active cooldown
      })),
      tokens: tokenRec.tokens,
      minRequired,
    };
    payload._sig = signAttendanceData(payload);
    res.json(payload);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  LEAVE REQUESTS — Student endpoints
// ════════════════════════════════════════════════════════

// POST /api/student/leave/apply — apply for leave
app.post('/api/student/leave/apply', authMiddleware, checkMaintenance, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });

    const { leaveDate, reason } = req.body;
    if (!leaveDate || !reason) return res.status(400).json({ error: 'leaveDate and reason required' });

    const student = await M.Student.findOne({ userId: req.user._id }).lean()
      || await M.Student.findOne({ regNo: (await M.User.findById(req.user._id).lean())?.regNo }).lean();
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    // Check if already applied for this date
    const existingLeave = await M.LeaveRequest.findOne({ userId: req.user._id, leaveDate });
    if (existingLeave) return res.status(409).json({ error: 'Leave already applied for this date' });

    // Find class advisor from StudentUser schema
    const stuUser = await M.StudentUser.findOne({
      $or: [{ _id: req.user._id }, { username: (await M.User.findById(req.user._id).lean())?.username }]
    }).lean();

    let advisorId = stuUser?.classAdvisorId || null;
    let advisorName = stuUser?.classAdvisorName || '';

    // Fallback: find class advisor from User collection
    if (!advisorId) {
      const advisor = await M.User.findOne({ isClassAdvisor: true, advisorClassName: student.className, active: true }).lean();
      if (advisor) { advisorId = advisor._id; advisorName = advisor.name; }
    }

    const leave = await M.LeaveRequest.create({
      studentId: student._id, userId: req.user._id,
      studentName: student.name, regNo: student.regNo,
      classId: student.classId, className: student.className,
      leaveDate, reason,
      teacherId: advisorId, teacherName: advisorName,
    });

    // Token penalty for applying leave (if token system enabled)
    const enabled = await isTokenSystemEnabled();
    if (enabled) {
      const tc = getTokenConfig();
      const tokenRec = await ensureTokenRecord(student._id, req.user._id, student);
      const penalty = tc.penalties.applyLeave;
      const deduction = Math.min(penalty.tokens, tokenRec.tokens); // Don't go below 0
      const blockUntil = new Date(Date.now() + penalty.blockOverallDays * 86400000);

      await M.StudentToken.findByIdAndUpdate(tokenRec._id, {
        $inc: { tokens: -deduction },
        $set: { 'blocks.overall.until': blockUntil },
        $push: {
          history: { action: 'penalty', feature: 'applyLeave', amount: -deduction, balance: tokenRec.tokens - deduction, reason: `Leave application (${leaveDate})`, date: new Date() }
        }
      });

      // Notify student about token deduction
      await M.StudentNotification.create({
        studentId: student._id, userId: req.user._id, type: 'token-penalty',
        title: '📝 Leave Applied — Token Deducted',
        message: `-${deduction} tokens for leave application. Overall view blocked for ${penalty.blockOverallDays} days.`,
      });
    }

    // Notify class advisor (via existing Notification system)
    if (advisorId) {
      await M.Notification.create({
        type: 'request', from: student.name, fromRole: 'Student',
        toTeacherId: advisorId, toTeacherName: advisorName,
        message: `[Leave Request] ${student.name} (${student.regNo}) requests leave on ${leaveDate}. Reason: ${reason.slice(0, 120)}`,
        priority: 'Normal',
      });
    }

    await logAction(req.user._id, req.user.name, 'student', 'Leave Applied', `Date: ${leaveDate}`, 'leave', 'info', req.ip);
    res.status(201).json(leave);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/student/leave/history — student's own leave requests
app.get('/api/student/leave/history', authMiddleware, checkMaintenance, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
    const leaves = await M.LeaveRequest.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(leaves);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  STUDENT NOTIFICATIONS
// ════════════════════════════════════════════════════════

app.get('/api/student/notifications', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
    const notifs = await M.StudentNotification.find({ userId: req.user._id }).sort({ time: -1 }).limit(30).lean();
    const unread = await M.StudentNotification.countDocuments({ userId: req.user._id, read: false });
    res.json({ notifications: notifs, unreadCount: unread });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/student/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
    await M.StudentNotification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { read: true });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/student/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
    await M.StudentNotification.updateMany({ userId: req.user._id, read: false }, { read: true });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  LEAVE REQUESTS — Teacher endpoints
// ════════════════════════════════════════════════════════

app.get('/api/teacher/leave-requests', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({ error: 'Teachers/admin only' });
    const filter = {};
    if (req.user.role === 'teacher') filter.teacherId = req.user._id;
    if (req.query.status) filter.status = req.query.status;
    const leaves = await M.LeaveRequest.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    const pendingCount = await M.LeaveRequest.countDocuments({ ...filter, status: 'Pending' });
    res.json({ leaves, pendingCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/teacher/leave-requests/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({ error: 'Teachers/admin only' });

    const { status, note } = req.body; // 'Approved' or 'Rejected'
    if (!['Approved','Rejected'].includes(status)) return res.status(400).json({ error: 'Status must be Approved or Rejected' });

    const leave = await M.LeaveRequest.findByIdAndUpdate(req.params.id, {
      status, teacherNote: note || '', reviewedAt: new Date(),
      teacherId: req.user._id, teacherName: req.user.name,
    }, { new: true });

    if (!leave) return res.status(404).json({ error: 'Leave request not found' });

    // Notify student about the decision
    const emoji = status === 'Approved' ? '✅' : '❌';
    await M.StudentNotification.create({
      studentId: leave.studentId, userId: leave.userId,
      type: 'leave-response',
      title: `${emoji} Leave ${status}`,
      message: `Your leave request for ${leave.leaveDate} has been ${status.toLowerCase()}${note ? '. Note: ' + note : ''}.`,
    });

    await logAction(req.user._id, req.user.name, req.user.role, `Leave ${status}`, `Student: ${leave.studentName} (${leave.leaveDate})`, 'leave', 'info', req.ip);
    res.json(leave);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  TOKEN MANAGEMENT — Admin endpoints
// ════════════════════════════════════════════════════════

app.put('/api/admin/token-system/toggle', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { enabled } = req.body;
    await M.Settings.findOneAndUpdate({ key: 'tokenSystem' }, { value: { enabled: !!enabled } }, { upsert: true });
    await logAction(req.user._id, req.user.name, req.user.role, 'Token System ' + (enabled ? 'Enabled' : 'Disabled'), '', 'settings', 'warning', req.ip);
    res.json({ enabled: !!enabled });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/token-management', authMiddleware, adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.search) {
      const re = new RegExp(req.query.search, 'i');
      filter.$or = [{ studentName: re }, { regNo: re }, { className: re }];
    }
    const records = await M.StudentToken.find(filter).sort({ studentName: 1 }).limit(200).lean();
    const enabled = await isTokenSystemEnabled();
    res.json({ enabled, records, config: getTokenConfig() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/token-management/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { tokens, reason, resetCooldowns, resetBlocks } = req.body;
    const record = await M.StudentToken.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Token record not found' });

    const tc = getTokenConfig();
    const updates = {};
    const historyEntry = {
      action: 'admin_adjust', feature: 'admin',
      amount: 0, balance: record.tokens,
      reason: reason || 'Admin adjustment', date: new Date()
    };

    if (tokens !== undefined) {
      const newBalance = Math.max(tc.minTokens, Math.min(tc.maxTokens, Number(tokens)));
      historyEntry.amount = newBalance - record.tokens;
      historyEntry.balance = newBalance;
      updates.tokens = newBalance;
    }

    if (resetCooldowns) {
      updates['cooldowns.overallColor.until'] = null;
      updates['cooldowns.overallPercent.until'] = null;
      updates['cooldowns.theory.until'] = null;
      updates['cooldowns.lab.until'] = null;
    }

    if (resetBlocks) {
      updates['blocks.overall.until'] = null;
      updates['blocks.all.until'] = null;
      updates.curBlocked = [];
    }

    await M.StudentToken.findByIdAndUpdate(req.params.id, { $set: updates, $push: { history: historyEntry } });

    // Notify student
    await M.StudentNotification.create({
      studentId: record.studentId, userId: record.userId, type: 'info',
      title: '🔧 Token Adjustment',
      message: `Your tokens were adjusted by admin. ${reason || ''}`,
    });

    await logAction(req.user._id, req.user.name, req.user.role, 'Token Adjusted', `Student: ${record.studentName}, Amount: ${historyEntry.amount}`, 'token', 'info', req.ip);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin grant emergency leave (no penalty)
app.post('/api/admin/emergency-leave', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { studentUserId, leaveDate, reason } = req.body;
    if (!studentUserId || !leaveDate) return res.status(400).json({ error: 'studentUserId and leaveDate required' });

    const user = await M.User.findById(studentUserId).lean();
    const student = await M.Student.findOne({ userId: studentUserId }).lean()
      || await M.Student.findOne({ regNo: user?.regNo }).lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const leave = await M.LeaveRequest.create({
      studentId: student._id, userId: studentUserId,
      studentName: student.name, regNo: student.regNo,
      classId: student.classId, className: student.className,
      leaveDate, reason: reason || 'Emergency leave (admin granted)',
      status: 'Approved', isEmergency: true,
      teacherId: req.user._id, teacherName: req.user.name,
      reviewedAt: new Date(),
    });

    await M.StudentNotification.create({
      studentId: student._id, userId: studentUserId, type: 'info',
      title: '🏥 Emergency Leave Granted',
      message: `Emergency leave for ${leaveDate} has been granted by admin. No token penalty applied.`,
    });

    await logAction(req.user._id, req.user.name, req.user.role, 'Emergency Leave Granted', `Student: ${student.name}, Date: ${leaveDate}`, 'leave', 'info', req.ip);
    res.status(201).json(leave);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  UNAUTHORIZED ABSENCE DETECTION (called after attendance is marked)
// ════════════════════════════════════════════════════════

// This runs as a background task after attendance is saved
async function checkUnauthorizedAbsences(classId, date, className) {
  try {
    const enabled = await isTokenSystemEnabled();
    if (!enabled) return;

    const tc = getTokenConfig();

    // Get all attendance records for this class on this date
    const dayRecords = await M.Attendance.find({ classId, date }).lean();
    if (dayRecords.length === 0) return;

    // Get all students in this class
    const students = await M.Student.find({ classId }).lean();

    // For each student, check if they were absent for ALL classes on this date
    for (const student of students) {
      let totalClassesToday = 0, absentCount = 0;
      for (const rec of dayRecords) {
        const myRecord = rec.records.find(r =>
          (r.studentId && String(r.studentId) === String(student._id)) ||
          (r.regNo && r.regNo === student.regNo)
        );
        if (myRecord) {
          totalClassesToday++;
          if (myRecord.status === 'absent') absentCount++;
        }
      }

      // Only flag if absent for ALL classes (full day absent)
      if (totalClassesToday > 0 && absentCount === totalClassesToday) {
        // Check if they have an approved leave request for this date
        const userId = student.userId || (await M.User.findOne({ regNo: student.regNo, role: 'student' }).lean())?._id;
        if (!userId) continue;

        const approvedLeave = await M.LeaveRequest.findOne({
          userId, leaveDate: date, status: 'Approved'
        });

        if (!approvedLeave) {
          // UNAUTHORIZED ABSENCE — apply penalty
          const tokenRec = await M.StudentToken.findOne({ userId });
          if (!tokenRec) continue;

          const penalty = tc.penalties.unauthorizedLeave;
          const deduction = Math.min(penalty.tokens, tokenRec.tokens);
          const blockUntil = new Date(Date.now() + penalty.blockAllDays * 86400000);

          await M.StudentToken.findByIdAndUpdate(tokenRec._id, {
            $inc: { tokens: -deduction },
            $set: { 'blocks.all.until': blockUntil },
            $push: {
              history: { action: 'penalty', feature: 'unauthorizedLeave', amount: -deduction, balance: tokenRec.tokens - deduction, reason: `Unauthorized absence on ${date}`, date: new Date() }
            }
          });

          // Notify student
          await M.StudentNotification.create({
            studentId: student._id, userId, type: 'unauthorized-absence',
            title: '🚨 Unauthorized Absence',
            message: `You were absent on ${date} without an approved leave request. Penalty: -${deduction} tokens, all views blocked for ${penalty.blockAllDays} days.`,
          });

          // Log
          await logAction(null, 'SYSTEM', 'system', 'Unauthorized Absence', `Student: ${student.name} (${student.regNo}) on ${date}`, 'token', 'warning');
        }
      }
    }

    // Notify class advisor about all unauthorized absences
    const unauthorizedStudents = [];
    for (const student of students) {
      let totalClassesToday = 0, absentCount = 0;
      for (const rec of dayRecords) {
        const myRecord = rec.records.find(r =>
          (r.studentId && String(r.studentId) === String(student._id)) ||
          (r.regNo && r.regNo === student.regNo)
        );
        if (myRecord) { totalClassesToday++; if (myRecord.status === 'absent') absentCount++; }
      }
      if (totalClassesToday > 0 && absentCount === totalClassesToday) {
        const userId = student.userId || (await M.User.findOne({ regNo: student.regNo, role: 'student' }).lean())?._id;
        if (userId) {
          const leave = await M.LeaveRequest.findOne({ userId, leaveDate: date, status: 'Approved' });
          if (!leave) unauthorizedStudents.push({ name: student.name, regNo: student.regNo });
        }
      }
    }

    if (unauthorizedStudents.length > 0) {
      // Find class advisor
      const cls = await M.Class.findById(classId).lean();
      const advisor = await M.User.findOne({ isClassAdvisor: true, advisorClassName: cls?.name, active: true }).lean();
      if (advisor) {
        const studentList = unauthorizedStudents.map(s => `${s.name} (${s.regNo})`).join(', ');
        await M.Notification.create({
          type: 'attendance-alert', from: 'SYSTEM', fromRole: 'System',
          toTeacherId: advisor._id, toTeacherName: advisor.name,
          message: `[Unauthorized Absence] ${unauthorizedStudents.length} student(s) were absent on ${date} in ${className || cls?.name || 'class'} without leave request: ${studentList.slice(0, 300)}`,
          priority: 'High',
        });
      }
    }
  } catch (err) {
    console.error('checkUnauthorizedAbsences error:', err.message);
  }
}

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

app.get('/api/timetable/section/:classId', authMiddleware, async (req,res) => {
  const doc = await M.SectionTimetable.findOne({ classId:req.params.classId }).lean();
  res.json(doc || { slots:{} });
});

app.put('/api/timetable/section/:classId/slot', authMiddleware, async (req,res) => {
  const u = req.user;

  if (!u.isTimeTableCoordinator && u.role !== 'admin')
    return res.status(403).json({ error:'TT Coordinator access required' });

  const { slotKey, payload, _meta } = req.body;

  if (_meta?.coordIsService && payload?.subjectId) {
    const subj = await M.Subject.findById(payload.subjectId).lean();
    if (subj && subj.deptId?.toString() !== _meta.coordDeptId)
      return res.status(403).json({ error:`Service coordinators may only assign ${u.TTdeptName} subjects` });
  }

  if (!_meta?.coordIsService && u.role !== 'admin') {
    const cls = await M.Class.findById(req.params.classId).lean();
    if (cls?.deptId?.toString() !== u.TTdeptName)
      return res.status(403).json({ error:'You can only edit timetables for your own department' });
  }

  const update = payload
    ? { $set:{ [`slots.${slotKey}`]:payload }, updatedBy:u.name }
    : { $unset:{ [`slots.${slotKey}`]:'' }, updatedBy:u.name };

  const doc = await M.SectionTimetable.findOneAndUpdate(
    { classId:req.params.classId },
    update,
    { upsert:true, new:true }
  );

  await logAction(u._id, u.name, u.role, 'TT Slot Updated', slotKey, 'data', 'info', req.ip);

  res.json(doc);
});

app.put('/api/timetable/section/:classId', authMiddleware, async (req,res) => {
  const u = req.user;

  if (!u.isTimeTableCoordinator && u.role !== 'admin')
    return res.status(403).json({ error:'TT Coordinator access required' });

  const { slots } = req.body;

  const doc = await M.SectionTimetable.findOneAndUpdate(
    { classId:req.params.classId },
    { slots, updatedBy:u.name },
    { upsert:true, new:true }
  );

  await logAction(u._id, u.name, u.role, 'TT Saved', req.params.classId, 'data', 'info', req.ip);

  res.json(doc);
});

app.post('/api/timetable/check-conflicts', authMiddleware, async (req,res) => {
  const { subjects } = req.body;

  const results = subjects.map(s => ({
    ok: true,
    message: `${s.name} — ${s.staff || 'TBA'} available (${s.hours} hrs/wk)`
  }));

  res.json(results);
});

app.post('/api/timetable/auto-gen', authMiddleware, async (req,res) => {
  res.json({ success:true });
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
  const subj = await M.Subject.findById(req.params.id).lean();
  if (subj) {
    await M.UndoLog.create({ collectionName: 'subjects', label: `Subject: ${subj.name} (${subj.code || ''})`,
      snapshot: subj, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10*24*60*60*1000) });
    await M.Subject.findByIdAndDelete(req.params.id);
  }
  await logAction(req.user._id, req.user.name, req.user.role, 'Subject Deleted', subj?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  ASSIGNMENTS
// ════════════════════════════════════════════════════════

app.get('/api/assignments', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.subjectId) filter.subjectId = req.query.subjectId;   // ← added
  if (req.query.teacherId)  filter.teacherId  = req.query.teacherId;
  else if (!req.query.subjectId && !req.query.classId && req.user.role === 'teacher')
    filter.teacherId = req.user._id;
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
app.post('/api/assignments/bulk', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { subjectId, assignments } = req.body;

    // ── Validation ──────────────────────────────────────────
    if (!subjectId)
      return res.status(400).json({ error: 'subjectId is required' });
    if (!Array.isArray(assignments) || assignments.length === 0)
      return res.status(400).json({ error: 'assignments[] must be a non-empty array' });

    // ── Validate each row has required fields ────────────────
    for (let i = 0; i < assignments.length; i++) {
      const { classId, teacherId, hallNo } = assignments[i];
      if (!classId || !teacherId || !hallNo)
        return res.status(400).json({ error: `Row ${i + 1}: classId, teacherId and hallNo are required` });
    }

    // ── Duplicate section check (same subject + class) ───────
    const classIds = assignments.map(a => a.classId);
    const uniqueIds = new Set(classIds);
    if (uniqueIds.size !== classIds.length)
      return res.status(409).json({ error: 'Duplicate section detected — each class must appear only once per subject' });

    // ── Replace: delete old assignments for this subject ─────
    const deleted = await M.Assignment.deleteMany({ subjectId });

    // ── Insert all new rows in one shot ──────────────────────
    const saved = await M.Assignment.insertMany(assignments);

    await logAction(
      req.user._id, req.user.name, req.user.role,
      'Assignments Bulk Saved',
      `${saved.length} section(s) for subject ${subjectId} (replaced ${deleted.deletedCount} old)`,
      'data', 'info', req.ip
    );

    res.status(201).json({ success: true, count: saved.length, data: saved });
  } catch (err) {
    console.error('Bulk assignment error:', err);
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/assignments/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.Assignment.findByIdAndDelete(req.params.id);
  await logAction(req.user._id, req.user.name, req.user.role, 'Assignment Removed', req.params.id, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  PROFILE  — own-profile GET / PUT (any authenticated role)
// ════════════════════════════════════════════════════════

// ── GET /api/profile/me — full own user document (no password) ──
app.get('/api/profile/me', authMiddleware, async (req, res) => {
  try {
    const user = await M.User.findById(req.user._id).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Build role-shaped profile view so frontends know exactly what to show
    const base = {
      _id:        user._id,
      role:       user.role,
      name:       user.name,
      username:   user.username,
      email:      user.email      || '',
      active:     user.active,
      // Session stats
      loginCount:  user.loginCount  || 0,
      lastLogin:   user.lastLogin   || null,
      firstLogin:  user.firstLogin  || null,
      mustChangePassword: user.mustChangePassword || false,
      createdAt:  user.createdAt,
      updatedAt:  user.updatedAt,
    };

    if (user.role === 'admin') {
      Object.assign(base, {
        // AdminSchema fields mapped from legacy UserSchema
        fullName:    user.name,
        firstName:   user.name.split(' ')[0]  || '',
        lastName:    user.name.split(' ').slice(1).join(' ') || '',
        employeeNo:  user.empId       || '',
        department:  user.dept        || '',
        isAdmin:     user.isAdmin !== false ? true : false,
        adminRights: user.adminRights || 'all',
      });
    } else if (user.role === 'teacher') {
      Object.assign(base, {
        // TeacherSchema fields
        fullName:    user.name,
        firstName:   user.name.split(' ')[0]  || '',
        lastName:    user.name.split(' ').slice(1).join(' ') || '',
        employeeNo:  user.empId       || '',
        department:  user.dept        || '',
        designation: user.desig       || 'Assistant Professor',
        // Display-only role flags
        isHod:       user.isHOD       || false,
        HoddeptName: user.HoddeptName || '',
        isClassAdvisor:  user.isClassAdvisor  || false,
        className:       user.advisorClassName || '',
        isTimeTableCoordinator: user.isTimeTableCoordinator || false,
        TTdeptName:      user.TTdeptName || '',
        isAdmin:         user.isAdmin   || false,
        adminRights:     user.adminRights || 'all',
      });
    } else if (user.role === 'student') {
      // Also pull Student record for academic fields
      const studentRec = await M.Student.findOne({ userId: user._id }).lean()
        || await M.Student.findOne({ regNo: user.regNo }).lean()
        || null;
      Object.assign(base, {
        // StudentUserSchema fields
        fullName:     user.name,
        firstName:    user.name.split(' ')[0]  || '',
        lastName:     user.name.split(' ').slice(1).join(' ') || '',
        registerNo:   user.regNo           || studentRec?.regNo  || '',
        class:        studentRec?.className || '',
        section:      studentRec?.section   || '',
        branch:       studentRec?.branch    || '',
        course:       studentRec?.courseType|| '',
        department:   studentRec?.deptName  || user.deptName || '',
        currentYear:  studentRec?.year      || '',
        academicYear: studentRec?.academicYear || '',
        // Display-only
        isRep:        user.isClassRep || false,
      });
    }

    res.json(base);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/profile/me — update own editable fields ──
//    Protected / display-only fields are stripped server-side
app.put('/api/profile/me', authMiddleware, async (req, res) => {
  try {
    const user = await M.User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fields users can NEVER self-edit (role flags, auth state, etc.)
    const ALWAYS_PROTECTED = [
      'role','isAdmin','adminRights',
      'isHOD','HoddeptName','isClassAdvisor','advisorClassName','advisorClassId',
      'isTimeTableCoordinator','TTdeptName',
      'isWarden','isExamCoordinator','isPlacementCoord',
      'isClassRep','isAssiClassRep','isSportsRep','isCulturalRep',
      'active','failedLogins','lockedUntil','loginCount','firstLogin',
      'lastLogin','mustChangePassword','password','username',
    ];

    const updates = { ...req.body };
    ALWAYS_PROTECTED.forEach(k => delete updates[k]);

    // Map friendly field names → UserSchema field names
    if (updates.fullName)    { updates.name    = updates.fullName;   delete updates.fullName; }
    if (updates.firstName || updates.lastName) {
      const fn = updates.firstName || user.name.split(' ')[0];
      const ln = updates.lastName  || user.name.split(' ').slice(1).join(' ');
      updates.name = (fn + ' ' + ln).trim();
      delete updates.firstName; delete updates.lastName;
    }
    if (updates.employeeNo)  { updates.empId   = updates.employeeNo; delete updates.employeeNo; }
    if (updates.department)  { updates.dept    = updates.department;  delete updates.department; }
    if (updates.designation) { updates.desig   = updates.designation; delete updates.designation; }

    Object.assign(user, updates);
    await user.save();

    await logAction(user._id, user.name, user.role, 'Profile Updated', 'Own profile self-edited', 'data', 'info', req.ip);
    const { password: _pw, ...safe } = user.toObject();
    res.json(safe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/profile/users — admin or Manage User right: list all users ──
app.get('/api/profile/users', authMiddleware, async (req, res) => {
  try {
    const reqUser = await M.User.findById(req.user._id).lean();
    const rights  = reqUser?.adminRights;
    const canManage = req.user.role === 'admin'
      || rights === 'all'
      || (Array.isArray(rights) && rights.includes('Manage User'));

    if (!canManage) return res.status(403).json({ error: 'Manage User right required' });

    const filter = {};
    if (req.query.role)   filter.role = req.query.role;
    if (req.query.search) {
      const re = new RegExp(req.query.search, 'i');
      filter.$or = [{ name: re }, { username: re }, { empId: re }, { email: re }, { regNo: re }, { dept: re }];
    }
    const users = await M.User.find(filter, '-password').sort({ role: 1, name: 1 }).lean();

    // For each user, attach firstLogin if available
    res.json(users.map(u => ({
      ...u,
      firstLogin: u.firstLogin || null,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/profile/users/:id — Manage User: edit any user ──
app.put('/api/profile/users/:id', authMiddleware, async (req, res) => {
  try {
    const reqUser = await M.User.findById(req.user._id).lean();
    const rights  = reqUser?.adminRights;
    const canManage = req.user.role === 'admin'
      || rights === 'all'
      || (Array.isArray(rights) && rights.includes('Manage User'));

    if (!canManage) return res.status(403).json({ error: 'Manage User right required' });

    const { password, ...data } = req.body;
    if (password) data.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);

    // Map friendly names back to schema fields
    if (data.fullName)    { data.name  = data.fullName;   delete data.fullName; }
    if (data.employeeNo)  { data.empId = data.employeeNo; delete data.employeeNo; }
    if (data.department)  { data.dept  = data.department; delete data.department; }
    if (data.designation) { data.desig = data.designation; delete data.designation; }
    if (data.firstName || data.lastName) {
      const target = await M.User.findById(req.params.id).lean();
      const fn = data.firstName || (target?.name || '').split(' ')[0];
      const ln = data.lastName  || (target?.name || '').split(' ').slice(1).join(' ');
      data.name = (fn + ' ' + ln).trim();
      delete data.firstName; delete data.lastName;
    }

    const user = await M.User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    await logAction(req.user._id, req.user.name, req.user.role, 'User Updated (Manage User)',
      `${user.name} (@${user.username})`, 'data', 'info', req.ip);
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ════════════════════════════════════════════════════════
//  USERS
// ════════════════════════════════════════════════════════

app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.search) {
    const re = new RegExp(req.query.search, 'i');
    filter.$or = [{ name: re }, { username: re }, { empId: re }, { email: re }, { regNo: re }, { dept: re }];
  }
  res.json(await M.User.find(filter, '-password').sort({ role: 1, name: 1 }));
});
app.put('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const isSelf   = String(req.user._id) === String(req.params.id);
    const isAdmin  = req.user.role === 'admin';
    // Check Manage User right for non-primary-admin teachers with adminRights
    const reqUser  = await M.User.findById(req.user._id).lean();
    const rights   = reqUser?.adminRights;
    const hasManageUser = rights === 'all' || (Array.isArray(rights) && rights.includes('Manage User'));
    const canEditOthers = isAdmin || hasManageUser;

    if (!isSelf && !canEditOthers) {
      return res.status(403).json({ error: 'Forbidden: cannot edit other users' });
    }

    const { password, ...data } = req.body;

    // Non-admins editing self: strip protected fields
    if (!canEditOthers && isSelf) {
      const PROTECTED = ['role','isAdmin','adminRights','isHOD','isClassAdvisor','isTimeTableCoordinator',
        'isClassRep','isAssiClassRep','isSportsRep','isCulturalRep','active','failedLogins','lockedUntil',
        'loginCount','firstLogin','lastLogin','mustChangePassword'];
      PROTECTED.forEach(k => delete data[k]);
    }

    if (password) data.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
    const user = await M.User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password');
    await logAction(req.user._id, req.user.name, req.user.role,
      isSelf ? 'Profile Updated' : 'User Updated', user?.name, 'data', 'info', req.ip);
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
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


// ════════════════════════════════════════════════════════
//  MAINTENANCE LOGS (dedicated endpoint)
// ════════════════════════════════════════════════════════
app.get('/api/logs/maintenance', authMiddleware, adminOnly, async (req, res) => {
  const logs = await M.Log.find({ category: 'maintenance' }).sort({ time: -1 }).limit(50);
  res.json(logs);
});

// ════════════════════════════════════════════════════════
//  SERVER INFO (for server logs panel in control)
// ════════════════════════════════════════════════════════
const _serverStartTime = new Date();
const _serverLogs = []; // In-memory ring buffer, max 200 lines

// Intercept console to capture server logs
const _origLog   = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn  = console.warn.bind(console);
function _captureLog(level, args) {
  const line = { time: new Date().toISOString(), level, text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') };
  _serverLogs.push(line);
  if (_serverLogs.length > 200) _serverLogs.shift();
}
console.log   = (...a) => { _captureLog('info',  a); _origLog(...a); };
console.error = (...a) => { _captureLog('error', a); _origError(...a); };
console.warn  = (...a) => { _captureLog('warn',  a); _origWarn(...a); };

app.get('/api/system/serverlogs', authMiddleware, adminOnly, (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : null;
  const logs = since ? _serverLogs.filter(l => new Date(l.time) > since) : _serverLogs.slice(-100);
  res.json({
    logs,
    uptime: Math.floor((Date.now() - _serverStartTime) / 1000),
    startTime: _serverStartTime.toISOString(),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development',
    memMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});


// ════════════════════════════════════════════════════════
//  SYSTEM HEALTH  (for Overview live stats)
// ════════════════════════════════════════════════════════
app.get('/api/system/health', authMiddleware, adminOnly, async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStateMap = { 0:'Disconnected', 1:'Connected', 2:'Connecting', 3:'Disconnecting' };
    const [errorCount, warnCount, totalUsers, activeTeachers] = await Promise.all([
      M.Log.countDocuments({ severity: { $in: ['critical','error'] } }),
      M.Log.countDocuments({ severity: 'warning' }),
      M.User.countDocuments({ active: true }),
      M.User.countDocuments({ role: 'teacher', active: true }),
    ]);
    const recentErrors = await M.Log.find({ severity: { $in: ['critical','error','warning'] } })
      .sort({ time: -1 }).limit(5).lean();
    res.json({
      dbStatus:      dbStateMap[dbState] || 'Unknown',
      dbConnected:   dbState === 1,
      serverUptime:  Math.floor(process.uptime()),
      errorCount, warnCount, totalUsers, activeTeachers, recentErrors,
      memoryMB:      (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
      nodeVersion:   process.version,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  UNDO LOG  (10-day restorable deletes)
// ════════════════════════════════════════════════════════
app.get('/api/undo', authMiddleware, adminOnly, async (req, res) => {
  try {
    const items = await M.UndoLog.find({ expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 }).limit(100).lean();
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/undo/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const entry = await M.UndoLog.findById(req.params.id).lean();
    if (!entry) return res.status(404).json({ error: 'Undo entry not found or expired' });
    const snap = entry.snapshot;
    const { _id, __v, createdAt, updatedAt, ...body } = snap;
    let restored;
    if      (entry.collectionName === 'departments') restored = await M.Department.create(body);
    else if (entry.collectionName === 'classes')     restored = await M.Class.create(body);
    else if (entry.collectionName === 'subjects')    restored = await M.Subject.create(body);
    else if (entry.collectionName === 'students')    restored = await M.Student.create(body);
    else if (entry.collectionName === 'teachers')    restored = await M.User.create(snap);
    else return res.status(400).json({ error: 'Cannot restore collection: ' + entry.collectionName });
    await M.UndoLog.findByIdAndDelete(req.params.id);
    await logAction(req.user._id, req.user.name, req.user.role, 'Undo Restore', entry.label, 'data', 'info', req.ip);
    res.json({ restored: true, label: entry.label });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/undo/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.UndoLog.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  BACKUP  (full DB snapshot — GDrive upload stub)
// ════════════════════════════════════════════════════════
app.post('/api/system/backup', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [students, teachers, departments, classes, subjects, attendance, assignments] = await Promise.all([
      M.Student.find().lean(),
      M.User.find({ role: 'teacher' }, '-password').lean(),
      M.Department.find().lean(),
      M.Class.find().lean(),
      M.Subject.find().lean(),
      M.Attendance.find().lean(),
      M.Assignment.find().lean(),
    ]);
    const totalDocs = students.length + teachers.length + departments.length
                    + classes.length + subjects.length + attendance.length + assignments.length;
    const backupPayload = {
      meta: { createdAt: new Date().toISOString(), createdBy: req.user.name, totalDocs },
      students, teachers, departments, classes, subjects, attendance, assignments
    };
    const backupPassword = crypto.randomBytes(6).toString('hex').toUpperCase();
    // ─── Stubs (wire these when ready) ──────────────────
    // await uploadToGDrive('backupfolder', backupPassword, JSON.stringify(backupPayload));
    // await sendMail('mainMail', backupPassword, 'EAMS Backup Password', `Your backup password is: ${backupPassword}`);
    // ────────────────────────────────────────────────────
    await logAction(req.user._id, req.user.name, req.user.role, 'System Backup Created',
      `${totalDocs} docs — GDrive upload pending`, 'data', 'info', req.ip);
    res.json({ ok: true, totalDocs, backupPassword, createdAt: backupPayload.meta.createdAt,
      collections: { students: students.length, teachers: teachers.length, departments: departments.length,
        classes: classes.length, subjects: subjects.length, attendance: attendance.length, assignments: assignments.length }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/system/backup/history', authMiddleware, adminOnly, async (req, res) => {
  try {
    const logs = await M.Log.find({ action: 'System Backup Created' }).sort({ time: -1 }).limit(20).lean();
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  EXPORT DATA  (password-protected, email stub)
// ════════════════════════════════════════════════════════
app.post('/api/system/export', authMiddleware, adminOnly, async (req, res) => {
  try {
    const type = req.body.type || 'all';
    const studentCount = await M.Student.countDocuments();
    let payload;
    if (type === 'all') {
      const [students, teachers, departments, classes, subjects, attendance, assignments] = await Promise.all([
        M.Student.find().lean(), M.User.find({ role:'teacher' }, '-password').lean(),
        M.Department.find().lean(), M.Class.find().lean(), M.Subject.find().lean(),
        M.Attendance.find().lean(), M.Assignment.find().lean(),
      ]);
      payload = { meta: { exportedAt: new Date().toISOString(), exportedBy: req.user.name,
          type, totalStudents: studentCount }, students, teachers, departments, classes, subjects, attendance, assignments };
    } else {
      const dataMap = {
        students:   () => M.Student.find().lean(),
        teachers:   () => M.User.find({ role:'teacher' }, '-password').lean(),
        attendance: () => M.Attendance.find().lean(),
      };
      const data = dataMap[type] ? await dataMap[type]() : [];
      payload = { meta: { exportedAt: new Date().toISOString(), exportedBy: req.user.name,
          type, totalStudents: studentCount }, data };
    }
    const exportPassword = crypto.randomBytes(6).toString('hex').toUpperCase();
    // ─── Stub (wire when ready) ──────────────────────────
    // await exportMail(req.user.email || 'admin', exportPassword, JSON.stringify(payload));
    // ────────────────────────────────────────────────────
    await logAction(req.user._id, req.user.name, req.user.role, 'Data Exported',
      `Type: ${type} — password mailed (stub)`, 'data', 'info', req.ip);
    res.json({ ok: true, payload, exportPassword, totalStudents: studentCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Start Server ──────────────────────────────────────
const PORT = process.env.PORT || cfg.PORT;
app.listen(PORT, () => {
  console.log(`1/3 : 🚀 EAMS API running → http://localhost:${PORT}`);
  console.log(`2/3 :    Environment: ${cfg.NODE_ENV}`);
});