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

    // Batch enrich with names via 3 parallel queries instead of N per-user queries
    const adminTrackIds = users.filter(u => u.role === 'admin').map(u => u.trackId).filter(Boolean);
    const teacherTrackIds = users.filter(u => u.role === 'teacher').map(u => u.trackId).filter(Boolean);
    const studentTrackIds = users.filter(u => u.role === 'student').map(u => u.trackId).filter(Boolean);

    const [admins, teachers, students] = await Promise.all([
      adminTrackIds.length ? M.Admin.find({ trackId: { $in: adminTrackIds } }, 'trackId fullName').lean() : [],
      teacherTrackIds.length ? M.Teacher.find({ trackId: { $in: teacherTrackIds } }, 'trackId fullName').lean() : [],
      studentTrackIds.length ? M.Student.find({ trackId: { $in: studentTrackIds } }, 'trackId fullName').lean() : []
    ]);

    const nameMap = new Map();
    admins.forEach(a => nameMap.set(a.trackId, a.fullName));
    teachers.forEach(t => nameMap.set(t.trackId, t.fullName));
    students.forEach(s => nameMap.set(s.trackId, s.fullName));

    const enrichedUsers = users.map(u => ({
      ...u,
      name: nameMap.get(u.trackId) || u.username
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