const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

router.get('/', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.teacherId) filter.teacherId = req.query.teacherId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.date) filter.date = req.query.date;
  if (req.query.from && req.query.to) filter.date = { $gte: req.query.from, $lte: req.query.to };
  res.json(await M.Attendance.find(filter).sort({ date: -1 }).limit(500));
});

// Bulk delete all attendance (admin only)
router.delete('/all', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await M.Attendance.deleteMany({});
    await logAction(req.user._id, req.user.name, req.user.role, 'Attendance Cleared', `All ${result.deletedCount} records deleted`, 'data', 'warning', req.ip);
    res.json({ deleted: result.deletedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete single attendance record
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await M.Attendance.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
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

router.get('/unmarked-teachers', authMiddleware, adminOnly, async (req, res) => {
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

module.exports = router;