const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const admins = await M.ManageAdmin.find().select('-password').sort({ createdAt: -1 });
    res.json(admins);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/manage-admins
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, username, password, email, permissions } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username, password required' });
    const exists = await M.ManageAdmin.findOne({ username: username.toLowerCase().trim() });
    if (exists) return res.status(400).json({ error: 'Username already taken' });
    const hashed = await bcrypt.hash(password, 10);
    const admin  = await M.ManageAdmin.create({ name: name.trim(), username: username.toLowerCase().trim(), password: hashed, email: email || '', permissions: permissions || ['calendar','exam','attendance'], addedBy: req.user.name });
    await logAction(req.user._id, req.user.name, req.user.role, 'Manage Admin Created', name, 'manage', 'info', req.ip);
    const { password: _, ...safe } = admin.toObject();
    res.json(safe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/manage-admins/:id
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const update = {};
    if (req.body.name)        update.name        = req.body.name.trim();
    if (req.body.email)       update.email       = req.body.email;
    if (req.body.permissions) update.permissions = req.body.permissions;
    if (typeof req.body.active === 'boolean') update.active = req.body.active;
    if (req.body.password) {
      update.password = await bcrypt.hash(req.body.password, 10);
    }
    const admin = await M.ManageAdmin.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).select('-password');
    if (!admin) return res.status(404).json({ error: 'Not found' });
    res.json(admin);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/manage-admins/:id
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const admin = await M.ManageAdmin.findByIdAndDelete(req.params.id);
    if (!admin) return res.status(404).json({ error: 'Not found' });
    await logAction(req.user._id, req.user.name, req.user.role, 'Manage Admin Deleted', admin.name, 'manage', 'warn', req.ip);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;