const M = require('../models');

async function logAction(userId, userName, role, action, details, category, severity, ip, sessionId) {
  try {
    await M.Log.create({
      userName: userName || 'SYSTEM',
      role: role || 'admin',
      action: action || '',
      details: details || '',
      category: category || 'general',
      severity: severity || 'info',
      ip: ip || '',
      sessionId: sessionId || '',
      time: new Date()
    });
  } catch (err) {
    console.error('Failed to log action:', err.message);
  }
}

function parseUserAgent(userAgent = '') {
  const ua = userAgent.toLowerCase();

  // Device Type
  let deviceType = 'Unknown';
  if (/tablet|ipad/.test(ua)) {
    deviceType = 'Tablet';
  } else if (/mobile|android|iphone/.test(ua)) {
    deviceType = 'Mobile';
  } else {
    deviceType = 'Desktop';
  }

  // Browser
  let browser = 'Other';
  if (ua.includes('brave')) {
    browser = 'Brave';
  } else if (ua.includes('edg')) {
    browser = 'Edge';
  } else if (ua.includes('opr') || ua.includes('opera')) {
    browser = 'Opera';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('chrome')) {
    browser = 'Chrome';
  } else if (ua.includes('safari')) {
    browser = 'Safari';
  }

  // OS
  let os = 'Other';
  if (ua.includes('windows')) {
    os = 'Windows';
  } else if (ua.includes('android')) {
    os = 'Android';
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    os = 'iOS';
  } else if (ua.includes('mac os') || ua.includes('macintosh')) {
    os = 'MacOS';
  } else if (ua.includes('linux')) {
    os = 'Linux';
  }

  return { deviceType, browser, os };
}

module.exports = { logAction, parseUserAgent };
