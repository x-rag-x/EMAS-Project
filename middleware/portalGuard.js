const M = require('../models');

// Cache settings for 5 seconds to prevent DB overhead on every single request
let cachedSettings = {};
let lastCacheTime = 0;

async function getCachedSettings() {
  const now = Date.now();
  if (now - lastCacheTime < 5000 && Object.keys(cachedSettings).length > 0) {
    return cachedSettings;
  }
  try {
    const rows = await M.Settings.find().lean();
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    cachedSettings = map;
    lastCacheTime = now;
    return map;
  } catch (err) {
    return cachedSettings;
  }
}

// ── Check Student Portal Access ──
async function checkStudentPortalGuard(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  const settings = await getCachedSettings();
  const pageStudents = settings.pages?.pageStudents ?? 'enabled';
  if (pageStudents === 'disabled' || pageStudents === 'hidden' || pageStudents === false) {
    return res.status(403).json({
      error: 'Student Portal is currently disabled by administrator.',
      portalDisabled: true,
      portal: 'student'
    });
  }
  next();
}

// ── Check Attendance Marking Access ──
async function checkAttendanceMarkGuard(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  const settings = await getCachedSettings();
  const markAttendance = settings.attendance?.markAttendance ?? true;
  if (markAttendance === false) {
    return res.status(403).json({
      error: 'Attendance marking is currently locked by administrator.',
      featureDisabled: true
    });
  }
  next();
}

// ── Check Live Sessions Access ──
async function checkLiveSessionGuard(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  const settings = await getCachedSettings();
  const markAttendance = settings.attendance?.markAttendance ?? true;
  const liveSessions = settings.attendance?.liveSessions ?? true;
  if (markAttendance === false || liveSessions === false) {
    return res.status(403).json({
      error: 'Live Attendance Sessions are currently disabled by administrator.',
      featureDisabled: true
    });
  }
  next();
}

// ── Check Module Switch (generic) ──
function checkModuleGuard(moduleKey, moduleName) {
  return async function (req, res, next) {
    if (req.user && req.user.role === 'admin') return next();
    const settings = await getCachedSettings();
    const isEnabled = settings.models?.[moduleKey] ?? true;
    if (isEnabled === false) {
      return res.status(403).json({
        error: `${moduleName} module is currently disabled by administrator.`,
        moduleDisabled: true
      });
    }
    next();
  };
}

module.exports = {
  checkStudentPortalGuard,
  checkAttendanceMarkGuard,
  checkLiveSessionGuard,
  checkModuleGuard,
  getCachedSettings
};
