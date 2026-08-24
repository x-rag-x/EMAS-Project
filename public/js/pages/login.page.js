document.addEventListener('DOMContentLoaded', function () {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type') || 'info';
  const time = parseInt(params.get('time') || '0', 10);

  switch (params.get('logout')) {
    case 'timeout':
      msgToast('Session expired. Please Sign in again.', type);
      break;
    case 'manual':
      msgToast('Logged out successfull', type);
      break;
    case 'error':
      msgToast('Logged out due an unexpected error', type);
      break;
  }

  if (time > 0) { setTimeout(hideMsgToast, time); }

  history.replaceState({}, '', 'index.html');
});

function msgToast(message, type) {
  type = type || "info";
  const toast = document.getElementById("msg-toast");
  const text = document.getElementById("msg-toast-text");

  if (!toast || !text) return;
  text.textContent = message;

  toast.className = "";
  toast.id = "msg-toast";
  toast.classList.add(type);
  toast.classList.add("show");
}

function hideMsgToast() {
  document.getElementById("msg-toast")?.classList.remove("show");
}

(function checkPublicStatusOnLoad() {
  fetch('/api/settings/public?_t=' + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d) return;

      // 1. Maintenance Check
      if (d.maintenance && d.maintenance.active) {
        var affected = d.maintenance.affectedRoles || [];
        if (affected.length) {
          var notice = document.getElementById('maint-notice');
          if (notice) notice.style.display = 'block';

          ['student', 'teacher', 'subadmin'].forEach(function (role) {
            if (affected.includes(role)) {
              var tab = document.getElementById('tab-' + role);
              if (tab) tab.style.display = 'none';
            }
          });

          if (affected.includes(selectedRole)) {
            pickRole('admin');
          }
        }
      }

      // 2. Portal Tri-State Access
      var pages = d.pages || {};
      if (pages.pageStudents === 'hidden') {
        var stuTab = document.getElementById('tab-student');
        if (stuTab) stuTab.style.display = 'none';
        if (selectedRole === 'student') pickRole('teacher');
      } else if (pages.pageStudents === 'disabled') {
        var stuTab = document.getElementById('tab-student');
        if (stuTab) {
          stuTab.title = '🔒 Student Portal is currently disabled for maintenance';
          stuTab.style.opacity = '0.6';
        }
      }

      if (pages.pageTeachers === 'hidden') {
        var teachTab = document.getElementById('tab-teacher');
        if (teachTab) teachTab.style.display = 'none';
        if (selectedRole === 'teacher') pickRole('admin');
      } else if (pages.pageTeachers === 'disabled') {
        var teachTab = document.getElementById('tab-teacher');
        if (teachTab) {
          teachTab.title = '🔒 Teacher Portal is currently disabled for maintenance';
          teachTab.style.opacity = '0.6';
        }
      }

      // 3. Active Broadcast Banner
      if (d.broadcast && d.broadcast.systemBannerActive && d.broadcast.systemBannerMessage) {
        var bannerBox = document.getElementById('login-broadcast-banner');
        if (!bannerBox) {
          bannerBox = document.createElement('div');
          bannerBox.id = 'login-broadcast-banner';
          bannerBox.style.cssText = 'background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;font-size:12px;color:#92400e;margin-bottom:14px;display:flex;align-items:center;gap:8px;font-weight:500;';
          var formBox = document.querySelector('.card') || document.querySelector('.login-box') || document.querySelector('.lbox') || document.body;
          if (formBox && formBox.firstChild) {
            formBox.insertBefore(bannerBox, formBox.firstChild);
          }
        }
        bannerBox.innerHTML = '<span>📢</span> <span>' + escapeHtml(d.broadcast.systemBannerMessage) + '</span>';
      }
    })
    .catch(function () { });
})();

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let selectedRole = 'admin';
let signingIn = false;

function pickRole(role) {
  if (signingIn) return;
  selectedRole = role;
  document.getElementById('tab-student').classList.toggle('sel', role === 'student');
  document.getElementById('tab-teacher').classList.toggle('sel', role === 'teacher');
  document.getElementById('tab-admin').classList.toggle('sel', role === 'admin');
  document.getElementById('lerr').style.display = 'none';
  document.getElementById('lu').focus();
}

var pendingAuth = null;

function doSignIn() {
  if (signingIn) return;
  var usernameInput = document.getElementById('lu').value.trim();
  var passwordInput = document.getElementById('lp').value.trim();
  var errorBox = document.getElementById('lerr');
  var signInButton = document.getElementById('lbn');
  errorBox.style.display = 'none';
  if (!usernameInput || !passwordInput) {
    errorBox.textContent = 'Please enter username and password.';
    errorBox.style.display = 'block';
    return;
  }

  signingIn = true;
  document.getElementById('tab-student').style.cursor = 'not-allowed';
  document.getElementById('tab-teacher').style.cursor = 'not-allowed';
  document.getElementById('tab-admin').style.cursor = 'not-allowed';
  document.getElementById('lu').style.cursor = 'not-allowed';
  document.getElementById('lp').style.cursor = 'not-allowed';
  document.getElementById('lu').disabled = true;
  document.getElementById('lp').disabled = true;
  document.querySelectorAll('.rtab').forEach(function (tab) {
    tab.style.pointerEvents = 'none';
  });

  signInButton.disabled = true;
  signInButton.innerHTML = '<div class="spin"></div><span>Signing In…</span>';

  // Check if location permission is already granted for fast single-roundtrip sign in
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(function (permResult) {
      if (permResult && permResult.state === 'granted') {
        // Fast path: Immediately get fast/cached coordinates and perform direct login
        navigator.geolocation.getCurrentPosition(
          function (position) {
            executeDirectLogin(usernameInput, passwordInput, selectedRole, {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            });
          },
          function () {
            executeDirectLogin(usernameInput, passwordInput, selectedRole, null);
          },
          { enableHighAccuracy: true, timeout: 3500, maximumAge: 300000 }
        );
      } else {
        // Prompt path: Verify credentials first, then display instruction modal
        verifyAndShowLocationModal(usernameInput, passwordInput, selectedRole);
      }
    }).catch(function () {
      verifyAndShowLocationModal(usernameInput, passwordInput, selectedRole);
    });
  } else {
    verifyAndShowLocationModal(usernameInput, passwordInput, selectedRole);
  }
}

function verifyAndShowLocationModal(usernameInput, passwordInput, role) {
  var errorBox = document.getElementById('lerr');
  var signInButton = document.getElementById('lbn');

  fetch('/api/auth/verify-credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usernameInput, password: passwordInput, role: role })
  })
    .then(function (r) {
      var status = r.status;
      return r.json().then(function (data) { data._httpStatus = status; return data; });
    })
    .then(function (verifyData) {
      if (verifyData._httpStatus === 503 || verifyData.maintenance) {
        sessionStorage.setItem('maint_data', JSON.stringify(verifyData));
        window.location.href = 'maintenance.html';
        return;
      }
      if (verifyData.error) {
        resetSignInUI();
        signInButton.disabled = false;
        signInButton.innerHTML = '<span id="lbn-txt">Sign In</span>';
        errorBox.textContent = verifyData.error;
        errorBox.style.display = 'block';
        document.getElementById('lp').value = '';
        return;
      }

      pendingAuth = {
        username: usernameInput,
        password: passwordInput,
        role: role
      };

      openLocationGuidanceModal();
    })
    .catch(function () {
      resetSignInUI();
      signInButton.disabled = false;
      signInButton.innerHTML = '<span id="lbn-txt">Sign In</span>';
      errorBox.textContent = 'Cannot reach server. Try Again ;(';
      errorBox.style.display = 'block';
    });
}

function openLocationGuidanceModal() {
  var signInButton = document.getElementById('lbn');
  if (signInButton) {
    signInButton.disabled = false;
    signInButton.innerHTML = '<span id="lbn-txt">Sign In</span>';
  }
  var modalProceedBtn = document.getElementById('btn-loc-proceed');
  if (modalProceedBtn) {
    modalProceedBtn.disabled = false;
    modalProceedBtn.innerHTML = '📍 Allow Location &amp; Sign In';
  }
  var modal = document.getElementById('m-loc-guide');
  if (modal) {
    modal.classList.add('open');
  }
}

function closeLocationModal() {
  var modal = document.getElementById('m-loc-guide');
  if (modal) modal.classList.remove('open');
  pendingAuth = null;
  resetSignInUI();
}

function executeDirectLogin(username, password, role, coords) {
  var payload = {
    username: username,
    password: password,
    role: role
  };
  if (coords) {
    payload.latitude = coords.latitude;
    payload.longitude = coords.longitude;
    payload.accuracy = coords.accuracy;
  }

  fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function (r) {
      var status = r.status;
      return r.json().then(function (data) { data._httpStatus = status; return data; });
    })
    .then(function (data) {
      closeLocationModal();
      handleLoginResponse(data, role);
    })
    .catch(function () {
      closeLocationModal();
      resetSignInUI();
      var errorBox = document.getElementById('lerr');
      errorBox.textContent = 'Cannot reach server. Try Again ;(';
      errorBox.style.display = 'block';
    });
}

function confirmAndRequestLocation() {
  if (!pendingAuth) return;

  var modalProceedBtn = document.getElementById('btn-loc-proceed');
  var signInButton = document.getElementById('lbn');

  if (modalProceedBtn) {
    modalProceedBtn.disabled = true;
    modalProceedBtn.innerHTML = '<div class="spin"></div><span>Requesting location…</span>';
  }
  if (signInButton) {
    signInButton.disabled = true;
    signInButton.innerHTML = '<div class="spin"></div><span>Signing in…</span>';
  }

  var auth = pendingAuth;

  if (!navigator.geolocation) {
    closeLocationModal();
    handleLocationDenied(auth.username, auth.role, 'Geolocation is not supported by your browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      executeDirectLogin(auth.username, auth.password, auth.role, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
    },
    function () {
      closeLocationModal();
      if (auth.role === 'admin') {
        // Admin role is never locked for location — directly execute sign in without coordinates
        executeDirectLogin(auth.username, auth.password, auth.role, null);
      } else {
        handleLocationDenied(auth.username, auth.role, 'Location permission denied or dismissed.');
      }
    },
    { enableHighAccuracy: true, timeout: 4000, maximumAge: 300000 }
  );
}

function handleLoginResponse(data, role) {
  if (data._httpStatus === 503 || data.maintenance) {
    sessionStorage.setItem('maint_data', JSON.stringify(data));
    window.location.href = 'maintenance.html';
    return;
  }
  if (data.error) {
    resetSignInUI();
    var errorBox = document.getElementById('lerr');
    errorBox.textContent = data.error;
    errorBox.style.display = 'block';
    document.getElementById('lp').value = '';
    return;
  }

  sessionStorage.setItem('eams_token', data.token);
  sessionStorage.setItem('eams_user', JSON.stringify(data.user));
  sessionStorage.setItem('eams_sessionId', data.sessionId || '');
  sessionStorage.setItem('eams_mustChangePw', data.mustChangePassword ? '1' : '0');
  sessionStorage.setItem('eams_login_time', Date.now().toString());

  if (role === 'student') {
    window.location.href = 'student.html';
  } else if (role === 'teacher') {
    var isTeacherAdmin = !!data.user?.isAdmin || (Array.isArray(data.user?.adminRights) && data.user.adminRights.length > 0 && !data.user.adminRights.every(function (r) { return r === 'none'; }));
    var isHod = !!data.user?.isHod || (Array.isArray(data.user?.specials) && data.user.specials.some(function(s) { return s.option === 'isHod'; }));
    if ((isTeacherAdmin || isHod) && !data.bypassSelector) {
      window.location.href = 'selector.html';
    } else {
      window.location.href = 'teacher.html';
    }
  } else {
    var adminFlag = data.user?.adminFlag || 'superadmin';
    if ((adminFlag === 'principal' || adminFlag === 'subadmin') && !data.bypassSelector) {
      window.location.href = 'selector.html';
    } else {
      window.location.href = 'admin.html';
    }
  }
}

function handleLocationDenied(usernameInput, role, reason) {
  var errorBox = document.getElementById('lerr');
  var signInButton = document.getElementById('lbn');
  var isAdmin = role === 'admin';

  fetch('/api/auth/location-denied', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usernameInput, role: role })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      resetSignInUI();
      signInButton.disabled = false;
      signInButton.innerHTML = '<span id="lbn-txt">Sign In</span>';

      if (isAdmin) {
        msgToast('Admin exemption active: Location not locked.', 'info');
      } else {
        errorBox.textContent = '🔒 Location access is strictly mandatory to sign in. Your account has been temporarily locked for 1 hour for security compliance.';
        errorBox.style.display = 'block';
        msgToast('Account locked for 1 hour due to denied location permission.', 'error');
        document.getElementById('lp').value = '';
      }
    })
    .catch(function () {
      resetSignInUI();
      signInButton.disabled = false;
      signInButton.innerHTML = '<span id="lbn-txt">Sign In</span>';
      if (!isAdmin) {
        errorBox.textContent = '🔒 Location access is required. Account locked for 1 hour.';
        errorBox.style.display = 'block';
      }
    });
}

function resetSignInUI() {
  signingIn = false;
  document.getElementById('tab-student').style.cursor = '';
  document.getElementById('tab-teacher').style.cursor = '';
  document.getElementById('tab-admin').style.cursor = '';
  document.getElementById('lu').style.cursor = '';
  document.getElementById('lp').style.cursor = '';
  document.getElementById('lu').disabled = false;
  document.getElementById('lp').disabled = false;
  document.querySelectorAll('.rtab').forEach(function (tab) {
    tab.style.pointerEvents = '';
  });
}

['lu', 'lp'].forEach(function (fieldId) {
  document.getElementById(fieldId).addEventListener('keypress', function (event) {
    if (event.key === 'Enter') {
      doSignIn();
    }
  });
});

function togglePw(inputId, btn) {
  var inp = document.getElementById(inputId);
  if (!inp) return;

  var show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';

  btn.textContent = show ? '🙈' : '👁';
  btn.title = show ? 'Hide password' : 'Show password';
}

document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
document.addEventListener('keydown', function (e) {
  if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key)) || (e.ctrlKey && e.key === 'U')) { e.preventDefault(); return false; }
});
(function devDetect() {
  var warned = false;
  setInterval(function () {
    var d = window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 200;
    if (d && !warned) { warned = true; document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Poppins,sans-serif;font-size:18px;color:#dc2626;flex-direction:column;gap:12px;"><span style="font-size:48px;">&#128274;</span><b>Developer tools are not allowed on this platform.</b></div>'; }
  }, 1500);
})();
