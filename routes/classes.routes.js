const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

router.get('/', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.deptId) filter.deptId = req.query.deptId;
  res.json(await M.Class.find(filter).sort({ name: 1 }));
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const cls = await M.Class.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Class Added', cls.name, 'data', 'info', req.ip);
    res.status(201).json(cls);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const cls = await M.Class.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'Class Updated', cls?.name, 'data', 'info', req.ip);
  res.json(cls);
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const cls = await M.Class.findById(req.params.id).lean();
  if (cls) {
    await M.UndoLog.create({
      collectionName: 'classes', label: `Class: ${cls.name}`,
      snapshot: cls, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
    await M.Class.findByIdAndDelete(req.params.id);
  }
  await logAction(req.user._id, req.user.name, req.user.role, 'Class Deleted', cls?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

module.exports = router;