function getToken() {
  return sessionStorage.getItem('eams_token') || '';
}

function getUser() {
  var stored = sessionStorage.getItem('eams_user');
  return stored ? JSON.parse(stored) : null;
}

function checkAuth(role) {
  var user = getUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  if (role && user.role !== role) { window.location.href = 'index.html'; return null; }
  return user;
}

async function doLogout() {
  try {
    var token = getToken();
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token }
      });
    }
  } catch (err) {}
  sessionStorage.clear();
  history.replaceState(null, '', 'index.html');
  window.location.replace('index.html');
}

(function() {
  function checkSessionExpiry() {
    var loginTime = sessionStorage.getItem('eams_login_time');
    if (loginTime) {
      var elapsed = Date.now() - parseInt(loginTime, 10);
      if (elapsed > 45 * 60 * 1000) {
        if (typeof dbToast === 'function') {
          dbToast('Session expired. Logging out...', 'error');
        } else if (typeof showToast === 'function') {
          showToast('Session expired. Logging out...');
        }
        setTimeout(function() { doLogout(); }, 1500);
      }
    }
  }
  checkSessionExpiry();
  setInterval(checkSessionExpiry, 15000);
})();
