const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const { _serverStartTime, _serverLogs } = require('../utils/serverState');

// ════════════════════════════════════════════════════════
//  BACKUP  (full DB snapshot — GDrive upload stub)
// ════════════════════════════════════════════════════════
router.post('/backup', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [students, teachers, departments, classes, subjects, classAttendance, studentAttendance, assignments] = await Promise.all([
      M.Student.find().lean(),
      M.Teacher.find({}, '-password').lean(),
      M.Department.find().lean(),
      M.Class.find().lean(),
      M.Subject.find().lean(),
      M.ClassAttendance.find().lean(),
      M.StudentAttendance.find().lean(),
      M.Assignment.find().lean(),
    ]);
    const totalDocs = students.length + teachers.length + departments.length
      + classes.length + subjects.length + classAttendance.length + studentAttendance.length + assignments.length;
    const backupPayload = {
      meta: { createdAt: new Date().toISOString(), createdBy: req.user.name, totalDocs },
      students, teachers, departments, classes, subjects, classAttendance, studentAttendance, assignments
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
        classes: classes.length, subjects: subjects.length,
        classAttendance: classAttendance.length, studentAttendance: studentAttendance.length,
        assignments: assignments.length
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/backup/history', authMiddleware, adminOnly, async (req, res) => {
  try {
    const logs = await M.Log.find({ action: 'System Backup Created' }).sort({ time: -1 }).limit(20).lean();
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
//  EXPORT DATA  (password-protected, email stub)
// ════════════════════════════════════════════════════════
router.post('/export', authMiddleware, adminOnly, async (req, res) => {
  try {
    const type = req.body.type || 'all';
    const studentCount = await M.Student.countDocuments();
    let payload;
    if (type === 'all') {
      const [students, teachers, departments, classes, subjects, classAttendance, studentAttendance, assignments] = await Promise.all([
        M.Student.find().lean(), M.Teacher.find({}, '-password').lean(),
        M.Department.find().lean(), M.Class.find().lean(), M.Subject.find().lean(),
        M.ClassAttendance.find().lean(), M.StudentAttendance.find().lean(), M.Assignment.find().lean(),
      ]);
      payload = {
        meta: {
          exportedAt: new Date().toISOString(), exportedBy: req.user.name,
          type, totalStudents: studentCount
        }, students, teachers, departments, classes, subjects, classAttendance, studentAttendance, assignments
      };
    } else {
      const dataMap = {
        students: () => M.Student.find().lean(),
        teachers: () => M.Teacher.find({}, '-password').lean(),
        attendance: () => M.ClassAttendance.find().lean(),
        studentAttendance: () => M.StudentAttendance.find().lean(),
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
//  DB STATS
// ════════════════════════════════════════════════════════
router.get('/dbstats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const stats = await db.command({ dbStats: 1, scale: 1024 * 1024 });
    const collList = await db.listCollections().toArray();
    const collStats = await Promise.all(collList.map(async c => ({ name: c.name, count: await db.collection(c.name).countDocuments() })));
    res.json({ dbName: stats.db, collections: stats.collections, totalDocs: stats.objects, dataSize: stats.dataSize.toFixed(2), storageSize: stats.storageSize.toFixed(2), indexSize: stats.indexSize ? stats.indexSize.toFixed(2) : '0.00', fsTotalSize: stats.fsTotalSize ? (stats.fsTotalSize / 1024 / 1024).toFixed(0) : null, fsUsedSize: stats.fsUsedSize ? (stats.fsUsedSize / 1024 / 1024).toFixed(0) : null, collStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/serverlogs', authMiddleware, adminOnly, (req, res) => {
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
router.get('/health', authMiddleware, adminOnly, async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStateMap = { 0: 'Disconnected', 1: 'Connected', 2: 'Connecting', 3: 'Disconnecting' };
    const activeTeachersCount = await M.User.countDocuments({ role: 'teacher', status: 'active' });
    const activeStudentsCount = await M.User.countDocuments({ role: 'student', status: 'active' });
    const activeAdminsCount = await M.User.countDocuments({ role: 'admin', status: 'active' });
    
    const [errorCount, warnCount] = await Promise.all([
      M.Log.countDocuments({ severity: { $in: ['critical', 'error'] } }),
      M.Log.countDocuments({ severity: 'warning' }),
    ]);
    const totalUsers = activeTeachersCount + activeStudentsCount + activeAdminsCount;
    const activeTeachers = activeTeachersCount;
    const errFilter = { severity: { $in: ['critical', 'error', 'warning'] } };
    const errLimit = Math.min(100, Math.max(1, parseInt(req.query.errLimit, 10) || 20));
    if (req.query.errMode === 'week') {
      errFilter.time = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    }
    const recentErrors = await M.Log.find(errFilter)
      .sort({ time: -1 }).limit(req.query.errMode === 'week' ? 100 : errLimit).lean();
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
//  DELETE ADDER  (bulk-wipe one or more core collections)
// ════════════════════════════════════════════════════════
const ADDER_MODELS = {
  departments: M.Department,
  classes:     M.Class,
  subjects:    M.Subject,
  students:    M.Student,
  teachers:    M.Teacher,
};

router.post('/delete-adder', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { collections } = req.body;
    if (!Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ success: false, error: 'No collections specified' });
    }
    const invalid = collections.filter((c) => !ADDER_MODELS[c]);
    if (invalid.length) {
      return res.status(400).json({ success: false, error: 'Unknown collection(s): ' + invalid.join(', ') });
    }

    let deleted = 0;
    for (const name of collections) {
      const result = await ADDER_MODELS[name].deleteMany({});
      deleted += result.deletedCount || 0;
      // Students and teachers also have a shadow User account - clean those up too
      // so no orphaned, un-loginable shadow accounts are left behind.
      if (name === 'students') {
        const shadow = await M.User.deleteMany({ role: 'student' });
        deleted += shadow.deletedCount || 0;
      } else if (name === 'teachers') {
        const shadow = await M.User.deleteMany({ role: 'teacher' });
        deleted += shadow.deletedCount || 0;
      }
    }

    await logAction(req.user.trackId, req.user.name, req.user.role, 'Bulk Delete', 'Deleted collections: ' + collections.join(', '), 'data', 'warning', req.ip);
    res.json({ success: true, deleted, collections });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;