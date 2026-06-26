const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

// GET /api/logs -> fetch all database logs
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const logs = await M.Log.find().sort({ time: -1 }).limit(200);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/logs -> log a new action
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { action, details, category, role } = req.body;
    await M.Log.create({
      userName: req.user.name,
      role: role || req.user.role,
      action,
      details: details || '',
      category: category || 'general',
      severity: 'info',
      ip: req.ip,
      sessionId: req.headers['x-session-id'] || ''
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/logs/all -> clear all logs
router.delete('/all', authMiddleware, adminOnly, async (req, res) => {
  try {
    await M.Log.deleteMany({});
    await logAction(req.user._id, req.user.name, req.user.role, 'Logs Cleared', 'All logs deleted', 'settings', 'warning', req.ip);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/logs/:id -> delete a single log
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await M.Log.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
