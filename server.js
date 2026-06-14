// ═══════════════════════════════════════════════════════
//  EAMS — Node.js / Express API Server
// ═══════════════════════════════════════════════════════
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const M = require('./models');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ── Helper: resolve role-specific Mongoose model ──────
function getRoleModel(role) {
  switch (role) {
    case 'admin':   return M.Admin;
    case 'teacher': return M.Teacher;
    case 'student': return M.Student;
    default:        return null;
  }
}

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
  // Seed admin account (first-boot only) → both M.Admin and M.User
  const adminExists = await M.Admin.findOne({ username: 'admin' });
  if (!adminExists) {
    const hash = await bcrypt.hash(cfg.ADMIN_PASSWORD, cfg.BCRYPT_ROUNDS);
    await M.Admin.create({ fullName: 'Administrator', firstName: 'Admin', lastName: '', username: 'admin', password: hash, trackId: 'TRADMIN001', isAdmin: true, adminRights: 'all', active: true, mustChangePassword: true });
    // Shadow entry in legacy User for session tracking
    const userExists = await M.User.findOne({ username: 'admin' });
    if (!userExists) await M.User.create({ name: 'Administrator', username: 'admin', password: hash, role: 'admin', trackId: 'TRADMIN001', status: 'active' });
    console.log('✅ Default admin account created');
  }

  // ── Settings defaults — 5 card-grouped keys + 3 internal keys ──────────────
  // card enum: 'Institution Details' | 'Settings' | 'Academic Settings' | 'Password Policy' 
  const defaults = [

    // ── card: Institution Details ────────────────────────────────────────────
    {
      card: 'Institution Details',
      key:  'institution',
      value: {
        institutionName:    'Sri Shakthi Institute of Engineering and Technology',
        institutionShort:   'SIET',
        institutionAddress: 'Coimbatore, Tamil Nadu',
        institutionEmail:   '',
        institutionPhone:   '',
      }
    },

    // ── card: Settings ───────────────────────────────────────────────────────
    {
      card: 'Settings',
      key:  'settings',
      value: {
        // Pages
        pageStudents:     true,
        pageTeachers:     true,
        pageManage:       true,
        pageBulk:         true,
        // Models
        modelBackup:      true,
        modelUndo:        true,
        modelMaintenance: true,
        modelAdder:       true,
        modelAddStudent:  true,
        modelExportSheet: true,
        moduleDelUseAdminPass: true,
        modelProduction:    cfg.NODE_ENV === 'production' ? true : false,
        // Attendance
        markAttendance:   true,
        liveSessions:     true,
        forwardToRep:     true,
      }
    },

    // ── card: Academic Settings ──────────────────────────────────────────────
    {
      card: 'Academic Settings',
      key:  'academic',
      value: {
        academicYear:  '2025-26',
        minAttendance: 75,
        workingDays:   6,
        errorsCount:   20,
      }
    },

    // ── card: Password Policy ────────────────────────────────────────────────
    {
      card: 'Password Policy',
      key:  'security',
      value: {
        forcePasswordChange:   true,
        requireStrongPassword: true,
        sessionTimeout:        true,
        sessionTimeoutMins:    60,
        maxLoginAttempts:      3,
      }
    },

    // ── card: System Utilities ───────────────────────────────────────────────
    {
      card: 'System Utilities',
      key:  'advanced',
      value: {
        debugMode:         false,
        multiAdminSession: false,
        autoSeedDemoData:  false,
      }
    },

    // ── Internal / operational keys ──────────────────────────────────────────
    {
      card: 'System Utilities',
      key:  'maintenance',
      value: {
        active:        false,
        message:       'System under maintenance. Please try again later.',
        affectedRoles: [],
        endTime:       null,
        startedAt:     null,
      }
    }
  ];

  let seeded = 0;
  for (const d of defaults) {
    const exists = await M.Settings.findOne({ key: d.key });
    if (!exists) {
      await M.Settings.create({ card: d.card, key: d.key, value: d.value, updatedBy: 'system' });
      seeded++;
      console.log(`  ✅ Seeded settings key: ${d.key}`);
    } else if (!exists.card) {
      // Back-fill missing card field on old records
      await M.Settings.findOneAndUpdate({ key: d.key }, { $set: { card: d.card } });
    }
  }
  if (seeded > 0) console.log(`✅ ${seeded} default setting(s) seeded`);

  // ── One-time migration: flatten old per-field rows → grouped object ────────
  // Old server stored e.g. key:'institutionName', key:'pageStudents' individually.
  // Detect and merge them into the new grouped key, then delete the old rows.
  const migrationMap = [
    {
      groupKey: 'institution', card: 'Institution Details',
      oldKeys: ['institutionName','institutionShort','institutionAddress','institutionEmail','institutionPhone'],
    },
    {
      groupKey: 'settings', card: 'Settings',
      oldKeys: ['pageStudents','pageTeachers','pageManage','pageBulk','errorsCount',
                'modelBackup','modelUndo','modelMaintenance','modelAdder','modelAddStudent','modelExportSheet',
                'markAttendance','liveSessions','forwardToRep'],
    },
    {
      groupKey: 'academic', card: 'Academic Settings',
      oldKeys: ['academicYear','minAttendance','workingDays','errorsCount'],
    },
    {
      groupKey: 'security', card: 'Password Policy',
      oldKeys: ['forcePasswordChange','requireStrongPassword','sessionTimeout','sessionTimeoutMins','maxLoginAttempts'],
    },
    {
      groupKey: 'advanced', card: 'System Utilities',
      oldKeys: ['debugMode','multiAdminSession','autoSeedDemoData'],
    },
  ];
  for (const { groupKey, card, oldKeys } of migrationMap) {
    const oldRows = await M.Settings.find({ key: { $in: oldKeys } });
    if (oldRows.length === 0) continue;
    // Merge old scalar rows into the grouped object
    const existing = await M.Settings.findOne({ key: groupKey });
    const merged = existing ? { ...existing.value } : {};
    for (const row of oldRows) merged[row.key] = row.value;
    await M.Settings.findOneAndUpdate(
      { key: groupKey },
      { $set: { card, value: merged, updatedBy: 'migration' } },
      { upsert: true }
    );
    await M.Settings.deleteMany({ key: { $in: oldKeys } });
    console.log(`🔄 Migrated ${oldRows.length} old key(s) → ${groupKey}`);
  }

  // Patch old maintenance record missing affectedRoles / endTime
  await M.Settings.findOneAndUpdate(
    { key: 'maintenance', 'value.affectedRoles': { $exists: false } },
    { $set: { 'value.affectedRoles': ['teacher', 'student'], 'value.endTime': null, 'value.startedAt': null } }
  );

  // Log server start
  await M.Log.create({
    userName: 'SYSTEM', role: 'system',
    action: 'Server Started',
    details: 'EAMS server started successfully.',
    category: 'system', severity: 'info', ip: 'localhost',
    time: new Date()
  });
}

// ── Helper: log action to DB ──────────────────────────
async function logAction(trackId, userName, role, action, details, category = 'general', severity = 'info', ip = '', sessionId = '') {
  try {
    await M.Log.create({
      userName, role, action, details, category, severity,
      ip: ip || '', sessionId: sessionId || '',
      time: new Date()
    });
  } catch (e) { }
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
    const affected = v.affectedRoles?.length ? v.affectedRoles : ['teacher', 'student'];
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

    const model = getRoleModel(role);
    if (!model) return res.status(400).json({ error: 'Invalid role' });

    const user = await model.findOne({ username: username.toLowerCase(), active: true });
    if (!user) {
      await logAction(null, username, role, 'Login Failed', 'User not found', 'security', 'warning', req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      await logAction(user.trackId || user._id, user.fullName || user.name, role, 'Login Failed', `Wrong password`, 'security', 'warning', req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check maintenance (non-admin blocked)
    if (role !== 'admin') {
      const maint = await M.Settings.findOne({ key: 'maintenance' });
      if (maint?.value?.active) {
        const v = maint.value;
        const affected = v.affectedRoles?.length ? v.affectedRoles : ['teacher', 'student'];
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

    // Ensure shadow user in legacy M.User collection exists and matches
    let shadowUser = await M.User.findOne({ username: user.username, role });
    if (!shadowUser) {
      shadowUser = await M.User.create({
        name: user.fullName || user.name,
        username: user.username,
        password: user.password,
        role: role,
        trackId: user.trackId,
        status: 'active',
        current: false
      });
    } else {
      // Keep password and name in sync
      shadowUser.password = user.password;
      shadowUser.name = user.fullName || user.name;
      shadowUser.trackId = user.trackId;
      await shadowUser.save();
    }

    // Update firstLogin for role-specific user if null
    if (!user.firstLogin) {
      user.firstLogin = new Date();
      await user.save();
    }

    const token = jwt.sign(
      {
        _id: shadowUser._id, // Keep legacy User _id for middleware / session checks
        roleId: user._id, // Role-specific model ID
        name: user.fullName || user.name,
        username: user.username,
        role: role,
        trackId: user.trackId,
        dept: user.department || user.deptName || '',
        empId: user.employeeNo || '',
        desig: user.designation || '',
        regNo: user.registerNo || '',
      },
      cfg.JWT_SECRET,
      { expiresIn: cfg.JWT_EXPIRES_IN }
    );

    // Create session record referencing shadowUser._id
    const sessionId = crypto.randomBytes(16).toString('hex');
    await M.Session.create({
      userId: shadowUser._id,
      username: user.username,
      role: role,
      token,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });

    await logAction(user.trackId || shadowUser._id, user.fullName || user.name, role, 'Login', `${role} logged in from ${req.ip}`, 'login', 'info', req.ip, sessionId);

    // Determine HOD, Class Advisor and timetable coordinator status based on specials option
    const isHodVal = role === 'teacher' && user.specials?.option === 'isHod';
    const HoddeptNameVal = (role === 'teacher' && user.specials?.option === 'isHod' && user.specials?.key) || '';
    
    const isClassAdvisorVal = role === 'teacher' && user.specials?.option === 'isClassAdvisor';
    const advisorClassNameVal = (role === 'teacher' && user.specials?.option === 'isClassAdvisor' && user.specials?.key) || '';

    const isTTCoordVal = role === 'teacher' && user.specials?.option === 'isTimeTableCoordinator';
    const TTdeptNameVal = (role === 'teacher' && user.specials?.option === 'isTimeTableCoordinator' && user.specials?.key) || '';

    res.json({
      token, sessionId,
      mustChangePassword: user.mustChangePassword,
      user: {
        _id: shadowUser._id, // Return shadow User _id for legacy client code
        roleId: user._id,
        name: user.fullName || user.name,
        role: role,
        dept: user.department || user.deptName || '',
        empId: user.employeeNo || '',
        desig: user.designation || '',
        email: user.email || '',
        username: user.username,
        isHOD: isHodVal,
        HoddeptName: HoddeptNameVal,
        isClassAdvisor: isClassAdvisorVal,
        advisorClassName: advisorClassNameVal,
        isTimeTableCoordinator: isTTCoordVal,
        TTdeptName: TTdeptNameVal,
        isAdmin: user.isAdmin || (role === 'admin'),
        adminRights: user.adminRights || (role === 'admin' ? 'all' : []),
        isClassRep: role === 'student' && user.isRep,
        regNo: user.registerNo || '',
        deptName: user.department || user.deptName || '',
        loginCount: 1,
        lastLogin: new Date(),
        firstLogin: user.firstLogin || null,
        active: user.active,
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
  } catch (e) { res.json({ message: 'Logged out' }); }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const model = getRoleModel(req.user.role);
    if (!model) return res.status(400).json({ error: 'Invalid role model' });

    const user = await model.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password incorrect' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const hashed = await bcrypt.hash(newPassword, cfg.BCRYPT_ROUNDS);
    user.password = hashed;
    user.mustChangePassword = false;
    await user.save();

    // Sync shadow user
    const shadowUser = await M.User.findOne({ username: req.user.username, role: req.user.role });
    if (shadowUser) {
      shadowUser.password = hashed;
      await shadowUser.save();
    }

    await logAction(user.trackId || req.user._id, req.user.name, req.user.role, 'Password Changed', 'User changed their password', 'security', 'info', req.ip);
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

// GET /api/settings  — returns { institution:{…}, settings:{…}, academic:{…}, security:{…}, advanced:{…} }
app.get('/api/settings', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await M.Settings.find({ key: { $ne: 'special_delete_password' } });
    // Group rows: if the key IS one of the 5 card group keys, expose its value under that group name.
    // Individual per-field keys (institution, settings, academic, security, advanced) are stored
    // as a whole-object value under those exact key names.
    const grouped = {};
    const CARD_KEYS = ['institution', 'settings', 'academic', 'security', 'advanced', 'maintenance'];
    rows.forEach(s => {
      if (CARD_KEYS.includes(s.key)) {
        grouped[s.key] = s.value;
      }
    });
    res.json(grouped);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    const details = `Roles blocked: ${affected}${endInfo} | Msg: "${(v.message || '').slice(0, 60)}"`;
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

  // Check special delete password 
  if (password === cfg.DELETE_DATA_PASSWORD) {
    return res.json({ valid: true });
  }

  const useAdminPass = (await M.Settings.findOne({ key: 'settings' }))?.value?.moduleDelUseAdminPass;
  if(useAdminPass){
    // Check admin password from M.Admin
    const adminUser = await M.Admin.findOne({ trackId: req.user.trackId });
    if (adminUser) {
      const adminMatch = await bcrypt.compare(password, adminUser.password);
      if (adminMatch) return res.json({ valid: true });
    }
  }
  await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Delete Auth Failed', 'Wrong delete password attempt', 'security', 'warning', req.ip);
  res.status(403).json({ valid: false, error: 'Incorrect password' });
});

app.get('/api/settings/value/:settingKey', authMiddleware, async (req, res) => {
  try {
    const settings = await M.Settings.findOne({ key: 'settings' }).lean();
    if (!settings?.value) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    const value = settings.value[req.params.settingKey];
    if (value === undefined) {
      return res.status(404).json({ error: 'Key not found' });
    }
    res.json(value);
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
    await M.UndoLog.create({
      collectionName: 'departments', label: `Department: ${dept.name}`,
      snapshot: dept, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
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
    await M.UndoLog.create({
      collectionName: 'departments', label: `Department: ${dept.name}`,
      snapshot: dept, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
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
    await M.UndoLog.create({
      collectionName: 'classes', label: `Class: ${cls.name}`,
      snapshot: cls, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
    await M.Class.findByIdAndDelete(req.params.id);
  }
  await logAction(req.user._id, req.user.name, req.user.role, 'Class Deleted', cls?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

// ════════════════════════════════════════════════════════
//  STUDENTS
// ════════════════════════════════════════════════════════

app.get('/api', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.deptId) filter.deptId = req.query.deptId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.section) filter.section = req.query.section;
  
  const list = await M.Student.find(filter).sort({ fullName: 1 }).lean();
  const mapped = list.map(s => ({
    ...s,
    name: s.fullName,
    regNo: s.registerNo,
  }));
  res.json(mapped);
});

// Alias: GET /api/students (consistent with other routes)
app.get('/api/students', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.deptId) filter.deptId = req.query.deptId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.section) filter.section = req.query.section;
  
  const list = await M.Student.find(filter).sort({ fullName: 1 }).lean();
  const mapped = list.map(s => ({
    ...s,
    name: s.fullName,
    regNo: s.registerNo,
    deptName: s.department,
    academicYear: s.admissionYear,
    className: s.class,
  }));
  res.json(mapped);
});

app.get('/api/students/count', authMiddleware, async (req, res) => {
  res.json({ count: await M.Student.countDocuments() });
});

app.post('/api/students', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, regNo, academicYear, courseType, branch, deptId, deptName, classId, className, year, section, email, username, password, isRep } = req.body;
    
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
      email: email || '',
      username: generatedUsername,
      password: hash,
      trackId: generatedTrackId,
      isRep: !!isRep,
      active: true,
      mustChangePassword: true
    });

    // Create shadow user in M.User
    await M.User.create({
      name: name,
      username: generatedUsername,
      password: hash,
      role: 'student',
      trackId: generatedTrackId,
      status: 'active',
      current: false
    });

    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Student Added', `${stu.fullName} (${stu.registerNo})`, 'data', 'info', req.ip);
    res.status(201).json({ ...stu.toObject(), name: stu.fullName, regNo: stu.registerNo });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/students/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, regNo, academicYear, courseType, branch, deptId, deptName, classId, className, year, section, email, username, password, isRep, active } = req.body;
    
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
    if (email !== undefined) stu.email = email;
    if (username) stu.username = username.toLowerCase().trim();
    if (isRep !== undefined) stu.isRep = isRep;
    if (active !== undefined) stu.active = active;

    if (password) {
      stu.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
    }

    await stu.save();

    // Sync shadow user
    let shadowUser = await M.User.findOne({ username: oldUsername, role: 'student' });
    if (shadowUser) {
      if (name) shadowUser.name = name;
      if (username) shadowUser.username = username.toLowerCase().trim();
      if (password) shadowUser.password = stu.password;
      if (active !== undefined) shadowUser.status = active ? 'active' : 'inactive';
      await shadowUser.save();
    }

    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Student Updated', stu.fullName, 'data', 'info', req.ip);
    res.json({ ...stu.toObject(), name: stu.fullName, regNo: stu.registerNo });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/students/:id', authMiddleware, adminOnly, async (req, res) => {
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
app.post('/api/students/bulk-upload', authMiddleware, adminOnly, upload.single('file'), async (req, res) => {
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
      const name = cv(['fullname', 'name', 'studentname']), regNo = cv(['registerno', 'regno', 'rollno']), acadYear = cv(['academicyear', 'ay']) || '2025-26', courseType = cv(['coursetype', 'course']).toUpperCase() || 'UG', branch = cv(['branch']), deptName = cv(['department', 'dept']), yearStr = cv(['year', 'studyyear']), className = cv(['class', 'classname']), section = cv(['section', 'sec']) || 'A', email = cv(['email', 'mail']), username = cv(['username', 'user']), password = cv(['password', 'pass']) || 'Student@123';
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
        active: true,
        mustChangePassword: true
      });

      await M.User.create({
        name: name,
        username: generatedUsername,
        password: hash,
        role: 'student',
        trackId: generatedTrackId,
        status: 'active',
        current: false
      });

      added++;
    }
    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Bulk Student Upload', `${added} added, ${skipped} skipped`, 'data', 'info', req.ip);
    res.json({ added, skipped, total: rows.length, errors: errors.slice(0, 20), message: `Import complete: ${added} added, ${skipped} skipped` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  TEACHERS
// ════════════════════════════════════════════════════════

app.get('/api/teachers/trackid/:trackId', authMiddleware, async (req, res) => {
  try {
    const teacher = await M.Teacher.findOne(
      { trackId: req.params.trackId.trim(), active: true },
      'fullName specials trackId'
    ).lean();
    if (!teacher) return res.status(404).json({ error: 'TrackID not found' });
    res.json({ fullName: teacher.fullName, isHod: teacher.specials?.option === 'isHod', trackId: teacher.trackId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teachers', authMiddleware, async (req, res) => {
  try {
    const teachers = await M.Teacher.find({ active: true }, '-password').sort({ fullName: 1 });
    const mapped = teachers.map(t => {
      const isHodVal = t.specials?.option === 'isHod';
      const isClassAdvisorVal = t.specials?.option === 'isClassAdvisor';
      const isTTCoordVal = t.specials?.option === 'isTimeTableCoordinator';
      return {
        _id: t._id,
        name: t.fullName,
        fullName: t.fullName,
        firstName: t.firstName,
        lastName: t.lastName,
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
        active: t.active,
        current: t.current,
        status: t.status,
        mustChangePassword: t.mustChangePassword,
        firstLogin: t.firstLogin,
      };
    });
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/teachers', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, empId, dept, desig, username, password, email, isHOD, isClassAdvisor, advisorClassId, advisorClassName, isWarden, isExamCoordinator, isPlacementCoord, qualifications, experience, joiningDate } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username, password required' });
    const hash = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);

    let specials = undefined;
    if (isHOD) {
      specials = { option: 'isHod', key: 'isHod_' + username.toLowerCase().trim(), value: dept };
    } else if (isClassAdvisor) {
      specials = { option: 'isClassAdvisor', key: 'isClassAdvisor_' + username.toLowerCase().trim(), value: advisorClassName };
    } else if (req.body.isTimeTableCoordinator) {
      specials = { option: 'isTimeTableCoordinator', key: 'isTimeTableCoordinator_' + username.toLowerCase().trim(), value: dept };
    }

    const generatedTrackId = 'TRTCH_' + Math.random().toString(36).substr(2, 9).toUpperCase();

    const teacher = await M.Teacher.create({
      fullName: name,
      firstName: req.body.firstName || '',
      lastName: req.body.lastName || '',
      employeeNo: empId || '',
      department: dept || '',
      designation: desig || '',
      email: email || '',
      username: username.toLowerCase().trim(),
      password: hash,
      trackId: req.body.trackId || generatedTrackId,
      specials,
      isAdmin: false,
      active: true,
      current: false,
      status: 'active',
      mustChangePassword: true
    });

    // Also create shadow user
    const shadowUser = await M.User.create({
      name: name,
      username: username.toLowerCase().trim(),
      password: hash,
      role: 'teacher',
      trackId: teacher.trackId,
      status: 'active',
      current: false
    });

    const { password: _, ...teacherData } = teacher.toObject();
    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Teacher Added', `${name} (${username}) — initial password set`, 'data', 'info', req.ip);
    res.status(201).json({ ...teacherData, name: teacher.fullName, empId: teacher.employeeNo, dept: teacher.department, desig: teacher.designation, _plainPassword: password });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/teachers/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { password, name, empId, dept, desig, email, username, isHOD, isClassAdvisor, isTimeTableCoordinator, advisorClassName, active, status } = req.body;
    const teacher = await M.Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    const oldUsername = teacher.username;

    if (name) teacher.fullName = name;
    if (empId !== undefined) teacher.employeeNo = empId;
    if (dept !== undefined) teacher.department = dept;
    if (desig !== undefined) teacher.designation = desig;
    if (email !== undefined) teacher.email = email;
    if (username) teacher.username = username.toLowerCase().trim();
    if (active !== undefined) teacher.active = active;
    if (status) teacher.status = status;

    if (password) {
      teacher.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
    }

    // Update specials
    if (isHOD !== undefined || isClassAdvisor !== undefined || isTimeTableCoordinator !== undefined) {
      if (isHOD) {
        teacher.specials = { option: 'isHod', key: 'isHod_' + teacher.username, value: dept || teacher.department };
      } else if (isClassAdvisor) {
        teacher.specials = { option: 'isClassAdvisor', key: 'isClassAdvisor_' + teacher.username, value: advisorClassName || '' };
      } else if (isTimeTableCoordinator) {
        teacher.specials = { option: 'isTimeTableCoordinator', key: 'isTimeTableCoordinator_' + teacher.username, value: dept || teacher.department };
      } else {
        teacher.specials = undefined;
      }
    }

    await teacher.save();

    // Sync shadow user
    let shadowUser = await M.User.findOne({ username: oldUsername, role: 'teacher' });
    if (shadowUser) {
      if (name) shadowUser.name = name;
      if (username) shadowUser.username = username.toLowerCase().trim();
      if (password) shadowUser.password = teacher.password;
      if (active !== undefined) shadowUser.status = active ? 'active' : 'inactive';
      await shadowUser.save();
    }

    const { password: _, ...safeTeacher } = teacher.toObject();
    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Teacher Updated', teacher.fullName, 'data', 'info', req.ip);
    res.json({ ...safeTeacher, name: teacher.fullName, empId: teacher.employeeNo, dept: teacher.department, desig: teacher.designation });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/teachers/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const teacher = await M.Teacher.findById(req.params.id);
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

// ════════════════════════════════════════════════════════
//  ATTENDANCE
// ════════════════════════════════════════════════════════

app.get('/api/attendance', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.teacherId) filter.teacherId = req.query.teacherId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.date) filter.date = req.query.date;
  if (req.query.from && req.query.to) filter.date = { $gte: req.query.from, $lte: req.query.to };
  res.json(await M.Attendance.find(filter).sort({ date: -1 }).limit(500));
});
// Bulk delete all attendance (admin only)
app.delete('/api/attendance/all', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await M.Attendance.deleteMany({});
    await logAction(req.user._id, req.user.name, req.user.role, 'Attendance Cleared', `All ${result.deletedCount} records deleted`, 'data', 'warning', req.ip);
    res.json({ deleted: result.deletedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Delete single attendance record
app.delete('/api/attendance/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await M.Attendance.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  const today = new Date(), monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDates = Array.from({ length: 5 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d.toISOString().split('T')[0]; });
  const assignments = await M.Assignment.find().lean();
  const attendance = await M.Attendance.find({ date: { $in: weekDates } }).lean();
  const unmarked = [];
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
    const student = await M.Student.findOne({ username: req.user.username });
    if (!student || !student.classId) return res.json({ active: false });

    // Find active session for this class
    const session = await M.LiveSession.findOne({ classId: student.classId, active: true, expiresAt: { $gt: new Date() } }).populate('subjectId', 'name').lean();
    if (!session) return res.json({ active: false });

    // Check if already marked
    const alreadyMarked = session.markedStudents.some(s => String(s.studentId) === String(student._id));

    res.json({ active: true, sessionId: session._id, subjectName: session.subjectId?.name || 'Subject', alreadyMarked });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/live-session/mark', authMiddleware, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
  const { sessionId, passcode } = req.body;

  try {
    const student = await M.Student.findOne({ username: req.user.username });
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
      regNo: student.registerNo || student.regNo,
      time: new Date(),
      ip: req.ip
    });
    await session.save();

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

    // ── Student profile — look up by username or trackId
    let student = await M.Student.findOne({ username: req.user.username }).lean();
    if (!student && req.user.trackId) {
      student = await M.Student.findOne({ trackId: req.user.trackId }).lean();
    }
    if (!student) {
      // No Student profile record at all — return user info with empty attendance so portal loads
      const academic2 = await M.Settings.findOne({ key: 'academic' });
      const minReq2 = academic2?.value?.minAttendance || 75;
      return res.json({
        user: { _id: user._id, name: user.name, username: user.username, email: user.email, lastLogin: user.lastLogin, loginCount: user.loginCount },
        student: { name: user.name, regNo: '—', deptName: '—', className: '—', year: '—', section: '—', academicYear: '—', courseType: '—', branch: '—', email: user.email || '—', bloodGroup: '—', parentContact: '—' },
        attendance: { subjects: [], totalPresent: 0, totalAbsent: 0, totalClasses: 0, overall: 0, minRequired: minReq2 },
      });
    }

    // Normalize student fields for frontend consumption
    const normalizedStudent = {
      ...student,
      name: student.fullName,
      regNo: student.registerNo,
      deptName: student.department,
      className: student.class || '—',
      academicYear: student.admissionYear || '—',
    };

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
          subjectId: sid,
          subjectName: rec.subjectName || 'Unknown',
          teacherName: rec.teacherName || '—',
          present: 0,
          absent: 0,
          total: 0,
          dates: [],
        };
      }
      const entry = subjectMap[sid];
      // Find this student's record in the attendance doc
      const myRecord = rec.records.find(r =>
        (r.studentId && String(r.studentId) === String(student._id)) ||
        (r.regNo && (r.regNo === student.registerNo || r.regNo === student.regNo))
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
    const totalAbsent = subjects.reduce((n, s) => n + s.absent, 0);
    const totalClasses = subjects.reduce((n, s) => n + s.total, 0);
    const overall = totalClasses > 0 ? Math.round((totalPresent / totalClasses) * 100) : 0;

    res.json({
      user: { _id: user._id, name: user.name, username: user.username, email: user.email, lastLogin: user.lastLogin, loginCount: user.loginCount },
      student: normalizedStudent,
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
    await logAction(req.user._id, req.user.name, req.user.role, 'Notification Sent', req.body.message?.slice(0, 80), 'data', 'info', req.ip);
    res.status(201).json(notif);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
// Bulk delete all notifications (admin only)
app.delete('/api/notifications/all', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await M.Notification.deleteMany({});
    await logAction(req.user._id, req.user.name, req.user.role, 'Notifications Cleared', `All ${result.deletedCount} notifications deleted`, 'data', 'warning', req.ip);
    res.json({ deleted: result.deletedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

app.get('/api/timetable/section/:classId', authMiddleware, async (req, res) => {
  const doc = await M.SectionTimetable.findOne({ classId: req.params.classId }).lean();
  res.json(doc || { slots: {} });
});

app.put('/api/timetable/section/:classId/slot', authMiddleware, async (req, res) => {
  const u = req.user;

  if (!u.isTimeTableCoordinator && u.role !== 'admin')
    return res.status(403).json({ error: 'TT Coordinator access required' });

  const { slotKey, payload, _meta } = req.body;

  if (_meta?.coordIsService && payload?.subjectId) {
    const subj = await M.Subject.findById(payload.subjectId).lean();
    if (subj && subj.deptId?.toString() !== _meta.coordDeptId)
      return res.status(403).json({ error: `Service coordinators may only assign ${u.TTdeptName} subjects` });
  }

  if (!_meta?.coordIsService && u.role !== 'admin') {
    const cls = await M.Class.findById(req.params.classId).lean();
    if (cls?.deptId?.toString() !== u.TTdeptName)
      return res.status(403).json({ error: 'You can only edit timetables for your own department' });
  }

  const cls = await M.Class.findById(req.params.classId).lean();

  const update = payload
    ? { $set: { [`slots.${slotKey}`]: payload }, updatedBy: u.name }
    : { $unset: { [`slots.${slotKey}`]: '' }, updatedBy: u.name };

  if (cls) {
    update.$setOnInsert = {
      className: cls.name,
      deptId: cls.deptId,
      deptName: cls.deptName
    };
  }

  const doc = await M.SectionTimetable.findOneAndUpdate(
    { classId: req.params.classId },
    update,
    { upsert: true, new: true }
  );

  await logAction(u._id, u.name, u.role, 'TT Slot Updated', slotKey, 'data', 'info', req.ip);

  res.json(doc);
});

app.put('/api/timetable/section/:classId', authMiddleware, async (req, res) => {
  const u = req.user;

  if (!u.isTimeTableCoordinator && u.role !== 'admin')
    return res.status(403).json({ error: 'TT Coordinator access required' });

  const { slots } = req.body;
  const cls = await M.Class.findById(req.params.classId).lean();
  const update = { slots, updatedBy: u.name };
  if (cls) {
    update.$setOnInsert = {
      className: cls.name,
      deptId: cls.deptId,
      deptName: cls.deptName
    };
  }

  const doc = await M.SectionTimetable.findOneAndUpdate(
    { classId: req.params.classId },
    update,
    { upsert: true, new: true }
  );

  await logAction(u._id, u.name, u.role, 'TT Saved', req.params.classId, 'data', 'info', req.ip);

  res.json(doc);
});

app.post('/api/timetable/check-conflicts', authMiddleware, async (req, res) => {
  const { subjects } = req.body;

  const results = subjects.map(s => ({
    ok: true,
    message: `${s.name} — ${s.staff || 'TBA'} available (${s.hours} hrs/wk)`
  }));

  res.json(results);
});

app.post('/api/timetable/auto-gen', authMiddleware, async (req, res) => {
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════
//  ACTIVITY LOGS
// ════════════════════════════════════════════════════════

app.get('/api/logs', authMiddleware, adminOnly, async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.severity) filter.severity = req.query.severity;
  if (req.query.from) filter.time = { $gte: new Date(req.query.from) };
  if (req.query.to) filter.time = { ...filter.time, $lte: new Date(req.query.to + 'T23:59:59') };
  const logs = await M.Log.find(filter).sort({ time: -1 }).limit(500);
  res.json(logs);
});
app.post('/api/logs', authMiddleware, async (req, res) => {
  try {
    const { action, details, category } = req.body;
    await M.Log.create({ userId: req.user._id, userName: req.user.name, role: req.user.role, action, details: details || '', category: category || 'general', severity: 'info', ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false }); }
});

app.delete('/api/logs', authMiddleware, adminOnly, async (req, res) => {
  await M.Log.deleteMany({});
  await logAction(req.user._id, req.user.name, req.user.role, 'Logs Cleared', 'All logs deleted', 'settings', 'warning', req.ip);
  res.json({ deleted: true });
});

app.get('/api/logs/count', authMiddleware, adminOnly, async (req, res) => {
  try {
    const filter = {};

    if (req.query.role) filter.role = req.query.role;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.severity) filter.severity = req.query.severity;

    if (req.query.from) {
      filter.time = { $gte: new Date(req.query.from) };
    }

    if (req.query.to) {
      filter.time = {
        ...filter.time,
        $lte: new Date(req.query.to + 'T23:59:59')
      };
    }

    const count = await M.Log.countDocuments(filter);

    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get logs count' });
  }
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
    await M.UndoLog.create({
      collectionName: 'subjects', label: `Subject: ${subj.name} (${subj.code || ''})`,
      snapshot: subj, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
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
  if (req.query.teacherId) filter.teacherId = req.query.teacherId;
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
      active: userDoc.active,
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
      const specials = userDoc.specials || {};
      Object.assign(base, {
        fullName: userDoc.fullName,
        firstName: userDoc.firstName || '',
        lastName: userDoc.lastName || '',
        employeeNo: userDoc.employeeNo || '',
        department: userDoc.department || '',
        designation: userDoc.designation || 'Assistant Professor',
        isHod: specials.option === 'isHod',
        HoddeptName: specials.option === 'isHod' ? specials.value : '',
        isClassAdvisor: specials.option === 'isClassAdvisor',
        className: specials.option === 'isClassAdvisor' ? specials.value : '',
        isTimeTableCoordinator: specials.option === 'isTimeTableCoordinator',
        TTdeptName: specials.option === 'isTimeTableCoordinator' ? specials.value : '',
        isAdmin: userDoc.isAdmin || false,
        adminRights: userDoc.adminRights || '',
      });
    } else if (req.user.role === 'student') {
      Object.assign(base, {
        fullName: userDoc.fullName,
        firstName: userDoc.firstName || '',
        lastName: userDoc.lastName || '',
        registerNo: userDoc.registerNo || '',
        class: userDoc.class || '',
        section: userDoc.section || '',
        branch: userDoc.branch || '',
        course: userDoc.courseType || '',
        department: userDoc.department || '',
        currentYear: userDoc.currentYear || '',
        academicYear: userDoc.admissionYear || '',
        isRep: userDoc.isRep || false,
      });
    }

    res.json(base);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/profile/me — update own editable fields ──
app.put('/api/profile/me', authMiddleware, async (req, res) => {
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

    // Sync shadow user
    const shadowUser = await M.User.findOne({ username: user.username, role: req.user.role });
    if (shadowUser) {
      shadowUser.name = user.fullName;
      shadowUser.email = user.email || '';
      await shadowUser.save();
    }

    await logAction(user.trackId || req.user._id, user.fullName, req.user.role, 'Profile Updated', 'Own profile self-edited', 'data', 'info', req.ip);
    const { password: _pw, ...safe } = user.toObject();
    res.json(safe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/profile/users — admin or Manage User right: list all users ──
app.get('/api/profile/users', authMiddleware, async (req, res) => {
  try {
    const reqUser = await M.User.findById(req.user._id).lean();
    const rights = reqUser?.adminRights;
    const canManage = req.user.role === 'admin'
      || rights === 'all'
      || (Array.isArray(rights) && rights.includes('Manage User'));

    if (!canManage) return res.status(403).json({ error: 'Manage User right required' });

    const filter = {};
    if (req.query.role) filter.role = req.query.role;
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
    const rights = reqUser?.adminRights;
    const canManage = req.user.role === 'admin'
      || rights === 'all'
      || (Array.isArray(rights) && rights.includes('Manage User'));

    if (!canManage) return res.status(403).json({ error: 'Manage User right required' });

    const { password, ...data } = req.body;
    if (password) data.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);

    // Map friendly names back to schema fields
    if (data.fullName) { data.name = data.fullName; delete data.fullName; }
    if (data.employeeNo) { data.empId = data.employeeNo; delete data.employeeNo; }
    if (data.department) { data.dept = data.department; delete data.department; }
    if (data.designation) { data.desig = data.designation; delete data.designation; }
    if (data.firstName || data.lastName) {
      const target = await M.User.findById(req.params.id).lean();
      const fn = data.firstName || (target?.name || '').split(' ')[0];
      const ln = data.lastName || (target?.name || '').split(' ').slice(1).join(' ');
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
    const isSelf = String(req.user._id) === String(req.params.id);
    const isAdmin = req.user.role === 'admin';
    // Check Manage User right for non-primary-admin teachers with adminRights
    const reqUser = await M.User.findById(req.user._id).lean();
    const rights = reqUser?.adminRights;
    const hasManageUser = rights === 'all' || (Array.isArray(rights) && rights.includes('Manage User'));
    const canEditOthers = isAdmin || hasManageUser;

    if (!isSelf && !canEditOthers) {
      return res.status(403).json({ error: 'Forbidden: cannot edit other users' });
    }

    const { password, ...data } = req.body;

    // Non-admins editing self: strip protected fields
    if (!canEditOthers && isSelf) {
      const PROTECTED = ['role', 'isAdmin', 'adminRights', 'isHOD', 'isClassAdvisor', 'isTimeTableCoordinator',
        'isClassRep', 'isAssiClassRep', 'isSportsRep', 'isCulturalRep', 'active', 'failedLogins', 'lockedUntil',
        'loginCount', 'firstLogin', 'lastLogin', 'mustChangePassword'];
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
    res.json({ dbName: stats.db, collections: stats.collections, totalDocs: stats.objects, dataSize: stats.dataSize.toFixed(2), storageSize: stats.storageSize.toFixed(2), indexSize: stats.indexSize ? stats.indexSize.toFixed(2) : '0.00', fsTotalSize: stats.fsTotalSize ? (stats.fsTotalSize / 1024 / 1024).toFixed(0) : null, fsUsedSize: stats.fsUsedSize ? (stats.fsUsedSize / 1024 / 1024).toFixed(0) : null, collStats });
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
const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);
function _captureLog(level, args) {
  const line = { time: new Date().toISOString(), level, text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') };
  _serverLogs.push(line);
  if (_serverLogs.length > 200) _serverLogs.shift();
}
console.log = (...a) => { _captureLog('info', a); _origLog(...a); };
console.error = (...a) => { _captureLog('error', a); _origError(...a); };
console.warn = (...a) => { _captureLog('warn', a); _origWarn(...a); };

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
    const dbStateMap = { 0: 'Disconnected', 1: 'Connected', 2: 'Connecting', 3: 'Disconnecting' };
    const activeTeachersCount = await M.Teacher.countDocuments({ active: true });
    const activeStudentsCount = await M.Student.countDocuments({ active: true });
    const activeAdminsCount = await M.Admin.countDocuments({ active: true });
    
    const [errorCount, warnCount] = await Promise.all([
      M.Log.countDocuments({ severity: { $in: ['critical', 'error'] } }),
      M.Log.countDocuments({ severity: 'warning' }),
    ]);
    const totalUsers = activeTeachersCount + activeStudentsCount + activeAdminsCount;
    const activeTeachers = activeTeachersCount;
    const recentErrors = await M.Log.find({ severity: { $in: ['critical', 'error', 'warning'] } })
      .sort({ time: -1 }).limit(5).lean();
    res.json({
      dbStatus: dbStateMap[dbState] || 'Unknown',
      dbConnected: dbState === 1,
      serverUptime: Math.floor(process.uptime()),
      errorCount, warnCount, totalUsers, activeTeachers, recentErrors,
      memoryMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
      nodeVersion: process.version,
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
    if (entry.collectionName === 'departments') restored = await M.Department.create(body);
    else if (entry.collectionName === 'classes') restored = await M.Class.create(body);
    else if (entry.collectionName === 'subjects') restored = await M.Subject.create(body);
    else if (entry.collectionName === 'students') {
      restored = await M.Student.create(body);
      await M.User.create({
        name: restored.fullName,
        username: restored.username,
        password: restored.password,
        role: 'student',
        trackId: restored.trackId,
        status: 'active',
        current: false
      });
    } else if (entry.collectionName === 'teachers') {
      const { _id: _, ...cleanSnap } = snap;
      restored = await M.Teacher.create({
        ...cleanSnap,
        fullName: cleanSnap.fullName || cleanSnap.name,
        employeeNo: cleanSnap.employeeNo || cleanSnap.empId,
        department: cleanSnap.department || cleanSnap.dept,
        designation: cleanSnap.designation || cleanSnap.desig
      });
      await M.User.create({
        name: restored.fullName,
        username: restored.username,
        password: restored.password,
        role: 'teacher',
        trackId: restored.trackId,
        status: 'active',
        current: false
      });
    } else return res.status(400).json({ error: 'Cannot restore collection: ' + entry.collectionName });
    await M.UndoLog.findByIdAndDelete(req.params.id);
    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Undo Restore', entry.label, 'data', 'info', req.ip);
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
      M.Teacher.find({}, '-password').lean(),
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
    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'System Backup Created',
      `${totalDocs} docs — GDrive upload pending`, 'data', 'info', req.ip);
    res.json({
      ok: true, totalDocs, backupPassword, createdAt: backupPayload.meta.createdAt,
      collections: {
        students: students.length, teachers: teachers.length, departments: departments.length,
        classes: classes.length, subjects: subjects.length, attendance: attendance.length, assignments: assignments.length
      }
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
        M.Student.find().lean(), M.Teacher.find({}, '-password').lean(),
        M.Department.find().lean(), M.Class.find().lean(), M.Subject.find().lean(),
        M.Attendance.find().lean(), M.Assignment.find().lean(),
      ]);
      payload = {
        meta: {
          exportedAt: new Date().toISOString(), exportedBy: req.user.name,
          type, totalStudents: studentCount
        }, students, teachers, departments, classes, subjects, attendance, assignments
      };
    } else {
      const dataMap = {
        students: () => M.Student.find().lean(),
        teachers: () => M.Teacher.find({}, '-password').lean(),
        attendance: () => M.Attendance.find().lean(),
      };
      const data = dataMap[type] ? await dataMap[type]() : [];
      payload = {
        meta: {
          exportedAt: new Date().toISOString(), exportedBy: req.user.name,
          type, totalStudents: studentCount
        }, data
      };
    }
    const exportPassword = crypto.randomBytes(6).toString('hex').toUpperCase();
    // ─── Stub (wire when ready) ──────────────────────────
    // await exportMail(req.user.email || 'admin', exportPassword, JSON.stringify(payload));
    // ────────────────────────────────────────────────────
    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Data Exported',
      `Type: ${type} — password mailed (stub)`, 'data', 'info', req.ip);
    res.json({ ok: true, payload, exportPassword, totalStudents: studentCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  CALENDAR DAY ROUTES
// ════════════════════════════════════════════════════════

// Helper: compute day-of-week string from "YYYY-MM-DD"
function dateToDow(dateStr) {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr + 'T00:00:00').getDay()];
}

// Helper: returns 1-based ordinal of a Saturday within its month (1st Sat, 2nd Sat…)
function satOrdinal(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDay() !== 6) return 0;
  let count = 0;
  for (let day = 1; day <= d.getDate(); day++) {
    const nd = new Date(d.getFullYear(), d.getMonth(), day);
    if (nd.getDay() === 6) count++;
  }
  return count; // 1, 2, 3…
}

// Helper: auto-update exam statuses based on today
async function refreshExamStatuses() {
  const today = new Date().toISOString().split('T')[0];
  await M.Exam.updateMany({ status: { $nin: ['cancelled'] }, endDate: { $lt: today } },   { $set: { status: 'completed' } });
  await M.Exam.updateMany({ status: { $nin: ['cancelled'] }, startDate: { $lte: today }, endDate: { $gte: today } }, { $set: { status: 'ongoing' } });
  await M.Exam.updateMany({ status: { $nin: ['cancelled'] }, startDate: { $gt: today } }, { $set: { status: 'upcoming' } });
}

// GET /api/calendar  — all days in a month
app.get('/api/calendar', authMiddleware, async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const mm    = String(month).padStart(2, '0');
    const start = `${year}-${mm}-01`;
    const end   = `${year}-${mm}-31`;
    const days  = await M.CalendarDay.find({ date: { $gte: start, $lte: end } }).sort({ date: 1 });
    res.json(days);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/calendar/check/:date  — single day status + exam info
app.get('/api/calendar/check/:date', authMiddleware, async (req, res) => {
  try {
    const { date } = req.params;
    const [day, exams] = await Promise.all([
      M.CalendarDay.findOne({ date }),
      M.Exam.find({ startDate: { $lte: date }, endDate: { $gte: date }, status: { $in: ['upcoming','ongoing'] } })
    ]);
    const defaults = {
      isWorkingDay: new Date(date + 'T00:00:00').getDay() !== 0,
      dayType: 'regular',
      timing: { start: '08:30', end: '16:30' }
    };
    res.json({ ...(day ? day.toObject() : defaults), hasExam: exams.length > 0, exams });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/calendar  — upsert a single day (admin only)
app.post('/api/calendar', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { date, isWorkingDay, dayType, notes, timing, affectedYears, isOverride } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });
    const doc = await M.CalendarDay.findOneAndUpdate(
      { date },
      { $set: { date, dayOfWeek: dateToDow(date), isWorkingDay, dayType, notes, timing, affectedYears: affectedYears || [], isOverride: isOverride !== false, markedBy: req.user.name } },
      { new: true, upsert: true }
    );
    await logAction(req.user._id, req.user.name, req.user.role, 'Calendar Day Updated', `${date} → ${dayType}`, 'manage', 'info', req.ip);
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/calendar/:date  — same as POST
app.put('/api/calendar/:date', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { date } = req.params;
    const { isWorkingDay, dayType, notes, timing, affectedYears, isOverride } = req.body;
    const doc = await M.CalendarDay.findOneAndUpdate(
      { date },
      { $set: { dayOfWeek: dateToDow(date), isWorkingDay, dayType, notes, timing, affectedYears: affectedYears || [], isOverride: isOverride !== false, markedBy: req.user.name } },
      { new: true, upsert: true }
    );
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/calendar/:date  — remove override, revert to auto-default
app.delete('/api/calendar/:date', authMiddleware, adminOnly, async (req, res) => {
  try {
    await M.CalendarDay.deleteOne({ date: req.params.date });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/calendar/bulk-generate  — auto-fill month with default rules
app.post('/api/calendar/bulk-generate', authMiddleware, adminOnly, async (req, res) => {
  try {
    const month = parseInt(req.body.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.body.year)  || new Date().getFullYear();
    const overwriteExisting = req.body.overwriteExisting === true;
    const lastDay = new Date(year, month, 0).getDate();
    const mm = String(month).padStart(2, '0');
    let generated = 0, skipped = 0;
    const ops = [];
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${year}-${mm}-${String(day).padStart(2,'0')}`;
      const d = new Date(dateStr + 'T00:00:00');
      const dow = d.getDay();
      let isWorkingDay, dayType;
      if (dow === 0) { isWorkingDay = false; dayType = 'leave'; }
      else if (dow === 6) {
        const sn = satOrdinal(dateStr);
        isWorkingDay = sn % 2 === 0;    // 2nd,4th Sat = working; 1st,3rd,5th = leave
        dayType = isWorkingDay ? 'regular' : 'leave';
      } else { isWorkingDay = true; dayType = 'regular'; }
      if (!overwriteExisting) {
        const existing = await M.CalendarDay.findOne({ date: dateStr, isOverride: true });
        if (existing) { skipped++; continue; }
      }
      ops.push({ updateOne: { filter: { date: dateStr }, update: { $set: { date: dateStr, dayOfWeek: dateToDow(dateStr), isWorkingDay, dayType, timing: { start: '08:30', end: '16:30' }, affectedYears: [], isOverride: false, markedBy: 'system' } }, upsert: true } });
      generated++;
    }
    if (ops.length) await M.CalendarDay.bulkWrite(ops);
    res.json({ generated, skipped, month, year });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  EXAM ROUTES
// ════════════════════════════════════════════════════════

// GET /api/exams  — list with optional filters
app.get('/api/exams', authMiddleware, async (req, res) => {
  try {
    await refreshExamStatuses();
    const filter = {};
    if (req.query.examType)    filter.examType    = req.query.examType;
    if (req.query.studentYear) filter.studentYear = req.query.studentYear;
    if (req.query.status)      filter.status      = req.query.status;
    if (req.query.academicYear)filter.academicYear= req.query.academicYear;
    if (req.query.deptId)      filter.deptId      = req.query.deptId;
    const exams = await M.Exam.find(filter).sort({ startDate: -1 });
    res.json(exams);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/exams/active  — ongoing or starting today/upcoming within 7 days
app.get('/api/exams/active', authMiddleware, async (req, res) => {
  try {
    await refreshExamStatuses();
    const exams = await M.Exam.find({ status: { $in: ['upcoming','ongoing'] } }).sort({ startDate: 1 });
    res.json(exams);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/exams/:id
app.get('/api/exams/:id', authMiddleware, async (req, res) => {
  try {
    const exam = await M.Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Not found' });
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/exams  — create exam + auto-mark calendar days
app.post('/api/exams', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { title, examType, academicYear, studentYear, deptId, deptName, startDate, endDate, timing, notes, status } = req.body;
    if (!title || !examType || !startDate || !endDate) return res.status(400).json({ error: 'title, examType, startDate, endDate required' });
    if (startDate > endDate) return res.status(400).json({ error: 'startDate must be ≤ endDate' });
    const exam = await M.Exam.create({ title, examType, academicYear, studentYear: studentYear || 'All', deptId: deptId || null, deptName: deptName || '', startDate, endDate, timing: timing || { start: '09:00', end: '16:00' }, notes: notes || '', status: status || 'upcoming', createdBy: req.user.name });
    // Auto-mark calendar days
    const affYears = studentYear && studentYear !== 'All' ? [studentYear] : [];
    const cur = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate   + 'T00:00:00');
    const calOps = [];
    while (cur <= end) {
      const ds = cur.toISOString().split('T')[0];
      calOps.push({ updateOne: { filter: { date: ds }, update: { $set: { date: ds, dayOfWeek: dateToDow(ds), isWorkingDay: true, dayType: 'exam', timing: timing || { start: '09:00', end: '16:00' }, affectedYears: affYears, isOverride: false, markedBy: 'exam:'+exam._id } }, upsert: true } });
      cur.setDate(cur.getDate() + 1);
    }
    if (calOps.length) await M.CalendarDay.bulkWrite(calOps);
    await logAction(req.user._id, req.user.name, req.user.role, 'Exam Created', `${title} (${startDate}–${endDate})`, 'manage', 'info', req.ip);
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/exams/:id
app.put('/api/exams/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const exam = await M.Exam.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!exam) return res.status(404).json({ error: 'Not found' });
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/exams/:id
app.delete('/api/exams/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const exam = await M.Exam.findByIdAndDelete(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Not found' });
    // Remove auto-generated calendar entries for this exam
    await M.CalendarDay.deleteMany({ markedBy: 'exam:' + req.params.id });
    await logAction(req.user._id, req.user.name, req.user.role, 'Exam Deleted', exam.title, 'manage', 'warn', req.ip);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  EXAM ATTENDANCE ROUTES
// ════════════════════════════════════════════════════════

// GET /api/exam-attendance  — filter by examId, date, teacherId
app.get('/api/exam-attendance', authMiddleware, async (req, res) => {
  try {
    const filter = {};
    if (req.query.examId)    filter.examId    = req.query.examId;
    if (req.query.date)      filter.date      = req.query.date;
    if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    if (req.query.hallNo)    filter.hallNo    = req.query.hallNo;
    const records = await M.ExamAttendance.find(filter).sort({ markedAt: -1 });
    res.json(records);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/exam-attendance/halls-today  — summary per hall for a date
app.get('/api/exam-attendance/halls-today', authMiddleware, async (req, res) => {
  try {
    const { examId, date } = req.query;
    if (!examId) return res.status(400).json({ error: 'examId required' });
    const today = date || new Date().toISOString().split('T')[0];
    const records = await M.ExamAttendance.find({ examId, date: today }).sort({ markedAt: 1 });
    res.json(records);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/exam-attendance/:id
app.get('/api/exam-attendance/:id', authMiddleware, async (req, res) => {
  try {
    const rec = await M.ExamAttendance.findById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    res.json(rec);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/exam-attendance  — upsert by (examId, date, hallNo, teacherId)
app.post('/api/exam-attendance', authMiddleware, async (req, res) => {
  try {
    const { examId, date, hallNo, records } = req.body;
    if (!examId || !date || !hallNo) return res.status(400).json({ error: 'examId, date, hallNo required' });
    const exam = await M.Exam.findById(examId).select('title examType');
    const totalPresent = (records || []).filter(r => r.status === 'present').length;
    const totalAbsent  = (records || []).filter(r => r.status === 'absent').length;
    const doc = await M.ExamAttendance.findOneAndUpdate(
      { examId, date, hallNo, teacherId: req.user._id },
      { $set: { examId, date, hallNo, teacherId: req.user._id, teacherName: req.user.name, examTitle: exam ? exam.title : '', examType: exam ? exam.examType : '', records: records || [], totalPresent, totalAbsent, markedAt: new Date() } },
      { new: true, upsert: true }
    );
    await logAction(req.user._id, req.user.name, req.user.role, 'Exam Attendance Submitted', `Hall ${hallNo} | ${date} | P:${totalPresent} A:${totalAbsent}`, 'attendance', 'info', req.ip);
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  STUDENT EXAM SEARCH
// ════════════════════════════════════════════════════════

// GET /api/students/exam-search?q=7140&depts=CSE,ECE&year=III
app.get('/api/students/exam-search', authMiddleware, async (req, res) => {
  try {
    const { q, depts, year } = req.query;
    if (!q || q.length < 3) return res.json([]);
    const filter = { regNo: { $regex: `^${q}`, $options: 'i' } };
    if (depts) filter.deptName = { $in: depts.split(',').map(d => d.trim()).filter(Boolean) };
    if (year)  filter.year = year;
    const students = await M.Student.find(filter).select('name regNo deptName year classId _id').limit(20);
    res.json(students);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  MANAGE ADMIN ROUTES
// ════════════════════════════════════════════════════════

// GET /api/manage-admins
app.get('/api/manage-admins', authMiddleware, adminOnly, async (req, res) => {
  try {
    const admins = await M.ManageAdmin.find().select('-password').sort({ createdAt: -1 });
    res.json(admins);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/manage-admins
app.post('/api/manage-admins', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, username, password, email, permissions } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username, password required' });
    const exists = await M.ManageAdmin.findOne({ username: username.toLowerCase().trim() });
    if (exists) return res.status(400).json({ error: 'Username already taken' });
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash(password, 10);
    const admin  = await M.ManageAdmin.create({ name: name.trim(), username: username.toLowerCase().trim(), password: hashed, email: email || '', permissions: permissions || ['calendar','exam','attendance'], addedBy: req.user.name });
    await logAction(req.user._id, req.user.name, req.user.role, 'Manage Admin Created', name, 'manage', 'info', req.ip);
    const { password: _, ...safe } = admin.toObject();
    res.json(safe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/manage-admins/:id
app.put('/api/manage-admins/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const update = {};
    if (req.body.name)        update.name        = req.body.name.trim();
    if (req.body.email)       update.email       = req.body.email;
    if (req.body.permissions) update.permissions = req.body.permissions;
    if (typeof req.body.active === 'boolean') update.active = req.body.active;
    if (req.body.password) {
      const bcrypt = require('bcryptjs');
      update.password = await bcrypt.hash(req.body.password, 10);
    }
    const admin = await M.ManageAdmin.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).select('-password');
    if (!admin) return res.status(404).json({ error: 'Not found' });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/manage-admins/:id
app.delete('/api/manage-admins/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const admin = await M.ManageAdmin.findByIdAndDelete(req.params.id);
    if (!admin) return res.status(404).json({ error: 'Not found' });
    await logAction(req.user._id, req.user.name, req.user.role, 'Manage Admin Deleted', admin.name, 'manage', 'warn', req.ip);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Start Server ──────────────────────────────────────
const PORT = process.env.PORT || cfg.PORT;
app.listen(PORT, () => {
  console.log(`1/3 : 🚀 EAMS API running → http://localhost:${PORT}`);
  console.log(`2/3 :    Environment: ${cfg.NODE_ENV}`);
});