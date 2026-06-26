const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const { refreshExamStatuses } = require('../utils/examUtils');
const { dateToDow } = require('../utils/dateUtils');

router.get('/', authMiddleware, async (req, res) => {
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
router.get('/active', authMiddleware, async (req, res) => {
  try {
    await refreshExamStatuses();
    const exams = await M.Exam.find({ status: { $in: ['upcoming','ongoing'] } }).sort({ startDate: 1 });
    res.json(exams);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/exams/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const exam = await M.Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Not found' });
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/exams  — create exam + auto-mark calendar days
router.post('/', authMiddleware, adminOnly, async (req, res) => {
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
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const exam = await M.Exam.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!exam) return res.status(404).json({ error: 'Not found' });
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/exams/:id
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const exam = await M.Exam.findByIdAndDelete(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Not found' });
    // Remove auto-generated calendar entries for this exam
    await M.CalendarDay.deleteMany({ markedBy: 'exam:' + req.params.id });
    await logAction(req.user._id, req.user.name, req.user.role, 'Exam Deleted', exam.title, 'manage', 'warn', req.ip);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;