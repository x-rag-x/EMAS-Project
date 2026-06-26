

async function doLogout(username) {
  try {
    const token = sessionStorage.getItem('eams_token') || localStorage.getItem('eams_token');

    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    }
  } catch (err) {}
  localStorage.clear();
  sessionStorage.clear();

  history.replaceState(null, '', 'index.html');
  window.location.replace('index.html');
}

// ── Activity Tracking & Session Management ──────────────
(function() {
  var lastPingTime = 0;
  var PING_THROTTLE_MS = 30000; // 30 seconds
  var CHECK_INTERVAL_MS = 15000; // 15 seconds

  function getToken() {
    return sessionStorage.getItem('eams_token') || localStorage.getItem('eams_token');
  }

  // Send a ping to the server to report activity
  function sendPing() {
    var now = Date.now();
    if (now - lastPingTime < PING_THROTTLE_MS) return;
    lastPingTime = now;

    var token = getToken();
    if (!token) return;

    fetch('/api/auth/ping', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }).catch(function() {});
  }

  // Listen for user activity events and throttle pings
  ['mousemove', 'click', 'scroll', 'keydown', 'touchstart'].forEach(function(evt) {
    document.addEventListener(evt, sendPing, { passive: true });
  });

  // Check session validity with the server every 15 seconds
  function checkSession() {
    var token = getToken();
    if (!token) return;

    fetch('/api/auth/check', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function(res) {
      if (res.status === 401) {
        if (typeof dbToast === 'function') {
          dbToast('\u26a0\ufe0f Session expired. Logging out...', 'error');
        }
        setTimeout(function() {
          doLogout();
        }, 1500);
      }
    })
    .catch(function() {});
  }

  checkSession();
  setInterval(checkSession, CHECK_INTERVAL_MS);
})();
