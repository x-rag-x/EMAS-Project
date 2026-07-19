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
    case 'error':
      msgToast('Logged out due an unexpected error', type);
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

(function checkMaintOnLoad() {
  fetch('/api/settings/maintenance')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.active) return;
      var affected = d.affectedRoles || [];
      if (!affected.length) return;

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
    })
    .catch(function () { });
})();

let selectedRole = 'admin';

function pickRole(role) {
  selectedRole = role;
  document.getElementById('tab-student').classList.toggle('sel', role === 'student');
  document.getElementById('tab-teacher').classList.toggle('sel', role === 'teacher');
  document.getElementById('tab-admin').classList.toggle('sel', role === 'admin');
  document.getElementById('lerr').style.display = 'none';
  document.getElementById('lu').focus();
}

function doSignIn() {
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
  signInButton.disabled = true;
  signInButton.innerHTML = '<div class="spin"></div><span>Signing in…</span>';
  fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usernameInput, password: passwordInput, role: selectedRole })
  })
    .then(function (r) {
      var status = r.status;
      return r.json().then(function (data) { data._httpStatus = status; return data; });
    })
    .then(function (data) {
      if (data._httpStatus === 503 || data.maintenance) {
        sessionStorage.setItem('maint_data', JSON.stringify(data));
        window.location.href = 'maintenance.html';
        return;
      }
      if (data.error) {
        signInButton.disabled = false;
        signInButton.innerHTML = '<span id="lbn-txt">Sign In</span>';
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
      if (selectedRole === 'student') {
        window.location.href = 'student.html';
      } else if (selectedRole === 'teacher') {
        window.location.href = 'teacher.html';
      } else {
        window.location.href = 'admin.html';
      }
    })
    .catch(function () {
      signInButton.disabled = false;
      signInButton.innerHTML = '<span id="lbn-txt">Sign In</span>';
      errorBox.textContent = 'Cannot reach server. Try Again ;(';
      errorBox.style.display = 'block';
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
