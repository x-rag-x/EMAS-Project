const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const M = require('../models');
const cfg = require('../config');
const { authMiddleware, adminOnly, getRoleModel } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const { sanitizeToString } = require('../utils/sanitizeQuery');

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = sanitizeToString(req.query.role);

    const users = await M.User.find(filter).sort({ role: 1, username: 1 }).lean();

    // Enrich with names
    const enrichedUsers = await Promise.all(users.map(async (u) => {
      let name = '';
      if (u.role === 'admin') {
        const doc = await M.Admin.findOne({ trackId: u.trackId }, 'fullName').lean();
        name = doc ? doc.fullName : '';
      } else if (u.role === 'teacher') {
        const doc = await M.Teacher.findOne({ trackId: u.trackId }, 'fullName').lean();
        name = doc ? doc.fullName : '';
      } else if (u.role === 'student') {
        const doc = await M.Student.findOne({ trackId: u.trackId }, 'fullName').lean();
        name = doc ? doc.fullName : '';
      }
      return { ...u, name: name || u.username };
    }));

    let result = enrichedUsers;
    if (req.query.search) {
      const re = new RegExp(escapeRegex(req.query.search), 'i');
      result = enrichedUsers.filter(u =>
        re.test(u.username) ||
        re.test(u.name) ||
        re.test(u.role) ||
        re.test(u.status)
      );
    }

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const isSelf = String(req.user._id) === String(req.params.id);
    const isAdmin = req.user.role === 'admin';
    
    const reqUser = await M.User.findById(req.user._id).lean();
    const rights = reqUser?.adminRights;
    const hasManageUser = rights === 'all' || (Array.isArray(rights) && rights.includes('managePage'));
    const canEditOthers = isAdmin || hasManageUser;

    if (!isSelf && !canEditOthers) {
      return res.status(403).json({ error: 'Forbidden: cannot edit other users' });
    }

    const { password, currentPassword, name, status, active } = req.body;

    const user = await M.User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update role-specific password/name if provided
    const model = getRoleModel(user.role);
    if (model) {
      const roleDoc = await model.findOne({ trackId: user.trackId });
      if (roleDoc) {
        if (password) {
          if (isSelf) {
            if (!currentPassword) return res.status(400).json({ error: 'Current password is required' });
            const validPassword = await bcrypt.compare(currentPassword, roleDoc.password);
            if (!validPassword) return res.status(401).json({ error: 'Current password is incorrect' });
          }
          roleDoc.password = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
        }
        if (name) {
          roleDoc.fullName = name;
        }
        await roleDoc.save();
      }
    }

    // Update shadow user status
    if (status) {
      user.status = status;
      if (status === 'active') {
        await M.LoginHistory.updateOne(
          { trackId: user.trackId },
          { $set: { failedLogins: 0, lockedUntil: null } }
        );
      }
    }
    if (active !== undefined) {
      user.status = active ? 'active' : 'inactive';
      if (active) {
        await M.LoginHistory.updateOne(
          { trackId: user.trackId },
          { $set: { failedLogins: 0, lockedUntil: null } }
        );
      }
    }
    await user.save();

    await logAction(req.user._id, req.user.name, req.user.role,
      isSelf ? 'Profile Updated' : 'User Updated', user?.username, 'data', 'info', req.ip);
    
    const responseUser = user.toObject();
    responseUser.name = name || user.username;
    res.json(responseUser);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const user = await M.User.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true });
  await logAction(req.user._id, req.user.name, req.user.role, 'User Deactivated', user?.username, 'data', 'warning', req.ip);
  res.json({ deleted: true });
});

module.exports = router;