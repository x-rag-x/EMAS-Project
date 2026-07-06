const jwt = require('jsonwebtoken');
const cfg = require('../config');
const M = require('../models');

function getRoleModel(role) {
  switch (role) {
    case 'admin':   return M.Admin;
    case 'teacher': return M.Teacher;
    case 'student': return M.Student;
    default:        return null;
  }
}

// ── Auth Middleware ───────────────────────────────────
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {return res.status(401).json({error: 'No token'});}

  const token = header.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, cfg.JWT_SECRET);

    const model = getRoleModel(decoded.role);
    const user = await model.findOne({ trackId: decoded.trackId });
    if (!user) {return res.status(401).json({ error: 'User not found' });}

    const loginHistory = await M.LoginHistory.findOne({trackId: decoded.trackId});
    if (!loginHistory) { return res.status(401).json({error: 'User not found'});}

    const session = loginHistory.history.find(h => h.sessionId === decoded.sessionId);
    if (!session) {return res.status(401).json({error: 'Session not found'});}
    if (!session.active) {return res.status(401).json({error: 'Session expired'});}
    if (session.current === 'Logged Out') {return res.status(401).json({error: 'Logged out'});}
    if (session.expiresAt < new Date()) {return res.status(401).json({error: 'Session expired'});}

    req.user = decoded;
    req.session = session;

    session.lastActivity = new Date();
    await loginHistory.save();

    next();

  } catch (err) {return res.status(401).json({error: 'Invalid token'});}
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

module.exports = { authMiddleware, adminOnly, getRoleModel };
