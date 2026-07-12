const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const { sanitizeToString } = require('../utils/sanitizeQuery');

router.get('/', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.deptId) filter.deptId = sanitizeToString(req.query.deptId);
  res.json(await M.Subject.find(filter).sort({ name: 1 }));
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const subj = await M.Subject.create(req.body);
    await logAction(req.user._id, req.user.name, req.user.role, 'Subject Added', `${subj.name} (${subj.code})`, 'data', 'info', req.ip);
    res.status(201).json(subj);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const subj = await M.Subject.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'Subject Updated', subj?.name, 'data', 'info', req.ip);
  res.json(subj);
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const subj = await M.Subject.findById(req.params.id).lean();
  if (subj) {
    await M.UndoLog.create({
      collectionName: 'subjects', label: `Subject: ${subj.name} (${subj.code || ''})`,
      snapshot: subj, deletedBy: req.user.name, expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
    await M.Subject.findByIdAndDelete(req.params.id);
  }
  await logAction(req.user._id, req.user.name, req.user.role, 'Subject Deleted', subj?.name, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

module.exports = router;