const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

router.get('/', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.user.role === 'teacher') filter.teacherId = req.user._id;
  res.json(await M.Grievance.find(filter).sort({ createdAt: -1 }));
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const grievance = await M.Grievance.create({ ...req.body, teacherId: req.user._id, teacherName: req.user.name });
    await M.Notification.create({ type: 'request', from: req.user.name, fromRole: 'Teacher', message: `[Grievance] ${req.body.subject} — ${req.body.detail.slice(0, 100)}`, time: new Date(), priority: 'Normal', grievanceId: grievance._id });
    await logAction(req.user._id, req.user.name, req.user.role, 'Grievance Filed', req.body.subject, 'data', 'info', req.ip);
    res.status(201).json(grievance);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;