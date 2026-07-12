const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cfg = require('../config');
const M = require('../models');
const rateLimit = require('express-rate-limit');
const { authMiddleware, getRoleModel } = require('../middleware/auth');
const { logAction, parseUserAgent } = require('../utils/logAction');

function getClientDetails(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  const { deviceType, browser, os } = parseUserAgent(userAgent);
  return { ip, userAgent, deviceType, browser, os };
}


const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per 15 minutes
  message: { error: 'Too many login attempts from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, async (req, res) => {
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

    // Fetch or create login history for this user to track lockouts/failed attempts
    let loginHistory = await M.LoginHistory.findOne({ trackId: shadowUser.trackId });
    if (!loginHistory) {
      loginHistory = await M.LoginHistory.create({
        username: shadowUser.username,
        trackId: shadowUser.trackId,
        role: role,
        totalLogins: 0,
        history: []
      });
    }

    // Fetch security settings for maxLoginAttempts
    const secSettings = await M.Settings.findOne({ key: 'security' });
    const security = secSettings?.value || {};
    const maxAttempts = security.maxLoginAttempts || 3;

    // Check account lockout status
    if (shadowUser.status === 'locked') {
      if (loginHistory.lockedUntil && loginHistory.lockedUntil > new Date()) {
        const remainingTimeMs = loginHistory.lockedUntil - new Date();
        const remainingTimeMins = Math.ceil(remainingTimeMs / 60000);
        return res.status(401).json({ error: `Account locked. Try again in ${remainingTimeMins} minute(s).` });
      } else {
        // Lock expired
        shadowUser.status = 'active';
        await shadowUser.save();
        loginHistory.failedLogins = 0;
        loginHistory.lockedUntil = null;
        await loginHistory.save();
      }
    }

    if (shadowUser.status !== 'active') {
      await logAction(shadowUser.trackId || shadowUser._id, shadowUser.username, role, 'Login Failed', `User is ` + shadowUser.status, 'security', 'warning', req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userDoc = await model.findOne({ username: username.toLowerCase().trim() }).select('+password');
    if (!userDoc) {
      await logAction(shadowUser.trackId || shadowUser._id, shadowUser.username, role, 'Login Failed', `User document not found in role model`, 'security', 'warning', req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, userDoc.password);
    if (!match) {
      loginHistory.failedLogins = (loginHistory.failedLogins || 0) + 1;
      if (loginHistory.failedLogins >= maxAttempts) {
        shadowUser.status = 'locked';
        await shadowUser.save();
        loginHistory.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lockout
        await loginHistory.save();
        await logAction(shadowUser.trackId || shadowUser._id, shadowUser.username, role, 'Login Failed (Locked)', `Wrong password, account locked`, 'security', 'warning', req.ip);
        return res.status(401).json({ error: `Account locked due to too many failed attempts. Try again in 15 minute(s).` });
      }
      await loginHistory.save();
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
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    let historyObj = {
      sessionId: sessionId, time: new Date(), current: 'Logged In', ip: clientDetails.ip, userAgent: clientDetails.userAgent,
      loginTime: new Date(), logoutTime: null,
      deviceType: clientDetails.deviceType, browser: clientDetails.browser, os: clientDetails.os,
      status: 'success', authToken: tokenHash, createdAt: new Date(), active: true, expiresAt: expiresAt, lastActivity: new Date()
    };

    // Terminate all other active sessions first
    await M.LoginHistory.updateOne(
      { trackId: loginHistory.trackId },
      { $set: { "history.$[h].active": false, "history.$[h].current": "Logged Out", "history.$[h].logoutTime": new Date() } },
      { arrayFilters: [{ "h.active": true }] }
    );

    // Update login history with new session
    loginHistory.totalLogins += 1;
    loginHistory.lastLogin = new Date();
    if (!loginHistory.firstLogin) loginHistory.firstLogin = new Date();
    loginHistory.failedLogins = 0;
    loginHistory.lockedUntil = null;
    loginHistory.history.push(historyObj);
    await loginHistory.save();

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
      mustChangePassword: !!userDoc.mustChangePassword,
      user: {
        _id: shadowUser._id,
        name: userDoc.fullName || userDoc.name || '',
        username: userDoc.username,
        role,
        active: true,
        mustChangePassword: !!userDoc.mustChangePassword,
      }
    });
    
  } catch (err) {
    res.status(500).json({ error: 'Login failed, try again' });
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
  } catch (err) { res.status(500).json({ error: 'Logout failed'}); }
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
  } catch (err) { res.status(500).json({ error: 'Password updation failed.' }); }
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