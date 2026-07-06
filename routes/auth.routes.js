const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cfg = require('../config');
const M = require('../models');
const { authMiddleware, getRoleModel } = require('../middleware/auth');
const { logAction, parseUserAgent } = require('../utils/logAction');

function getClientDetails(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  const { deviceType, browser, os } = parseUserAgent(userAgent);
  return { ip, userAgent, deviceType, browser, os };
}

router.post('/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role)
      return res.status(400).json({ error: 'username, password and role required' });

    const model = getRoleModel(role);
    if (!model) return res.status(400).json({ error: 'Invalid role' });

    // Look up shadow user first
    let shadowUser = await M.User.findOne({ username: username.toLowerCase().trim(), role: role });
    if (!shadowUser) {
      await logAction(null, username, role, 'Login Failed', 'User not found', 'security', 'warning', req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (shadowUser.status !== 'active') {
      await logAction(shadowUser.trackId || shadowUser._id, shadowUser.username, role, 'Login Failed', `User is ` + shadowUser.status, 'security', 'warning', req.ip);
      return res.status(401).json({ error: 'Your Account is ' + shadowUser.status });
    }

    // Look up in role-specific schema to get the password
    const userDoc = await model.findOne({ username: username.toLowerCase().trim() });
    if (!userDoc) {
      await logAction(shadowUser.trackId || shadowUser._id, shadowUser.username, role, 'Login Failed', `User document not found in role model`, 'security', 'warning', req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, userDoc.password);
    if (!match) {
      await logAction(shadowUser.trackId || shadowUser._id, shadowUser.username, role, 'Login Failed', `Wrong password`, 'security', 'warning', req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check maintenance (non-admin blocked)
    if (role !== 'admin') {
      const maint = await M.Settings.findOne({ key: 'maintenance' });
      if (maint?.value?.active) {
        const v = maint.value;
        const affected = v.affectedRoles?.length ? v.affectedRoles : ['teacher', 'student'];
        if (affected.includes(role)) {
          return res.status(503).json({
            error: v.message || 'System under maintenance.',
            maintenance: true,
            message: v.message || 'System under maintenance.',
            affectedRoles: affected,
            endTime: v.endTime || null,
            startedAt: v.startedAt || null,
          });
        }
      }
    }

    let durationMins = 15;
    if (role === 'admin') durationMins = 10;
    else if (role === 'student') durationMins = 25;
    else if (role === 'teacher') durationMins = 15;

    const expiresAt = new Date(Date.now() + durationMins * 60 * 1000);
    const clientDetails = getClientDetails(req);
    const sessionId = crypto.randomBytes(16).toString('hex');
    const token = jwt.sign(
      {
        _id: shadowUser._id,
        roleId: userDoc._id,
        name: userDoc.fullName || userDoc.name || '',
        username: userDoc.username,
        role: role,
        trackId: userDoc.trackId,
        dept: userDoc.department || userDoc.deptName || '',
        empId: userDoc.employeeNo || '',
        desig: userDoc.designation || '',
        regNo: userDoc.registerNo || '',
        sessionId,
      },
      cfg.JWT_SECRET,
      { expiresIn: cfg.JWT_EXPIRES_IN || '24h' }
    );

    let historyObj = {
      sessionId: sessionId, time: new Date(), current: 'Logged In', ip: clientDetails.ip, userAgent: clientDetails.userAgent,
      loginTime: new Date(), logoutTime: null,
      deviceType: clientDetails.deviceType, browser: clientDetails.browser, os: clientDetails.os,
      status: 'success', authToken: token, createdAt: new Date(), active: true, expiresAt: expiresAt, lastActivity: new Date()
    };

    const loginHistory = await M.LoginHistory.findOne({ trackId: userDoc.trackId });

    if (loginHistory) {
      // Terminate all other active sessions first
      await M.LoginHistory.updateOne(
        { trackId: userDoc.trackId },
        { $set: { "history.$[h].active": false, "history.$[h].current": "Logged Out", "history.$[h].logoutTime": new Date() } },
        { arrayFilters: [{ "h.active": true }] }
      );
      
      // Update variables
      loginHistory.totalLogins += 1;
      loginHistory.lastLogin = new Date();
      if (!loginHistory.firstLogin) {
        loginHistory.firstLogin = new Date();
      }
      loginHistory.history.push(historyObj);
      await loginHistory.save();
    } else {
      await M.LoginHistory.create({
        username: userDoc.username,
        trackId: userDoc.trackId,
        role,
        firstLogin: new Date(),
        lastLogin: new Date(),
        totalLogins: 1,
        history: [historyObj]
      });
    }

    await M.User.updateOne({ trackId: userDoc.trackId }, { $set: { status: 'active', online: true } });
    await M.Log.create({
      userName: userDoc.fullName || userDoc.name || userDoc.username, role: role,
      action: 'Login', details: 'User logged in successfully.',
      category: role, severity: 'info', ip: req.ip, time: new Date(),
      trackId: userDoc.trackId || null,
    }); 

    res.json({
      token,
      sessionId,
      user: {
        _id: shadowUser._id,
        name: userDoc.fullName || userDoc.name || '',
        username: userDoc.username,
        role,
        active: true
      }
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { trackId, role, username } = req.user;

    await logAction(req.user._id, req.user.name, role, 'Logout', 'User logged out', 'login', 'info', req.ip);

    const user = await M.User.findOne({ trackId });
    if (!user) { return res.status(404).json({ error: 'User not found' }); }
    await M.Log.create({
        userName: username, role: role,
        action: 'Logout',
        details: `${user.username} logged out successfully.`,
        category: role, severity: 'info', ip: '',
        time: new Date(),
        trackId: user.trackId || null,
    });
  
    await M.LoginHistory.updateOne(
      { trackId: trackId, "history.sessionId": req.user.sessionId },
      { $set: { "history.$.logoutTime": new Date(), "history.$.current": "Logged Out", "history.$.active": false } }
    );

    await M.User.updateOne({ trackId: trackId }, { $set: { online: false } });

    res.json({ message: 'Logged out' });
  } catch (e) { res.json({ error: e.message }); }
});

router.post('/ping', authMiddleware, async (req, res) => {
  res.json({ success: true, expiresAt: req.session.expiresAt });
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const model = getRoleModel(req.user.role);
    if (!model) return res.status(400).json({ error: 'Invalid role model' });

    const user = await model.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password incorrect' });
    
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (currentPassword == newPassword) return res.status(400).json({ error: 'New Password cannot be same as Current Password' });

    const hashed = await bcrypt.hash(newPassword, cfg.BCRYPT_ROUNDS);
    user.password = hashed;
    user.mustChangePassword = false;
    await user.save();

    await logAction(user.trackId || req.user._id, user.fullName || user.name, user.role, 'Password Changed', 'User changed their password', 'security', 'info', req.ip);
    res.json({ message: 'Password updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/verify-session', authMiddleware, async (req, res) => {
  res.json({ valid: true, user: req.user });
});

router.get('/check', authMiddleware, async (req, res) => {
  try {
    const { trackId, role } = req.user;

    const model = getRoleModel(role);
    const user = await model.findOne({ trackId });
    if (!user)
      return res.status(404).json({ error: 'User not found' });

    const loginHistory = await M.LoginHistory.findOne({ trackId });
    if (!loginHistory) return res.status(404).json({ error: 'Login history not found' });

    const histObj = loginHistory.history.find(h => h.sessionId === req.user.sessionId);
    if (!histObj) return res.status(401).json({ error: 'Session not found' });

    if (!histObj.active || histObj.current === 'Logged Out') return res.status(401).json({ error: 'User is inactive' });

    if (histObj.expiresAt < new Date()) { 
      await M.LoginHistory.updateOne(
        { trackId, "history.sessionId": histObj.sessionId },
        { $set: { "history.$.current": "Logged Out", "history.$.active": false, "history.$.logoutTime": new Date() } }
      );
      await M.User.updateOne({ trackId }, { $set: { online: false } });
      return res.status(401).json({
        error: 'Session expired, Login Again'
      });
    }
    res.json({
      active: true,
      expiresAt: histObj.expiresAt
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/login-history', authMiddleware, async (req, res) => {
  try {
    const trackId = req.user.trackId ;

    const loginHistory = await M.LoginHistory.findOne({ trackId });
    if (!loginHistory) return res.status(404).json({ error: 'Login history not found' });
    
    const histObj = loginHistory.history.find(h => h.sessionId === req.user.sessionId);
    if (!histObj) return res.status(401).json({ error: 'Session not found' });

    res.json({
      loginTime: histObj.createdAt,
      expireTime: histObj.expiresAt
    })
  } catch (err) {return res.status(500).json({error: 'Server error'})}
});

module.exports = router;