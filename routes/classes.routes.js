const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const { sanitizeToString } = require('../utils/sanitizeQuery');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = {};
    if (req.query.deptId) filter.deptId = sanitizeToString(req.query.deptId);
    if (req.query.batch) filter.batch = sanitizeToString(req.query.batch);
    const classes = await M.Class.find(filter).sort({ name: 1 }).lean();
    // Attach studentCount per class via aggregate to avoid client-side full scan
    const classIds = classes.map(function (c) { return c._id; });
    const counts = classIds.length
      ? await M.Student.aggregate([
          { $match: { classId: { $in: classIds } } },
          { $group: { _id: '$classId', count: { $sum: 1 } } }
        ])
      : [];
    const countMap = {};
    counts.forEach(function (c) { countMap[String(c._id)] = c.count; });
    classes.forEach(function (cls) { cls.studentCount = countMap[String(cls._id)] || 0; });
    res.json(classes);
  } catch (err) { res.status(500).json({ error: err.message }); }
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