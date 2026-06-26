const M = require('../models');

// ── Check maintenance mode ────────────────────────────
async function checkMaintenance(req, res, next) {
  const setting = await M.Settings.findOne({ key: 'maintenance' });
  if (setting?.value?.active && req.user?.role !== 'admin') {
    const v = setting.value;
    const affected = v.affectedRoles?.length ? v.affectedRoles : ['teacher', 'student'];
    if (affected.includes(req.user?.role)) {
      return res.status(503).json({
        error: v.message || 'System is under maintenance.',
        maintenance: true,
        message: v.message || 'System is under maintenance.',
        affectedRoles: affected,
        endTime: v.endTime || null,
        startedAt: v.startedAt || null,
      });
    }
  }
  next();
}

module.exports = { checkMaintenance };