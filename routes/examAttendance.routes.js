const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

router.get('/', authMiddleware, async (req, res) => {
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
router.get('/halls-today', authMiddleware, async (req, res) => {
  try {
    const { examId, date } = req.query;
    if (!examId) return res.status(400).json({ error: 'examId required' });
    const today = date || new Date().toISOString().split('T')[0];
    const records = await M.ExamAttendance.find({ examId, date: today }).sort({ markedAt: 1 });
    res.json(records);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/exam-attendance/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const rec = await M.ExamAttendance.findById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    res.json(rec);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/exam-attendance  — upsert by (examId, date, hallNo, teacherId)
router.post('/', authMiddleware, async (req, res) => {
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

module.exports = router;