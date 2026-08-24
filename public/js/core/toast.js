var _toastQueue = [];
var _loaderActive = true;
var _dbToastTimer = null;
var _dbToastDuration = 2000;

function showToast(msg, type) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (type ? ' t-' + type : '') + ' show';
  clearTimeout(t._tid);
  t._tid = setTimeout(function() { t.className = 'toast'; }, 3000);
}
var showT = showToast;

function dbToast(msg, state, changes) {
  if (_loaderActive) { _toastQueue.push([msg, state, changes]); return; }

  // state: 'saving' | 'success' | 'error'
  var el = document.getElementById('db-toast');
  if (!el) return;

  clearTimeout(_dbToastTimer);
  el.className = 'show ' + (state || 'saving');

  var icon = state === 'success' ? '✓' : state === 'error' ? '❌' : '';
  var spinHtml = state === 'saving' ? '<div class="db-spin"></div>' : '';
  var changesHtml = changes
    ? '<div style="font-size:10.5px;opacity:.8;margin-top:3px;">' + changes + '</div>'
    : '';

  var closeBtn = '<span id="db-toast-close" style="position:absolute;top:6px;right:8px;cursor:pointer;font-size:10px;">✖</span>';

  // Progress bar — only rendered when there is a countdown
  var progressBar = state !== 'saving'
    ? '<div id="db-toast-bar"></div>'
    : '';

  el.innerHTML =
    progressBar +
    closeBtn +
    spinHtml +
    '<div style="display:flex;flex-direction:column;gap:4px;">' +

    '<div style="font-size:13px;font-weight:700;">' +
    icon + ' ' + msg +
    '</div>' +

    (changes
      ? '<div style="font-size:12.5px;font-weight:600;opacity:.95;">' + changes + '</div>'
      : ''
    ) +

    '</div>';

  // Kick off bar animation (scaleX 1 → 0 over _dbToastDuration ms)
  var barEl = document.getElementById('db-toast-bar');
  var _remainingMs = _dbToastDuration;
  var _pausedAt = null;

  function startBar(durationMs) {
    if (!barEl) return;
    barEl.style.transition = 'none';
    barEl.style.transform = 'scaleX(1)';
    barEl.getBoundingClientRect();
    barEl.style.transition = 'transform ' + durationMs + 'ms linear';
    barEl.style.transform = 'scaleX(0)';
  }

  function pauseBar() {
    if (!barEl) return;
    var computed = window.getComputedStyle(barEl).transform;
    barEl.style.transition = 'none';
    barEl.style.transform = computed;
    // Derive remaining time from current scaleX value
    var scaleX = 1;
    if (computed && computed !== 'none') {
      var m = computed.match(/matrix\(([^,]+)/);
      if (m) scaleX = parseFloat(m[1]);
    }
    _remainingMs = Math.max(0, Math.round(scaleX * _dbToastDuration));
  }

  if (state !== 'saving') startBar(_remainingMs);

  // Close button
  var closeEl = document.getElementById('db-toast-close');
  if (closeEl) {
    closeEl.onclick = function () {
      el.classList.remove('show');
      clearTimeout(_dbToastTimer);
    };
  }

  // Hover: freeze bar + pause countdown
  el.onmouseenter = function () {
    clearTimeout(_dbToastTimer);
    if (state !== 'saving') pauseBar();
  };

  el.onmouseleave = function () {
    if (state !== 'saving') {
      startBar(_remainingMs);
      _dbToastTimer = setTimeout(function () {
        el.classList.remove('show');
      }, _remainingMs);
    } else {
      _dbToastTimer = setTimeout(function () {
        el.classList.remove('show');
      }, 6000);
    }
  };

  // Auto hide
  if (state !== 'saving') {
    _dbToastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, _dbToastDuration);
  } else {
    // Safety auto-dismiss for saving/fetching state in case of unhandled error or network delay
    _dbToastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 6000);
  }
}

function flushToastQueue() {
  _loaderActive = false;
  _toastQueue.forEach(function(a) { dbToast(a[0], a[1], a[2]); });
  _toastQueue = [];
}

var _actionToast = { interval: null };

function actionToast(opts) {
  if (opts.key && window._lastActionToastKey === opts.key) return;
  if (opts.key) window._lastActionToastKey = opts.key;
  clearActionToastTimers();
  var old = document.getElementById('action-toast');
  if (old) { old.classList.remove('at-show'); old.remove(); }
  var duration = (typeof opts.duration === 'number') ? opts.duration : 5;
  var remaining = duration;
  var toast = document.createElement('div');
  toast.id = 'action-toast';
  toast.innerHTML =
    '<div class="at-bar-track"><div class="at-bar-fill" id="at-bar-fill"></div></div>' +
    '<div class="at-body">' +
    '<div class="at-left">' +
    '<div class="at-title">' + (opts.title || '') + '</div>' +
    '<div class="at-sub">' + (opts.message || '') + '</div>' +
    '</div>' +
    '<div class="at-right">' +
    '<span class="at-timer" id="at-timer">' + remaining + '</span>' +
    '<button class="at-cancel">' + (opts.confirmText || 'Cancel') + '</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(toast);
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { toast.classList.add('at-show'); });
  });
  var barFill = document.getElementById('at-bar-fill');
  if (barFill) {
    barFill.style.transition = 'none';
    barFill.style.transform = 'scaleX(1)';
    barFill.getBoundingClientRect();
    barFill.style.transition = 'transform ' + duration + 's linear';
    barFill.style.transform = 'scaleX(0)';
  }
  var timerEl = document.getElementById('at-timer');
  function dismiss(runConfirm) {
    clearActionToastTimers();
    toast.classList.remove('at-show');
    toast.classList.add('at-hide');
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, 420);
    if (runConfirm && typeof opts.onConfirm === 'function') {
      try { opts.onConfirm(); } catch (e) { console.error(e); }
    }
  }
  _actionToast.interval = setInterval(function() {
    remaining--;
    if (timerEl) timerEl.textContent = remaining;
    if (remaining <= 0) { dismiss(true); }
  }, 1000);
  toast.querySelector('.at-cancel').addEventListener('click', function(e) {
    e.preventDefault();
    dismiss(false);
    if (typeof opts.onCancel === 'function') opts.onCancel();
  });
  window._activeActionToastDismiss = dismiss;
}

function clearActionToastTimers() {
  if (_actionToast.interval) { clearInterval(_actionToast.interval); _actionToast.interval = null; }
}
