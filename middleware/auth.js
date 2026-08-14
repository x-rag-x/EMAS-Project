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

  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid Authorization header format' });
  }
  const token = parts[1];

  try {
    const decoded = jwt.verify(token, cfg.JWT_SECRET);

    const model = getRoleModel(decoded.role);
    const user = await model.findOne({ trackId: decoded.trackId }).select('+mustChangePassword');
    if (!user) {return res.status(401).json({ error: 'User not found' });}

    const loginHistory = await M.LoginHistory.findOne({trackId: decoded.trackId});
    if (!loginHistory) { return res.status(401).json({error: 'User not found'});}

    const session = loginHistory.history.find(h => h.sessionId === decoded.sessionId);
    if (!session) {return res.status(401).json({error: 'Session not found'});}
    if (!session.active) {return res.status(401).json({error: 'Session expired'});}
    if (session.current === 'Logged Out') {return res.status(401).json({error: 'Logged out'});}
    if (session.expiresAt - Date.now() <= 5 * 60 * 1000) {
      session.expiresAt = new Date(session.expiresAt.getTime() + 10 * 60 * 1000);
    }
    if (session.expiresAt < new Date()) {return res.status(401).json({error: 'Session expired'});}

    const userObj = user.toObject();
    const specials = Array.isArray(userObj.specials) ? userObj.specials : [];
    req.user = {
      ...userObj,
      role:      decoded.role,
      sessionId: decoded.sessionId,
      isTimeTableCoordinator: specials.some(s => s.option === 'isTimeTableCoordinator'),
      TTdeptName: (specials.find(s => s.option === 'isTimeTableCoordinator') || {}).value || '',
      isHod:               specials.some(s => s.option === 'isHod'),
      isClassAdvisor:      specials.some(s => s.option === 'isClassAdvisor'),
      isWarden:            specials.some(s => s.option === 'isWarden'),
      isExamCoordinator:   specials.some(s => s.option === 'isExamCoordinator'),
      isPlacementCoordinator: specials.some(s => s.option === 'isPlacementCoordinator'),
    };
    req.session = session;

    session.lastActivity = new Date();
    // Fire-and-forget: lastActivity update is best-effort.
    // A ValidationError on a legacy history record must NOT fail auth for the caller.
    loginHistory.save().catch(function (saveErr) {
      console.error('[EAMS Auth] loginHistory.save() failed (non-fatal):', saveErr.message);
    });

    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      console.error(`[EAMS Auth Error]: ${err.name}: ${err.message}`);
    } else {
      console.error('[EAMS Auth Error]:', err);
    }
    return res.status(401).json({error: 'Invalid token'});
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

module.exports = { authMiddleware, adminOnly, getRoleModel };
