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
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const mm = String(month).padStart(2, '0');
    const yyyy = String(year);
    const days = await M.CalendarDay.find({ month: mm, year: yyyy }).sort({ date: 1 });
    res.json(days);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/calendar/check/:date  — single day status + exam info
router.get('/check/:date', authMiddleware, async (req, res) => {
  try {
    const { date } = req.params;
    const dateObj = new Date(date + 'T00:00:00');
    const [day, exams] = await Promise.all([
      M.CalendarDay.findOne({ date: dateObj }),
      M.Exam.find({ Dates: date, status: { $in: ['upcoming', 'ongoing'] } })
    ]);
    const defaults = { details: [{ year: 'I', dayType: dateObj.getDay() === 0 ? 'holiday' : 'working', comments: '', timing: { start: '08:30', end: '16:30' }
      }]
    };
    res.json({ ...(day ? day.toObject() : defaults), hasExam: exams.length > 0, exams });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/calendar  — upsert a single day (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { date, details, isFinalized } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });
    if (!details || !Array.isArray(details)) return res.status(400).json({ error: 'details array required' });
    
    const dateObj = new Date(date + 'T00:00:00');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = String(dateObj.getFullYear());
    const day = dateToDow(date);
    
    // Generate unique CalendarTrackId if new
    let trackId;
    const existing = await M.CalendarDay.findOne({ date: dateObj });
    if (existing) { trackId = existing.CalendarTrackId; }
    else { trackId = `TR-CAL${year}${month}${String(dateObj.getDate()).padStart(2, '0')}-${Date.now()}`; }
    
    const updateData = { CalendarTrackId: trackId, date: dateObj, month, year, day, details, createdBy: req.user.name};
    if (isFinalized) { updateData.isFinalized = true; updateData.finalizedBy = req.user.name; updateData.finalizedAt = new Date();}
    
    const doc = await M.CalendarDay.findOneAndUpdate(
      { date: dateObj },
      { 
        $set: updateData,
        $push: {
          history: { updatedBy: req.user.name, updatedAt: new Date(), field: 'details', 
            oldValue: existing ? JSON.stringify(existing.details) : '', newValue: JSON.stringify(details)
          }
        }
      },
      { new: true, upsert: true }
    );
    await logAction(req.user._id, req.user.name, req.user.role, 'Calendar Day Updated', `${date}`, 'manage', 'info', req.ip);
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/calendar/:date  — same as POST
router.put('/:date', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { date } = req.params;
    const { details, isFinalized } = req.body;
    if (!details || !Array.isArray(details)) return res.status(400).json({ error: 'details array required' });
    
    const dateObj = new Date(date + 'T00:00:00');
    const existing = await M.CalendarDay.findOne({ date: dateObj });
    
    const updateData = { details, day: dateToDow(date) };
    
    if (isFinalized) { updateData.isFinalized = true; updateData.finalizedBy = req.user.name; updateData.finalizedAt = new Date(); }
    
    const doc = await M.CalendarDay.findOneAndUpdate(
      { date: dateObj },
      { $set: updateData, $push: { history: {updatedBy: req.user.name, updatedAt: new Date(), field: 'details', oldValue: existing ? JSON.stringify(existing.details) : '', newValue: JSON.stringify(details) } } },
      { new: true, upsert: true }
    );
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/calendar/:date  — remove override, revert to auto-default
router.delete('/:date', authMiddleware, adminOnly, async (req, res) => {
  try {
    const dateObj = new Date(req.params.date + 'T00:00:00');
    await M.CalendarDay.deleteOne({ date: dateObj });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/calendar/day-details/:date  — single day with exam info for specific student
router.get('/day-details/:date', authMiddleware, async (req, res) => {
  try {
    const { date } = req.params;
    const { trackId } = req.query;
    const dateObj = new Date(date + 'T00:00:00');
    const [day, exams] = await Promise.all([M.CalendarDay.findOne({ date: dateObj }),M.Exam.find({ Dates: date })]);
    if (!day) return res.status(404).json({ error: 'Day not found' });
    let filteredDetails = day.details;
    if (trackId) {
      const student = await M.Student.findOne({ studentTrackId: trackId }).select('year');
      if (student && student.year) filteredDetails = day.details.filter(d => d.year === student.year);
    }
    res.json({ ...day.toObject(), details: filteredDetails, exams: exams || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/calendar/bulk-generate  — auto-fill month with default rules
router.post('/bulk-generate', authMiddleware, adminOnly, async (req, res) => {
  try {
    const month = parseInt(req.body.month) || new Date().getMonth() + 1;
    const year = parseInt(req.body.year) || new Date().getFullYear();
    const overwriteExisting = req.body.overwriteExisting === true;
    const lastDay = new Date(year, month, 0).getDate();
    const mm = String(month).padStart(2, '0');
    const yyyy = String(year);
    let generated = 0, skipped = 0;
    const ops = [];
    
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${year}-${mm}-${String(day).padStart(2, '0')}`;
      const d = new Date(dateStr + 'T00:00:00');
      const dow = d.getDay();
      let dayType;
      
      if (dow === 0) { 
        dayType = 'holiday'; 
      } else if (dow === 6) {
        const sn = satOrdinal(dateStr);
        dayType = sn % 2 === 0 ? 'working' : 'holiday';
      } else { 
        dayType = 'working'; 
      }
      
      if (!overwriteExisting) {
        const existing = await M.CalendarDay.findOne({ date: d, isFinalized: true });
        if (existing) { skipped++; continue; }
      }
      
      const trackId = `TR-CAL${yyyy}${mm}${String(day).padStart(2, '0')}-${Date.now()}-${day}`;
      
      // Create details for all years
      const details = ['I', 'II', 'III', 'IV'].map(yr => ({year: yr, dayType, comments: '', timing: { start: '08:30', end: '16:30' } }));
      
      ops.push({ 
        updateOne: { filter: { date: d }, 
          update: { $set: { CalendarTrackId: trackId, date: d, month: mm, year: yyyy, day: dateToDow(dateStr), details, createdBy: 'system',isFinalized: false } }, 
          upsert: true 
        } 
      });
      generated++;
    }
    if (ops.length) await M.CalendarDay.bulkWrite(ops);
    res.json({ generated, skipped, month, year });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;