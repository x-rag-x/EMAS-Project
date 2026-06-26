const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.get('/summary', authMiddleware, adminOnly, async (req, res) => {
  const [students, depts, teachers, classes, pendingNotifs] = await Promise.all([
    M.Student.countDocuments(),
    M.Department.countDocuments(),
    M.User.countDocuments({ role: 'teacher', status: 'active' }),
    M.Class.countDocuments(),
    M.Notification.countDocuments({ status: 'Pending', read: false }),
  ]);
  res.json({ students, depts, teachers, classes, pendingNotifs });
});

module.exports = router;