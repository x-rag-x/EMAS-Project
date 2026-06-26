const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const { dateToDow, satOrdinal } = require('../utils/dateUtils');

// GET /api/calendar  — all days in a month
router.get('/', authMiddleware, async (req, res) => {
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
router.get('/check/:date', authMiddleware, async (req, res) => {
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
router.post('/', authMiddleware, adminOnly, async (req, res) => {
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
router.put('/:date', authMiddleware, adminOnly, async (req, res) => {
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
router.delete('/:date', authMiddleware, adminOnly, async (req, res) => {
  try {
    await M.CalendarDay.deleteOne({ date: req.params.date });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/calendar/bulk-generate  — auto-fill month with default rules
router.post('/bulk-generate', authMiddleware, adminOnly, async (req, res) => {
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

module.exports = router;