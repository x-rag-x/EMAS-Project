// ═══════════════════════════════════════════════════════
//  EAMS — Node.js / Express API Server
//  Run: node server.js
//  Install: npm install express mongoose bcryptjs jsonwebtoken cors dotenv multer xlsx
// ═══════════════════════════════════════════════════════

const express    = require('express');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const multer     = require('multer');
const XLSX       = require('xlsx');
const cfg        = require('./config');
const M          = require('./models');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });

// ── Middleware ────────────────────────────────────────
app.use(cors({ origin: cfg.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.static('../'));   // serve index.html, admin.html, teacher.html

// ── MongoDB Connection ────────────────────────────────
mongoose.connect(cfg.MONGO_URI, { dbName: cfg.DB_NAME })
  .then(() => {
    console.log(`✅ MongoDB connected → ${cfg.DB_NAME}`);
    seedDefaultAdmin();
  })
  .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

// ── Seed Default Admin ────────────────────────────────
async function seedDefaultAdmin() {
  const exists = await M.User.findOne({ role: 'admin' });
  if (!exists) {
    const hash = await bcrypt.hash('admin123', cfg.BCRYPT_ROUNDS);
    await M.User.create({ name: 'Administrator', username: 'admin', password: hash, role: 'admin' });
    console.log('🌱 Default admin seeded (admin / admin123)');
  }
}

// ── Auth Middleware ───────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, cfg.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role)
      return res.status(400).json({ error: 'username, password and role required' });

    const user = await M.User.findOne({ username: username.toLowerCase(), role, active: true });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { _id: user._id, name: user.name, username: user.username, role: user.role,
        dept: user.dept, empId: user.empId, desig: user.desig },
      cfg.JWT_SECRET,
      { expiresIn: cfg.JWT_EXPIRES_IN }
    );

    await M.Log.create({ userId: user._id, userName: user.name, role: user.role,
      action: 'Login', details: `${role} logged in`, ip: req.ip });

    res.json({ token, user: { _id: user._id, name: user.name, role: user.role,
      dept: user.dept, empId: user.empId, desig: user.desig, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await M.User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password incorrect' });
    user.password = await bcrypt.hash(newPassword, cfg.BCRYPT_ROUNDS);
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    res.status(201).json(dept);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/departments/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const dept = await M.Department.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(dept);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/departments/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.Department.findByIdAndDelete(req.params.id);
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
    res.status(201).json(cls);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/classes/:id', authMiddleware, adminOnly, async (req, res) => {
  const cls = await M.Class.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(cls);
});

app.delete('/api/classes/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.Class.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  STUDENTS
// ════════════════════════════════════════════════════════

app.get('/api/students', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.deptId)   filter.deptId   = req.query.deptId;
  if (req.query.classId)  filter.classId  = req.query.classId;
  if (req.query.section)  filter.section  = req.query.section;
  const students = await M.Student.find(filter).sort({ name: 1 });
  res.json(students);
});

app.get('/api/students/count', authMiddleware, async (req, res) => {
  res.json({ count: await M.Student.countDocuments() });
});

app.post('/api/students', authMiddleware, adminOnly, async (req, res) => {
  try {
    const stu = await M.Student.create(req.body);
    res.status(201).json(stu);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/students/:id', authMiddleware, adminOnly, async (req, res) => {
  const stu = await M.Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(stu);
});

app.delete('/api/students/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.Student.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

// ── Bulk Upload Students (CSV/Excel) ─────────────────
app.post('/api/students/bulk-upload', authMiddleware, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const workbook  = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows      = XLSX.utils.sheet_to_json(worksheet);

    const VALID_COURSE_TYPES = ['UG','PG','M.E','M.TECH','MBA','MCA','B.E','B.TECH','BE','BTECH'];
    let added = 0, skipped = 0, errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i];
      const rowNum = i + 2;
      const cv     = (keys) => { for (const k of keys) { const found = Object.keys(row).find(r => r.toLowerCase().replace(/\s/g,'').includes(k.toLowerCase())); if (found) return String(row[found]).trim(); } return ''; };

      const name       = cv(['fullname','name','studentname']);
      const regNo      = cv(['registerno','regno','rollno']);
      const acadYear   = cv(['academicyear','academicyr','ay']) || '2025-26';
      const courseType = cv(['coursetype','course']).toUpperCase() || 'UG';
      const branch     = cv(['branch']);
      const deptName   = cv(['department','dept']);
      const yearStr    = cv(['year','studyyear','yr']);
      const className  = cv(['class','classname']);
      const section    = cv(['section','sec']) || 'A';
      const email      = cv(['email','mail']);
      const username   = cv(['username','user']);
      const password   = cv(['password','pass']) || 'Student@123';

      const rowErrors = [];
      if (!name)   rowErrors.push('FullName missing');
      if (!regNo)  rowErrors.push('RegisterNo missing');
      if (!deptName) rowErrors.push('Department missing');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErrors.push('Invalid email');
      if (VALID_COURSE_TYPES.indexOf(courseType) === -1) rowErrors.push(`CourseType "${courseType}" unknown`);
      if (await M.Student.findOne({ regNo })) rowErrors.push(`RegisterNo ${regNo} already exists`);
      if (username && await M.User.findOne({ username: username.toLowerCase() })) rowErrors.push(`Username "${username}" taken`);

      if (rowErrors.length) { skipped++; errors.push({ row: rowNum, name: name||'(blank)', issues: rowErrors }); continue; }

      const dept = await M.Department.findOne({ $or: [{ name: new RegExp(deptName, 'i') }, { code: new RegExp(deptName, 'i') }] });
      const cls  = await M.Class.findOne({ name: className }).lean();

      const stu = await M.Student.create({
        name, regNo, academicYear: acadYear, courseType, branch,
        deptId: dept?._id, deptName: dept?.name || deptName,
        classId: cls?._id, className: cls?.name || className,
        year: yearStr, section, email,
      });

      if (username) {
        const hash = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
        await M.User.create({ name, username: username.toLowerCase(), password: hash,
          role: 'student', regNo, deptName: dept?.name || deptName, email });
      }
      added++;
    }

    res.json({
      added, skipped, total: rows.length,
      errors: errors.slice(0, 20),
      message: `Import complete: ${added} added, ${skipped} skipped`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════
//  TEACHERS (via Users collection)
// ════════════════════════════════════════════════════════

app.get('/api/teachers', authMiddleware, async (req, res) => {
  const teachers = await M.User.find({ role: 'teacher', active: true }, '-password').sort({ name: 1 });
  res.json(teachers);
});

app.post('/api/teachers', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, empId, dept, desig, username, password, email } = req.body;
    if (!name || !username || !password)
      return res.status(400).json({ error: 'name, username, password required' });
    const hash = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
    const teacher = await M.User.create({ name, empId, dept, desig, username: username.toLowerCase(),
      password: hash, role: 'teacher', email });
    const { password: _, ...teacherData } = teacher.toObject();
    res.status(201).json(teacherData);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/teachers/:id', authMiddleware, adminOnly, async (req, res) => {
  const { password, ...data } = req.body;
  if (password) data.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
  const teacher = await M.User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password');
  res.json(teacher);
});

app.delete('/api/teachers/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.User.findByIdAndUpdate(req.params.id, { active: false });
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
  if (req.query.from && req.query.to)
    filter.date = { $gte: req.query.from, $lte: req.query.to };
  const records = await M.Attendance.find(filter).sort({ date: -1 }).limit(500);
  res.json(records);
});

app.post('/api/attendance', authMiddleware, async (req, res) => {
  try {
    const existing = await M.Attendance.findOne({
      teacherId: req.body.teacherId, classId: req.body.classId,
      subjectId: req.body.subjectId, date: req.body.date
    });
    if (existing) {
      const updated = await M.Attendance.findByIdAndUpdate(existing._id, req.body, { new: true });
      return res.json(updated);
    }
    const record = await M.Attendance.create(req.body);
    await M.Log.create({ userId: req.user._id, userName: req.user.name, role: req.user.role,
      action: 'Attendance Marked', details: `${req.body.className} on ${req.body.date}` });
    res.status(201).json(record);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// GET /api/attendance/unmarked-teachers  — teachers who haven't marked this week
app.get('/api/attendance/unmarked-teachers', authMiddleware, adminOnly, async (req, res) => {
  const today   = new Date();
  const monday  = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  const assignments = await M.Assignment.find().lean();
  const attendance  = await M.Attendance.find({ date: { $in: weekDates } }).lean();
  const unmarked    = [];

  for (const a of assignments) {
    const markedDates = attendance
      .filter(att => String(att.teacherId) === String(a.teacherId)
                  && String(att.classId)   === String(a.classId)
                  && String(att.subjectId) === String(a.subjectId))
      .map(att => att.date);
    const missingDays = weekDates.filter(d => !markedDates.includes(d));
    if (missingDays.length > 0)
      unmarked.push({ ...a, missingDays, missingCount: missingDays.length });
  }
  res.json(unmarked);
});

// ════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ════════════════════════════════════════════════════════

app.get('/api/notifications', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.user.role === 'teacher') {
    filter.$or = [{ toTeacherId: req.user._id }, { toTeacherId: null, type: { $ne: 'attendance-alert' } }];
  }
  const notifs = await M.Notification.find(filter).sort({ time: -1 }).limit(50);
  res.json(notifs);
});

app.post('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const notif = await M.Notification.create(req.body);
    res.status(201).json(notif);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/notifications/:id', authMiddleware, async (req, res) => {
  const notif = await M.Notification.findByIdAndUpdate(req.params.id, req.body, { new: true });
  // If solving, also update grievance
  if (req.body.status === 'Solved' && notif?.grievanceId) {
    await M.Grievance.findByIdAndUpdate(notif.grievanceId,
      { status: 'Resolved', resolvedAt: new Date(), resolvedBy: req.user.name });
  }
  if (req.body.status === 'Cancelled' && notif?.grievanceId) {
    await M.Grievance.findByIdAndUpdate(notif.grievanceId,
      { status: 'Cancelled', cancelledAt: new Date() });
  }
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
    const grievance = await M.Grievance.create({
      ...req.body, teacherId: req.user._id, teacherName: req.user.name
    });
    // Auto-create notification for admin
    await M.Notification.create({
      type: 'request', from: req.user.name, fromRole: 'Teacher',
      message: `[Grievance] ${req.body.subject} — ${req.body.detail.slice(0, 100)}`,
      time: new Date(), priority: 'Normal', grievanceId: grievance._id
    });
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
  const logs = await M.Log.find().sort({ time: -1 }).limit(200);
  res.json(logs);
});

// ════════════════════════════════════════════════════════
//  DASHBOARD SUMMARY  (single call for auto-load Fix 3)
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
    res.status(201).json(subj);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/subjects/:id', authMiddleware, adminOnly, async (req, res) => {
  const subj = await M.Subject.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(subj);
});

app.delete('/api/subjects/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.Subject.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  ASSIGNMENTS (Teacher ↔ Class ↔ Subject)
// ════════════════════════════════════════════════════════

app.get('/api/assignments', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.teacherId) filter.teacherId = req.query.teacherId;
  else if (req.user.role === 'teacher') filter.teacherId = req.user._id;
  if (req.query.classId)   filter.classId   = req.query.classId;
  res.json(await M.Assignment.find(filter).sort({ teacherName: 1 }));
});

app.post('/api/assignments', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Prevent duplicate assignments
    const existing = await M.Assignment.findOne({
      teacherId: req.body.teacherId,
      classId:   req.body.classId,
      subjectId: req.body.subjectId
    });
    if (existing) return res.status(409).json({ error: 'Assignment already exists' });
    const asgn = await M.Assignment.create(req.body);
    res.status(201).json(asgn);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/assignments/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.Assignment.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  USERS (admin management — no passwords returned)
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
  res.json(user);
});

app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.User.findByIdAndUpdate(req.params.id, { active: false });
  res.json({ deleted: true });
});

// Alias: /api/depts → /api/departments (frontend uses 'depts' collection)
app.get('/api/depts', authMiddleware, async (req, res) => {
  res.json(await M.Department.find().sort({ name: 1 }));
});
app.post('/api/depts', authMiddleware, adminOnly, async (req, res) => {
  try { res.status(201).json(await M.Department.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/depts/:id', authMiddleware, adminOnly, async (req, res) => {
  res.json(await M.Department.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});
app.delete('/api/depts/:id', authMiddleware, adminOnly, async (req, res) => {
  await M.Department.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

// ── Start Server ──────────────────────────────────────
app.listen(cfg.PORT, () => {
  console.log(`🚀 EAMS API running → http://localhost:${cfg.PORT}`);
  console.log(`   Environment: ${cfg.NODE_ENV}`);
});
