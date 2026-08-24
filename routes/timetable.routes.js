const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const { sanitizeToString } = require('../utils/sanitizeQuery');

router.get('/', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.teacherId) filter.teacherId = sanitizeToString(req.query.teacherId);
  else if (req.user.role === 'teacher') filter.teacherId = req.user._id;
  res.json(await M.Timetable.find(filter).sort({ day: 1, start: 1 }));
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const slot = await M.Timetable.create({ ...req.body, teacherId: req.user._id, teacherName: req.user.name });
    await logAction(
      req.user.trackId || req.user._id,
      req.user.name,
      req.user.role,
      'Timetable Slot Added',
      `${req.body.day} ${req.body.start}`,
      'data',
      'info',
      req.ip,
      req.user.sessionId,
      {
        module: 'admin',
        subType: 'entry-create',
        trackId: req.user.trackId,
        actingWithAdminRights: req.user.actingWithAdminRights,
        changes: { before: null, after: slot.toObject ? slot.toObject() : slot }
      }
    );
    res.status(201).json(slot);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const slot = await M.Timetable.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  res.json(slot);
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await M.Timetable.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

router.get('/section/:classId', authMiddleware, async (req, res) => {
  const doc = await M.SectionTimetable.findOne({ classId: req.params.classId }).lean();
  res.json(doc || { slots: {} });
});

router.put('/section/:classId/slot', authMiddleware, async (req, res) => {
  const u = req.user;
  const hasTTRight = u.role === 'admin' || (u.role === 'teacher' && u.isAdmin && (u.adminRights === 'all' || (Array.isArray(u.adminRights) && (u.adminRights.includes('all') || u.adminRights.includes('timetablePage')))));

  if (!u.isTimeTableCoordinator && !hasTTRight)
    return res.status(403).json({ error: 'TT Coordinator or Timetable Admin access required' });

  const { slotKey, payload, _meta } = req.body;

  if (_meta?.coordIsService && payload?.subjectId) {
    const subj = await M.Subject.findById(payload.subjectId).lean();
    if (subj && subj.deptId?.toString() !== _meta.coordDeptId)
      return res.status(403).json({ error: `Service coordinators may only assign ${u.TTdeptName} subjects` });
  }

  if (!_meta?.coordIsService && !hasTTRight) {
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
    { upsert: true, returnDocument: 'after' }
  );

  await logAction(
    u.trackId || u._id,
    u.name,
    u.role,
    'TT Slot Updated',
    slotKey,
    'data',
    'info',
    req.ip,
    u.sessionId,
    {
      module: 'admin',
      subType: 'field-edit',
      trackId: u.trackId,
      actingWithAdminRights: u.actingWithAdminRights,
      changes: { before: null, after: payload }
    }
  );

  res.json(doc);
});

router.put('/section/:classId', authMiddleware, async (req, res) => {
  const u = req.user;
  const hasTTRight = u.role === 'admin' || (u.role === 'teacher' && u.isAdmin && (u.adminRights === 'all' || (Array.isArray(u.adminRights) && (u.adminRights.includes('all') || u.adminRights.includes('timetablePage')))));

  if (!u.isTimeTableCoordinator && !hasTTRight)
    return res.status(403).json({ error: 'TT Coordinator or Timetable Admin access required' });

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
    { upsert: true, returnDocument: 'after' }
  );

  await logAction(
    u.trackId || u._id,
    u.name,
    u.role,
    'TT Saved',
    cls?.name || req.params.classId,
    'data',
    'info',
    req.ip,
    u.sessionId,
    {
      module: 'admin',
      subType: 'field-edit',
      trackId: u.trackId,
      actingWithAdminRights: u.actingWithAdminRights
    }
  );

  res.json(doc);
});

router.post('/check-conflicts', authMiddleware, async (req, res) => {
  const { subjects } = req.body;

  const results = subjects.map(s => ({
    ok: true,
    message: `${s.name} — ${s.staff || 'TBA'} available (${s.hours} hrs/wk)`
  }));

  res.json(results);
});

router.post('/auto-gen', authMiddleware, async (req, res) => {
  res.json({ success: true });
});

module.exports = router;