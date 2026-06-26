const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

router.get('/', authMiddleware, async (req, res) => res.json(await M.Department.find().sort({ name: 1 })));

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const dept = await M.Department.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Department Added', dept.name, 'data', 'info', req.ip);
    res.status(201).json(dept);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const dept = await M.Department.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'Department Updated', dept?.name, 'data', 'info', req.ip);
  res.json(dept);
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const dept = await M.Department.findById(req.params.id).lean();
  if (dept) {
    await M.UndoLog.create({
      collectionName: 'departments', label: `Department: ${dept.name}`,
      snapshot: dept, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
    await M.Department.findByIdAndDelete(req.params.id);
  }
  await logAction(req.user._id, req.user.name, req.user.role, 'Department Deleted', dept?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

module.exports = router;