const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

router.get('/', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.user.role === 'teacher') filter.$or = [{ toTeacherId: req.user._id }, { toTeacherId: null, type: { $ne: 'attendance-alert' } }];
  res.json(await M.Notification.find(filter).sort({ time: -1 }).limit(50));
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const notif = await M.Notification.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Notification Sent', req.body.message?.slice(0, 80), 'data', 'info', req.ip);
    res.status(201).json(notif);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Bulk delete all notifications (admin only)
router.delete('/all', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await M.Notification.deleteMany({});
    await logAction(req.user._id, req.user.name, req.user.role, 'Notifications Cleared', `All ${result.deletedCount} notifications deleted`, 'data', 'warning', req.ip);
    res.json({ deleted: result.deletedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const notif = await M.Notification.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (req.body.status === 'Solved' && notif?.grievanceId) await M.Grievance.findByIdAndUpdate(notif.grievanceId, { status: 'Resolved', resolvedAt: new Date(), resolvedBy: req.user.name });
  if (req.body.status === 'Cancelled' && notif?.grievanceId) await M.Grievance.findByIdAndUpdate(notif.grievanceId, { status: 'Cancelled', cancelledAt: new Date() });
  await logAction(req.user._id, req.user.name, req.user.role, 'Notification ' + (req.body.status || 'Updated'), '', 'data', 'info', req.ip);
  res.json(notif);
});

module.exports = router;