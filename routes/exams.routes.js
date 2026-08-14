const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const { refreshExamStatuses } = require('../utils/examUtils');
const { dateToDow } = require('../utils/dateUtils');
const { sanitizeToString } = require('../utils/sanitizeQuery');

router.get('/', authMiddleware, async (req, res) => {
  try {
    await refreshExamStatuses();
    const filter = {};
    if (req.query.examType)    filter.examType    = sanitizeToString(req.query.examType);
    if (req.query.semester)    filter.semester    = sanitizeToString(req.query.semester);
    if (req.query.status)      filter.status      = sanitizeToString(req.query.status);
    if (req.query.academicYear) filter.academicYear = sanitizeToString(req.query.academicYear);
    if (req.query.deptName)    filter.deptName    = sanitizeToString(req.query.deptName);
    if (req.query.batch)       filter.batch       = sanitizeToString(req.query.batch);
    const exams = await M.Exam.find(filter).sort({ createdAt: -1 });
    res.json(exams);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/exams/active  — ongoing or starting today/upcoming within 7 days
router.get('/active', authMiddleware, async (req, res) => {
  try {
    await refreshExamStatuses();
    const exams = await M.Exam.find({ status: { $in: ['upcoming', 'ongoing'] } }).sort({ createdAt: 1 });
    res.json(exams);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/exams/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const exam = await M.Exam.findOne({ ExamTrackId: req.params.id });
    if (!exam) return res.status(404).json({ error: 'Not found' });
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/exams  — create exam + auto-mark calendar days
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { title, examType, academicYear, semester, batch, deptId, deptName, Dates, timing, notes, status, isFinalized } = req.body;
    if (!title || !examType || !semester || !Dates || !Array.isArray(Dates) || Dates.length === 0) {
      return res.status(400).json({ error: 'title, examType, semester, and Dates array required' });
    }
    
    // Generate unique ExamTrackId
    const trackId = `TR-EXM${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    const examData = { ExamTrackId: trackId, batch: batch || '', academicYear: academicYear || '', semester, deptName: deptName || '', examType, title, Dates,
      timing: timing || { start: '09:30', end: '12:30' }, notes: notes || '', status: status || 'upcoming', createdBy: req.user.name };
    
    if (isFinalized) {
      examData.isFinalized = true;
      examData.finalizedBy = req.user.name;
      examData.finalizedAt = new Date();
    }
    
    const exam = await M.Exam.create(examData);
    
    // Auto-mark calendar days
    const calOps = [];
    const semesterYear = ['I', 'II'].includes(semester) ? 'I' : ['III', 'IV'].includes(semester) ? 'II' : ['V', 'VI'].includes(semester) ? 'III' : 'IV';
    
    for (const dateStr of Dates) {
      const d = new Date(dateStr + 'T00:00:00');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = String(d.getFullYear());
      
      calOps.push({
        updateOne: {
          filter: { date: d },
          update: {
            $setOnInsert: {
              CalendarTrackId: `TR-CAL${year}${month}${String(d.getDate()).padStart(2, '0')}-${Date.now()}`,
              month,
              year,
              day: dateToDow(dateStr),
              createdBy: 'system-exam'
            },
            $set: {
              date: d,
              [`details.$[elem].dayType`]: 'exam'
            }
          },
          arrayFilters: [{ 'elem.year': semesterYear }],
          upsert: true
        }
      });
    }
    
    if (calOps.length) {
      try {
        await M.CalendarDay.bulkWrite(calOps);
      } catch (bulkErr) {
        // If arrayFilters fail, fallback to individual updates
        for (const dateStr of Dates) {
          const d = new Date(dateStr + 'T00:00:00');
          const existing = await M.CalendarDay.findOne({ date: d });
          if (existing) {
            const updatedDetails = existing.details.map(det => 
              det.year === semesterYear ? { ...det, dayType: 'exam' } : det
            );
            await M.CalendarDay.updateOne({ date: d }, { $set: { details: updatedDetails } });
          }
        }
      }
    }
    
    await logAction(req.user._id, req.user.name, req.user.role, 'Exam Created', `${title} (${Dates.length} dates)`, 'manage', 'info', req.ip);
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/exams/:id
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { title, examType, academicYear, semester, batch, deptName, Dates, timing, notes, status, isFinalized } = req.body;
    
    const updateData = {};
    if (title) updateData.title = title;
    if (examType) updateData.examType = examType;
    if (academicYear) updateData.academicYear = academicYear;
    if (semester) updateData.semester = semester;
    if (batch) updateData.batch = batch;
    if (deptName) updateData.deptName = deptName;
    if (Dates) updateData.Dates = Dates;
    if (timing) updateData.timing = timing;
    if (notes !== undefined) updateData.notes = notes;
    if (status) updateData.status = status;
    
    if (isFinalized) {
      updateData.isFinalized = true;
      updateData.finalizedBy = req.user.name;
      updateData.finalizedAt = new Date();
    }
    
    const exam = await M.Exam.findOneAndUpdate(
      { ExamTrackId: req.params.id },
      { 
        $set: updateData,
        $push: {
          history: {
            updatedBy: req.user.name,
            updatedAt: new Date(),
            field: 'exam_update',
            oldValue: '',
            newValue: JSON.stringify(updateData)
          }
        }
      },
      { new: true }
    );
    
    if (!exam) return res.status(404).json({ error: 'Not found' });
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/exams/:id
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const exam = await M.Exam.findOneAndDelete({ ExamTrackId: req.params.id });
    if (!exam) return res.status(404).json({ error: 'Not found' });
    
    // Remove auto-generated calendar entries for this exam (optional cleanup)
    // Since we modified existing calendar days, we don't delete them
    
    await logAction(req.user._id, req.user.name, req.user.role, 'Exam Deleted', exam.title, 'manage', 'warn', req.ip);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;