const M = require('../models');

function startSessionMonitor() {
  // Check every 10 seconds
  setInterval(async () => {
    try {
      const now = new Date();
      const histories = await M.LoginHistory.find({});
      
      for (const lh of histories) {
        let updated = false;
        
        for (const session of lh.history) {
          if (session.active && session.current === 'Logged In') {
            if (now >= session.expiresAt) {
              const lastAct = session.lastActivity || session.loginTime || session.time;
              const elapsedMs = now.getTime() - new Date(lastAct).getTime();
              
              // Inactivity limits: Admin = 10m, Student = 20m, Teacher = 15m
              let limitMins = 15;
              if (lh.role === 'admin') limitMins = 10;
              else if (lh.role === 'student') limitMins = 20;
              else if (lh.role === 'teacher') limitMins = 15;
              
              const limitMs = limitMins * 60 * 1000;
              
              if (elapsedMs < limitMs) {
                // User is active in the website — add 15 more minutes to expiresAt
                session.expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
                updated = true;
              } else {
                // User is inactive — log out immediately
                session.active = false;
                session.current = 'Logged Out';
                session.logoutTime = now;
                updated = true;
                
                // Set online = false in UserSchema
                await M.User.updateOne({ trackId: lh.trackId }, { $set: { online: false } });
              }
            }
          }
        }
        
        if (updated) {
          await lh.save({ validateBeforeSave: false });
        }
      }
    } catch (err) {
      console.error('Session monitor error:', err.message);
    }
  }, 10000);
}

module.exports = { startSessionMonitor };
