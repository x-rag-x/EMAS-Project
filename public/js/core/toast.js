var _toastQueue = [];
var _loaderActive = true;
var _dbToastTimer = null;
var _dbToastDuration = 4000;

function showToast(msg, type) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (type ? ' t-' + type : '') + ' show';
  clearTimeout(t._tid);
  t._tid = setTimeout(function() { t.className = 'toast'; }, 3000);
}
var showT = showToast;

function dbToast(msg, state, extra) {
  if (_loaderActive) { _toastQueue.push([msg, state, extra]); return; }
  var wrap = document.getElementById('db-toast');
  if (!wrap) { showToast(msg, state); return; }
  if (_dbToastTimer) { clearTimeout(_dbToastTimer); _dbToastTimer = null; }
  wrap.className = 'db-toast-' + (state || 'saving');
  var bar = document.getElementById('db-toast-bar');
  if (bar) {
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = 'width ' + (state === 'saving' ? '8s' : _dbToastDuration + 'ms') + ' linear';
    bar.style.width = '100%';
  }
  wrap.classList.add('show');
  if (state !== 'saving') {
    _dbToastTimer = setTimeout(function() { wrap.classList.remove('show'); }, _dbToastDuration);
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
