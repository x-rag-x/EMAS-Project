const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const cfg = require('../config');

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await M.Settings.find({ key: { $ne: 'special_delete_password' } });
    // Group rows: if the key IS one of the 5 card group keys, expose its value under that group name.
    // Individual per-field keys (institution, settings, academic, security, advanced) are stored
    // as a whole-object value under those exact key names.
    const grouped = {};
    const CARD_KEYS = ['institution', 'settings', 'academic', 'security', 'advanced', 'maintenance'];
    rows.forEach(s => {
      if (CARD_KEYS.includes(s.key)) {
        grouped[s.key] = s.value;
      }
    });
    res.json(grouped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/verify-delete-password', authMiddleware, adminOnly, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  // Check special delete password 
  if (password === cfg.DELETE_DATA_PASSWORD) {
    return res.json({ valid: true });
  }

  const useAdminPass = (await M.Settings.findOne({ key: 'settings' }))?.value?.moduleDelUseAdminPass;
  if(useAdminPass){
    // Check admin password from M.Admin
    const adminUser = await M.Admin.findOne({ trackId: req.user.trackId });
    if (adminUser) {
      const adminMatch = await bcrypt.compare(password, adminUser.password);
      if (adminMatch) return res.json({ valid: true });
    }
  }
  await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Delete Auth Failed', 'Wrong delete password attempt', 'security', 'warning', req.ip);
  res.status(403).json({ valid: false, error: 'Incorrect password' });
});

router.get('/value/:settingKey', authMiddleware, async (req, res) => {
  try {
    const settings = await M.Settings.findOne({ key: 'settings' }).lean();
    if (!settings?.value) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    const value = settings.value[req.params.settingKey];
    if (value === undefined) {
      return res.status(404).json({ error: 'Key not found' });
    }
    res.json(value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:key', authMiddleware, async (req, res) => {
  const s = await M.Settings.findOne({ key: req.params.key });
  if (!s) return res.status(404).json({ error: 'Setting not found' });
  if (req.params.key === 'special_delete_password') return res.status(403).json({ error: 'Forbidden' });
  res.json(s.value);
});

router.put('/:key', authMiddleware, adminOnly, async (req, res) => {
  if (req.params.key === 'special_delete_password') return res.status(403).json({ error: 'Forbidden' });
  const s = await M.Settings.findOneAndUpdate(
    { key: req.params.key },
    { value: req.body.value, updatedBy: req.user.name },
    { new: true, upsert: true }
  );
  // Special detailed logging for maintenance changes
  if (req.params.key === 'maintenance') {
    const v = req.body.value || {};
    const prevSetting = await M.Settings.findOne({ key: 'maintenance' });
    const action = v.active ? 'Maintenance Mode Enabled' : 'Maintenance Mode Disabled';
    const affected = (v.affectedRoles || []).join(', ') || 'none';
    const endInfo = v.endTime ? ` | End: ${new Date(v.endTime).toLocaleString('en-IN')}` : '';
    const details = `Roles blocked: ${affected}${endInfo} | Msg: "${(v.message || '').slice(0, 60)}"`;
    await logAction(req.user._id, req.user.name, req.user.role, action, details, 'maintenance', v.active ? 'warning' : 'info', req.ip);
  } else {
    await logAction(req.user._id, req.user.name, req.user.role, 'Settings Updated', `Key: ${req.params.key}`, 'settings', 'info', req.ip);
  }
  res.json(s.value);
});

module.exports = router;