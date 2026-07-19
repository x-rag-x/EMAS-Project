
    var _memStore = {};

    // ─── DATABASE HELPER ────────────────────────────────────────────────────────
    const DB = {
      get: function (collection) {
        try { return _memStore['ss3_' + collection] || []; }
        catch (e) { return []; }
      },
      set: function (collection, data) {
        _memStore['ss3_' + collection] = data;
      },
      insert: function (collection, doc) {
        const rows = DB.get(collection);
        doc._id = '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        rows.push(doc);
        DB.set(collection, rows);
        return doc;
      },
      update: function (collection, id, updates) {
        const rows = DB.get(collection);
        const index = rows.findIndex(function (row) { return row._id === id; });
        if (index >= 0) {
          rows[index] = Object.assign({}, rows[index], updates);
          DB.set(collection, rows);
        }
      },
      delete: function (collection, id) {
        DB.set(collection, DB.get(collection).filter(function (row) { return row._id !== id; }));
      },
      find: function (collection, query) {
        query = query || {};
        return DB.get(collection).filter(function (doc) {
          return Object.keys(query).every(function (key) { return doc[key] === query[key]; });
        });
      },
      one: function (collection, query) {
        query = query || {};
        return DB.get(collection).find(function (doc) {
          return Object.keys(query).every(function (key) { return doc[key] === query[key]; });
        }) || null;
      }
    };

    // ─── COURSE CATALOG ─────────────────────────────────────────────────────────
    const COURSES = {
      UG: {
        'B.E': ['Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering',
          'Electronics & Communication Engineering', 'Computer Science Engineering',
          'Information Technology', 'Chemical Engineering', 'Biomedical Engineering'],
        'B.TECH': ['Computer Science & Engineering', 'Information Technology',
          'Electronics & Communication', 'Data Science', 'AI & ML', 'Cybersecurity'],
      },
      PG: {
        'M.E': ['Computer Science', 'VLSI Design', 'Power Systems', 'Structural Engineering'],
        'M.TECH': ['Computer Science & Engineering', 'Data Science', 'AI & ML', 'Embedded Systems'],
      }
    };

    // ─── SEED / INITIAL DATA ────────────────────────────────────────────────────
    function initDB() {
      // No default data seeded
    }

    // ─── DATE UTILITIES ──────────────────────────────────────────────────────────
    function getWeekDates(offset) {
      var today = new Date();
      today.setDate(today.getDate() + (offset || 0));
      var dayOfWeek = today.getDay();
      var monday = new Date(today);
      monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

      return Array.from({ length: 5 }, function (_, i) {
        var d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d.toISOString().split('T')[0];
      });
    }

    function thisWeek() { return getWeekDates(0); }

    function formatDate(isoDate) {
      return new Date(isoDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    }

    function timeAgo(isoDate) {
      var diffSeconds = (Date.now() - new Date(isoDate).getTime()) / 1000;
      if (diffSeconds < 60) return 'just now';
      if (diffSeconds < 3600) return Math.floor(diffSeconds / 60) + 'm ago';
      if (diffSeconds < 86400) return Math.floor(diffSeconds / 3600) + 'h ago';
      return Math.floor(diffSeconds / 86400) + 'd ago';
    }

    // ─── AUTHENTICATION ──────────────────────────────────────────────────────────
    var currentUser = null;

    var YEAR_CONFIG = { current: '', batches: [] };

    

    // ── Session Auto-Logout after 45 minutes
    (function () {
      function checkSessionExpiry() {
        var loginTime = sessionStorage.getItem('eams_login_time');
        if (loginTime) {
          var elapsed = Date.now() - parseInt(loginTime, 10);
          if (elapsed > 45 * 60 * 1000) {
            if (typeof dbToast === 'function') {
              dbToast('⚠️ Session expired. Logging out...', 'error');
            } else if (typeof showToast === 'function') {
              showToast('⚠️ Session expired. Logging out...');
            }
            setTimeout(function () {
              doLogout();
            }, 1500);
          }
        }
      }
      checkSessionExpiry();
      setInterval(checkSessionExpiry, 15000);
    })();

    // ─── SIDEBAR TOGGLE ──────────────────────────────────────────────────────────
    function toggleAdminSidebar() {
      var sidebar = document.querySelector('#app-shell .sb');
      var mainContent = document.querySelector('.mc');
      var toggleButton = document.getElementById('sbtoggle');
      var overlay = document.getElementById('sb-overlay');
      var isMobile = window.innerWidth <= 768;

      if (isMobile) {
        var isOpen = sidebar.classList.toggle('sb-mobile-open');
        if (overlay) overlay.classList.toggle('visible', isOpen);
        toggleButton.innerHTML = isOpen ? '✖' : '☰';
      } else {
        var isHidden = sidebar.classList.toggle('sb-hidden');
        mainContent.classList.toggle('sb-expanded', isHidden);
        toggleButton.classList.toggle('closed', isHidden);
        toggleButton.innerHTML = isHidden ? '☰' : '✖';
      }
    }

    function bootApp() {
      // Populate user info while loader is still shown (elements exist, just hidden behind loader)
      var avatarLetter = currentUser.name[0].toUpperCase();
      document.getElementById('sb-av').textContent = avatarLetter;
      document.getElementById('sb-name').textContent = currentUser.name;
      document.getElementById('topbar-av').textContent = avatarLetter;
      document.getElementById('topbar-name').textContent = currentUser.name;
      document.getElementById('pr-av-big').textContent = avatarLetter;
      document.getElementById('pr-name-big').textContent = currentUser.name;
      document.getElementById('tdt-label').textContent =
        new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

      populateAdminDropdowns();

      // ── Loader message sequence (3 s total) ─────────────
      var LOADER_STEPS = [
        { t: 0, msg: 'Initializing EAMS…' },
        { t: 700, msg: 'Connecting to Database…' },
        { t: 1200, msg: 'Fetching from Database…' },
        { t: 2200, msg: 'Almost ready…' },
      ];

      var loaderMsgEl = document.getElementById('loader-msg');
      var loaderEtaEl = document.getElementById('loader-eta');

      function setLoaderMsg(idx, text) {
        if (!loaderMsgEl) return;
        loaderMsgEl.classList.add('msg-fade');
        setTimeout(function () {
          loaderMsgEl.textContent = text;
          loaderMsgEl.classList.remove('msg-fade');
          // Advance step dots (5 dots, indices 0-4)
          for (var s = 0; s < 5; s++) {
            var dot = document.getElementById('lstep-' + s);
            if (!dot) continue;
            dot.className = 'loader-step' + (s < idx ? ' done' : s === idx ? ' active' : '');
          }
        }, 130);
      }

      LOADER_STEPS.forEach(function (step, i) {
        if (i === 0) return; // first already set in HTML
        setTimeout(function () { setLoaderMsg(i, step.msg); }, step.t);
      });

      var TASK_NAMES = ['depts', 'classes', 'subjects', 'students', 'users', 'assignments', 'logs', 'notifications', 'yearConfig'];
      var TASK_LABELS = {
        depts: 'Departments', classes: 'Classes', subjects: 'Subjects',
        students: 'Students', users: 'Users & Teachers', assignments: 'Assignments',
        logs: 'Activity Logs', notifications: 'Notifications', yearConfig: 'Year Config'
      };
      var DEFAULT_TASK_MS = 3000;

      var _completedDurations = [];

      function taskAvg() {
        if (_completedDurations.length === 0) return DEFAULT_TASK_MS;
        return Math.round(_completedDurations.reduce(function (a, b) { return a + b; }, 0) / _completedDurations.length);
      }

      var _etaMs = DEFAULT_TASK_MS;
      var _pendingTasks = TASK_NAMES.slice();
      var _syncStartTime = Date.now();

      function formatEta(ms) {
        var sec = Math.max(1, Math.round(ms / 1000));
        if (sec >= 60) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
        return sec + 's';
      }

      function updateEtaDisplay() {
        if (!loaderEtaEl) return;
        if (_pendingTasks.length === 0) {
          loaderEtaEl.innerHTML = '✔ All data loaded';
          return;
        }

        var waitingFor = _pendingTasks.slice(0, 3).map(function (n) { return TASK_LABELS[n] || n; }).join(', ');
        if (_pendingTasks.length > 3) waitingFor += ' +' + (_pendingTasks.length - 3);
        if (_etaMs <= 0) {
          loaderEtaEl.innerHTML = 'Waiting for ' + waitingFor + '…';
        } else {
          loaderEtaEl.innerHTML = 'ETA: <span class="eta-time">' + formatEta(_etaMs)
            + '</span> — loading ' + waitingFor;
        }
      }

      updateEtaDisplay();

      function onSyncProgress(taskName, pending, elapsedMs) {
        _pendingTasks = pending;
        _completedDurations.push(elapsedMs);
        if (pending.length === 0) {
          _etaMs = 0;
          updateEtaDisplay();
          return;
        }
        var avgCompleted = taskAvg();
        var maxRemaining = 0;
        pending.forEach(function () {
          var predicted = taskAvg();
          var remaining = Math.max(0, predicted - elapsedMs);
          if (remaining > maxRemaining) maxRemaining = remaining;
        });
        _etaMs = maxRemaining;
        updateEtaDisplay();
      }

      var _etaTick = setInterval(function () {
        if (_etaMs <= 0 || _pendingTasks.length === 0) return;
        _etaMs = Math.max(0, _etaMs - 1000);
        updateEtaDisplay();
      }, 1000);

      var timerDone = false;
      var fetchDone = false;
      var fetchCb = null;

      function tryReveal() {
        if (!timerDone || !fetchDone) return;
        clearInterval(_etaTick);
        _loaderActive = false;
        var loader = document.getElementById('page-loader');
        if (loader) {
          loader.classList.add('loader-fade');
          setTimeout(function () {
            loader.style.display = 'none';
            _toastQueue.forEach(function (a) { dbToast(a[0], a[1], a[2]); });
            _toastQueue = [];
          }, 360);
        }
        document.getElementById('app-shell').classList.add('vis');
        if (fetchCb) fetchCb();
      }

      setTimeout(function () { timerDone = true; tryReveal(); }, 3000);

      syncAllFromDB(function () {
        fetchCb = function () {
          renderDepartments();
          renderDepartmentSelector();
          renderClassSubjectView();
          syncBadgesFromAPI();
          nav('dash');
          populateAdminDropdowns();
        };
        fetchDone = true;
        tryReveal();
      }, onSyncProgress);
    }

    // ─── NAVIGATION ──────────────────────────────────────────────────────────────
    var PAGE_NAMES = ['dash', 'depts', 'struct', 'students', 'teachers', 'reports', 'logs'];

    function nav(pageName) {

      window._currentPage = pageName;

      document.querySelectorAll('.pg').forEach(function (el) { el.classList.remove('act'); });
      var targetPage = document.getElementById('pg-' + pageName);
      if (targetPage) targetPage.classList.add('act');
      document.querySelectorAll('.sb-item').forEach(function (item) { item.classList.remove('act'); });
      var activeItem = document.querySelector('.sb-item[data-page="' + pageName + '"]');
      if (activeItem) activeItem.classList.add('act');

      var pageInitializers = {
        'dash': initDash,
        'depts': renderDepartments,
        'struct': function () { resetStructureState(); renderDepartmentSelector(); renderDepartments(); },
        'students': function () {
          _studentPage = 1; _studentData = []; _studentTotal = 0;
          _studentSortBy = 'regNo'; _studentSortDir = 'asc';
          document.getElementById('stb').innerHTML = '<tr><td colspan="10" style="text-align:center;padding:36px 16px;color:var(--tdi);"><span style="font-size:38px;display:block;margin-bottom:10px;">📋</span><div style="font-size:14px;font-weight:600;margin-bottom:4px;">Click <strong>Show List</strong> above to view students.</div><div style="font-size:12px;color:var(--tdi);">Select filters and click Show List to begin.</div></td></tr>';
          document.getElementById('scb').textContent = '0 students';
          document.getElementById('load-more-wrap').style.display = 'none';
          document.getElementById('btn-show-list').disabled = true;
          document.getElementById('btn-show-list').style.opacity = '.5';
          document.getElementById('btn-show-list').style.cursor = 'not-allowed';
          populateStudentFilterDropdowns();
        },
        'teachers': function () {
          _teacherData = [];
          _teacherSearchQuery = '';
          populateTeacherDeptDropdown();
          renderTeachers();
        },
        'reports': initAdminReports,
        'logs': function () {
          _logRoleFilter = '';
          _logData = [];
          _logCursor = null;
          _logHasMore = true;
          _logTotal = 0;
          DB.set('logs', []);
          _fetchLogsInitial().then(function () { setLogRole(''); });
        },
      };
      if (pageInitializers[pageName]) pageInitializers[pageName]();
    }

    // ─── ACTIVITY LOGS ───────────────────────────────────────────────────────────
    var _logRoleFilter = '';
    var _logData = [];
    var _logCursor = null;
    var _logHasMore = true;
    var _logTotal = 0;

    function _fetchLogsInitial() {
      return apiCall('GET', '/logs?limit=50').then(function (res) {
        var list = Array.isArray(res) ? res : (res && Array.isArray(res.logs) ? res.logs : []);
        _logData = list;
        _logTotal = res && typeof res.total === 'number' ? res.total : list.length;
        _logHasMore = res && res.hasMore;
        _logCursor = list.length ? list[list.length - 1].time : null;
        DB.set('logs', list.slice());
      });
    }

    function loadMoreLogs() {
      if (!_logCursor || !_logHasMore) return;
      var btn = document.getElementById('btn-load-more-logs');
      if (btn) { btn.disabled = true; btn.textContent = 'Loading\u2026'; }
      apiCall('GET', '/logs?limit=50&before=' + encodeURIComponent(_logCursor))
        .then(function (res) {
          var list = Array.isArray(res) ? res : (res && Array.isArray(res.logs) ? res.logs : []);
          if (list.length) {
            _logData = _logData.concat(list);
            _logCursor = list[list.length - 1].time;
            _logHasMore = res && res.hasMore;
            var existing = DB.get('logs') || [];
            DB.set('logs', existing.concat(list));
          } else {
            _logHasMore = false;
          }
          renderLogs();
          if (btn) { btn.disabled = false; btn.textContent = 'Load More'; }
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = 'Load More'; }
        });
    }

    function setLogRole(role) {
      _logRoleFilter = role;
      ['all', 'admin', 'teacher', 'student', 'system'].forEach(function (r) {
        var el = document.getElementById('lrt-' + r);
        if (el) el.classList.toggle('act-pill', (r === 'all' && role === '') || r === role);
      });
      renderLogs();
    }

    function _logRelTime(ts) {
      var diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      var d = new Date(ts), yest = new Date();
      yest.setDate(yest.getDate() - 1);
      if (d.toDateString() === yest.toDateString())
        return 'Yesterday ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }

    function _logDateLabel(ts) {
      var d = new Date(ts), today = new Date(), yest = new Date();
      yest.setDate(today.getDate() - 1);
      if (d.toDateString() === today.toDateString()) return 'Today';
      if (d.toDateString() === yest.toDateString()) return 'Yesterday';
      return d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
    }

    function addLog(action, details) {
      if (!currentUser) return;
      var la = action.toLowerCase();
      var type = 'other';
      if (la.includes('add') || la.includes('import')) type = 'add';
      else if (la.includes('update') || la.includes('edit') || la.includes('login') || la.includes('assign')) type = 'update';
      else if (la.includes('delete') || la.includes('clear') || la.includes('remove')) type = 'delete';
      var entry = {
        role: 'admin', userName: currentUser.name || 'Admin',
        action: action, details: details || '', type: type,
        timestamp: new Date().toISOString()
      };
      DB.insert('logs', entry);
      _logData.unshift(entry);
      _logTotal++;
      // Persist to server so student-side and admin logs share the same store
      var tok = getToken();
      if (tok) {
        fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body: JSON.stringify(entry)
        }).catch(function () { });
      }
    }

    function renderLogStatCards(total, counts) {
      var el = document.getElementById('log-stat-cards');
      if (!el) return;
      var cards = [
        { label: 'Total Logs', val: total, icon: '📋', bg: '#fff', tc: 'var(--td)', mc: 'var(--tmu)' },
        { label: 'Admin Actions', val: counts.admin, icon: '👑', bg: '#fef2f2', tc: '#dc2626', mc: 'var(--tmu)' },
        { label: 'Teacher Actions', val: counts.teacher, icon: '👩‍🏫', bg: '#eff6ff', tc: '#2563eb', mc: 'var(--tmu)' },
        { label: 'Student Actions', val: counts.student, icon: '🎓', bg: '#f0fdf4', tc: '#16a34a', mc: 'var(--tmu)' },
      ];
      el.innerHTML = cards.map(function (c) {
        return '<div style="background:' + c.bg + ';border-radius:16px;padding:18px 20px;display:flex;align-items:center;gap:14px;border:1px solid var(--br);box-shadow:0 1px 4px rgba(0,0,0,.04);">'
          + '<div style="font-size:30px;line-height:1;">' + c.icon + '</div>'
          + '<div><div style="font-size:26px;font-weight:800;color:' + c.tc + ';line-height:1.1;">' + c.val + '</div>'
          + '<div style="font-size:11px;font-weight:600;color:' + c.mc + ';margin-top:2px;">' + c.label + '</div></div>'
          + '</div>';
      }).join('');
    }

    function renderLogs() {
      var fromDate = document.getElementById('lfd') ? document.getElementById('lfd').value : '';
      var toDate = document.getElementById('ltd') ? document.getElementById('ltd').value : '';
      var searchQ = (document.getElementById('lsq') ? document.getElementById('lsq').value : '').toLowerCase();

      // Normalize: server stores 'time', local addLog stores 'timestamp' — support both
      var rawLogs = _logData;
      var logsArr = Array.isArray(rawLogs) ? rawLogs : [];
      var allLogs = logsArr.map(function (l) {
        return Object.assign({}, l, { _ts: l.timestamp || l.time || new Date().toISOString() });
      }).slice().reverse();

      // Stat counts from unfiltered set (always show full counts)
      var counts = { admin: 0, teacher: 0, student: 0, system: 0 };
      allLogs.forEach(function (l) {
        var r = (l.userName === 'SYSTEM' ? 'system' : (l.role || '')).toLowerCase();
        if (counts[r] !== undefined) counts[r]++;
      });
      renderLogStatCards(_logTotal, counts);

      // Apply filters
      if (_logRoleFilter) allLogs = allLogs.filter(function (l) { return l.role === _logRoleFilter; });
      if (fromDate) allLogs = allLogs.filter(function (l) { return l._ts.slice(0, 10) >= fromDate; });
      if (toDate) allLogs = allLogs.filter(function (l) { return l._ts.slice(0, 10) <= toDate; });
      if (searchQ) allLogs = allLogs.filter(function (l) {
        return (l.userName || '').toLowerCase().includes(searchQ)
          || (l.action || '').toLowerCase().includes(searchQ)
          || (l.details || '').toLowerCase().includes(searchQ);
      });

      var container = document.getElementById('fll');
      if (!container) return;
      if (!allLogs.length) {
        container.innerHTML = '<div class="emst"><span class="emico">📋</span><div class="emtx">No logs match your filters.</div></div>';
        return;
      }

      var roleStyle = {
        admin: { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5', av: '#dc2626', label: 'Admin' },
        teacher: { bg: '#eff6ff', color: '#2563eb', border: '#93c5fd', av: '#2563eb', label: 'Teacher' },
        student: { bg: '#f0fdf4', color: '#16a34a', border: '#86efac', av: '#16a34a', label: 'Student' },
        system: { bg: '#f5f3ff', color: '#7c3aed', border: '#c4b5fd', av: '#7c3aed', label: 'System' },
      };
      var typeStyle = {
        add: { bg: '#dcfce7', color: '#16a34a', label: 'Added' },
        update: { bg: '#fef3c7', color: '#d97706', label: 'Updated' },
        delete: { bg: '#fee2e2', color: '#dc2626', label: 'Deleted' },
        other: { bg: '#f3f4f6', color: '#6b7280', label: 'Action' },
      };

      // Group by calendar date using normalized _ts field
      var groups = {}, order = [];
      allLogs.forEach(function (log) {
        var key = new Date(log._ts).toDateString();
        if (!groups[key]) { groups[key] = { label: _logDateLabel(log._ts), entries: [] }; order.push(key); }
        groups[key].entries.push(log);
      });

      var html = '';
      order.forEach(function (key) {
        var g = groups[key];
        html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
          + '<span style="font-size:11px;font-weight:700;color:var(--tmu);text-transform:uppercase;letter-spacing:.7px;white-space:nowrap;">' + g.label + '</span>'
          + '<span style="flex:1;height:1px;background:var(--brl);"></span>'
          + '<span style="font-size:11px;color:var(--tdi);white-space:nowrap;">' + g.entries.length + ' action' + (g.entries.length !== 1 ? 's' : '') + '</span>'
          + '</div>';

        html += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:18px;">';
        g.entries.forEach(function (log, i) {
          var rs = roleStyle[log.role] || roleStyle.system;
          var ts = typeStyle[log.type] || typeStyle.other;
          var inits = (log.userName || '?').split(' ').map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase();
          var exact = new Date(log._ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          html += '<div style="display:flex;align-items:flex-start;gap:12px;padding:13px 18px;'
            + (i < g.entries.length - 1 ? 'border-bottom:1px solid var(--brl);' : '')
            + '" onmouseover="this.style.background=\'var(--gLt)\'" onmouseout="this.style.background=\'#fff\'">';

          html += '<div style="width:36px;height:36px;border-radius:50%;background:' + rs.av + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;flex-shrink:0;margin-top:1px;">' + inits + '</div>';

          html += '<div style="flex:1;min-width:0;">'
            + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">'
            + '<span style="font-size:13px;font-weight:700;color:var(--td);">' + (log.userName || 'Unknown') + '</span>'
            + '<span style="background:' + rs.bg + ';color:' + rs.color + ';border:1px solid ' + rs.border + ';padding:1px 9px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;">' + rs.label + '</span>'
            + '<span style="background:' + ts.bg + ';color:' + ts.color + ';padding:1px 9px;border-radius:20px;font-size:10px;font-weight:600;">' + ts.label + '</span>'
            + '</div>'
            + '<div style="font-size:13px;font-weight:600;color:var(--td);margin-bottom:' + (log.details ? '2px' : '0') + ';">' + (log.action || '') + '</div>'
            + (log.details ? '<div style="font-size:11.5px;color:var(--tmu);">' + log.details + '</div>' : '')
            + '</div>';

          html += '<div style="flex-shrink:0;text-align:right;padding-top:1px;">'
            + '<div style="font-size:11.5px;font-weight:600;color:var(--tdi);white-space:nowrap;" title="' + exact + '">' + _logRelTime(log._ts) + '</div>'
            + '</div>';

          html += '</div>';
        });
        html += '</div>';
      });

      container.innerHTML = html;
      var wrap = document.getElementById('load-more-logs-wrap');
      if (wrap) wrap.style.display = _logHasMore ? 'block' : 'none';
    }

    function clearAllLogs() {
      document.getElementById('dc-confirm-id').value = 'logs';
      document.getElementById('dc-confirm-msg').textContent = 'Clear all activity logs? This cannot be undone.';
      document.getElementById('dc-confirm-btn').onclick = function () {
        requireSpecialPw(function () {
          var tok = getToken();
          var headers = { 'Content-Type': 'application/json' };
          if (tok) headers['Authorization'] = 'Bearer ' + tok;
          dbToast('Clearing logs from DB…', 'saving');
          // Try bulk clear endpoint first
          fetch('/api/logs/all', { method: 'DELETE', headers: headers })
            .catch(function () {
              return fetch('/api/logs', { method: 'GET', headers: headers })
                .then(function (r) { return r.json(); })
                .then(function (logs) {
                  return Promise.all((logs || []).map(function (l) {
                    return fetch('/api/logs/' + l._id, { method: 'DELETE', headers: headers });
                  }));
                });
            })
            .finally(function () {
              DB.set('logs', []);
              _logData = [];
              _logCursor = null;
              _logHasMore = false;
              _logTotal = 0;
              renderLogs();
              addLog('Logs Cleared', 'All logs cleared from DB');
              closeModalBg('m-dc-confirm');
              dbToast('All logs cleared', 'success', 'Removed from Database + cache');
            });
        });
      };
      openModal_('m-dc-confirm');
    }
    var clrl = clearAllLogs;

    function exportLogs() {
      var logs = _logData;
      downloadCSV(
        [['Role', 'User', 'Action', 'Details', 'Timestamp']].concat(
          logs.map(function (l) { return [l.role, l.userName, l.action, l.details, l.timestamp]; })
        ), 'Activity_Logs'
      );
    }
    var elogs = exportLogs;
    var rl = renderLogs;

    // ─── ANALYTICS & REPORTS ──────────────────────────────────────────────────────
    function initAdminReports() {
      // Set default date range to last 30 days
      var today = new Date();
      var thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);

      var todayStr = today.toISOString().split('T')[0];
      var thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      ['ard-fr', 'aro-fr', 'arstu-fr'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = thirtyDaysAgoStr;
      });
      ['ard-to', 'aro-to', 'arstu-to'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = todayStr;
      });

      // Populate department dropdowns
      var depts = DB.get('depts') || [];
      ['ars-dept', 'ars-o-dept', 'arstu-dept'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
          el.innerHTML = '<option value="">All Departments</option>'
            + depts.map(function (d) { return '<option value="' + d._id + '">' + d.name + '</option>'; }).join('');
        }
      });

      // Generate the initial report
      genDeptRpt();
    }

    function arTab(tabName) {
      var tabs = ['dept', 'overall', 'student'];
      tabs.forEach(function (t) {
        var el = document.getElementById('rpt-' + t);
        if (el) el.style.display = (t === tabName) ? 'block' : 'none';
      });

      // Update active tab buttons
      var btnContainer = document.querySelector('.rep-tab-bar');
      if (btnContainer) {
        var buttons = btnContainer.querySelectorAll('.rtab');
        buttons.forEach(function (btn) {
          var onclickVal = btn.getAttribute('onclick') || '';
          btn.classList.toggle('act', onclickVal.indexOf("'" + tabName + "'") !== -1 || onclickVal.indexOf('"' + tabName + '"') !== -1);
        });
      }

      // Generate the active tab report
      if (tabName === 'dept') genDeptRpt();
      else if (tabName === 'overall') genOverallRpt();
      else if (tabName === 'student') genStuRpt();
    }

    function genDeptRpt() {
      var deptId = document.getElementById('ars-dept') ? document.getElementById('ars-dept').value : '';
      var from = document.getElementById('ard-fr') ? document.getElementById('ard-fr').value : '';
      var to = document.getElementById('ard-to') ? document.getElementById('ard-to').value : '';
      var tbody = document.getElementById('arb-dept');
      if (!tbody) return;

      if (!from || !to) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:36px;color:var(--tdi);">'
          + '<span style="font-size:38px;display:block;margin-bottom:10px;">📅</span>'
          + '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">Select a date range to generate the report.</div>'
          + '<div style="font-size:12px;color:var(--tdi);">Use the date pickers above to filter by date range.</div>'
          + '</td></tr>';
        return;
      }

      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--tdi);">⏳ Loading report data...</td></tr>';

      var url = '/attendance?';
      if (from) url += 'from=' + encodeURIComponent(from) + '&';
      if (to) url += 'to=' + encodeURIComponent(to) + '&';

      apiCall('GET', url).then(function (attendance) {
        attendance = Array.isArray(attendance) ? attendance : [];
        var classes = DB.get('classes') || [];

        var filtered = attendance.filter(function (att) {
          if (!deptId) return true;
          var cls = classes.find(function (c) { return c._id === att.classId; });
          return cls && cls.deptId === deptId;
        });

        if (filtered.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:36px;color:var(--tdi);">'
            + '<span style="font-size:38px;display:block;margin-bottom:10px;">📊</span>'
            + '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">No attendance records found.</div>'
            + '<div style="font-size:12px;color:var(--tdi);">Try selecting a different department or date range.</div>'
            + '</td></tr>';
          return;
        }

        // Group by classId + subjectId
        var groups = {};
        filtered.forEach(function (att) {
          var cls = classes.find(function (c) { return c._id === att.classId; });
          var key = att.classId + '_' + att.subjectId;
          if (!groups[key]) {
            groups[key] = {
              className: att.className || '—',
              subjectName: att.subjectName || '—',
              deptName: (cls && cls.deptName) || '—',
              totalPresent: 0,
              totalAbsent: 0,
              sessions: 0
            };
          }
          groups[key].totalPresent += (att.totalPresent || 0);
          groups[key].totalAbsent += (att.totalAbsent || 0);
          groups[key].sessions += 1;
        });

        var rowsHtml = Object.keys(groups).map(function (key, index) {
          var g = groups[key];
          var total = g.totalPresent + g.totalAbsent;
          var pct = total > 0 ? ((g.totalPresent / total) * 100).toFixed(1) : '0.0';
          return '<tr>'
            + '<td>' + (index + 1) + '</td>'
            + '<td>' + g.className + '</td>'
            + '<td>' + g.subjectName + '</td>'
            + '<td>' + g.deptName + '</td>'
            + '<td>' + g.sessions + '</td>'
            + '<td>' + g.totalPresent + '</td>'
            + '<td>' + g.totalAbsent + '</td>'
            + '<td class="b" style="color: ' + (parseFloat(pct) >= 75 ? 'var(--gD)' : 'var(--red)') + '">' + pct + '%</td>'
            + '</tr>';
        }).join('');

        tbody.innerHTML = rowsHtml;
      }).catch(function (err) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--red);">Error loading report: ' + (err.message || 'unknown error') + '</td></tr>';
      });
    }

    function genOverallRpt() {
      var deptId = document.getElementById('ars-o-dept') ? document.getElementById('ars-o-dept').value : '';
      var from = document.getElementById('aro-fr') ? document.getElementById('aro-fr').value : '';
      var to = document.getElementById('aro-to') ? document.getElementById('aro-to').value : '';
      var tbody = document.getElementById('arb-overall');
      if (!tbody) return;

      if (!from || !to) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:36px;color:var(--tdi);">'
          + '<span style="font-size:38px;display:block;margin-bottom:10px;">📅</span>'
          + '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">Select a date range to generate the report.</div>'
          + '<div style="font-size:12px;color:var(--tdi);">Use the date pickers above to filter by date range.</div>'
          + '</td></tr>';
        return;
      }

      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--tdi);">⏳ Loading report data...</td></tr>';

      var url = '/attendance?';
      if (from) url += 'from=' + encodeURIComponent(from) + '&';
      if (to) url += 'to=' + encodeURIComponent(to) + '&';

      apiCall('GET', url).then(function (attendance) {
        attendance = Array.isArray(attendance) ? attendance : [];

        var depts = DB.get('depts') || [];
        var classes = DB.get('classes') || [];
        var students = DB.get('students') || [];

        // Group by department
        var deptGroups = {};
        depts.forEach(function (d) {
          if (deptId && d._id !== deptId) return;
          deptGroups[d._id] = {
            name: d.name,
            classCount: 0,
            studentCount: 0,
            totalPresent: 0,
            totalAbsent: 0,
            recordCount: 0
          };
        });

        classes.forEach(function (c) {
          if (deptGroups[c.deptId]) {
            deptGroups[c.deptId].classCount++;
          }
        });

        students.forEach(function (s) {
          if (deptGroups[s.deptId]) {
            deptGroups[s.deptId].studentCount++;
          }
        });

        attendance.forEach(function (att) {
          var cls = classes.find(function (c) { return c._id === att.classId; });
          if (cls && deptGroups[cls.deptId]) {
            var dg = deptGroups[cls.deptId];
            dg.totalPresent += (att.totalPresent || 0);
            dg.totalAbsent += (att.totalAbsent || 0);
            dg.recordCount += (att.records ? att.records.length : 0);
          }
        });

        var activeDepts = Object.keys(deptGroups);
        if (activeDepts.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:36px;color:var(--tdi);">'
            + '<span style="font-size:38px;display:block;margin-bottom:10px;">📊</span>'
            + '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">No departments found or matches.</div>'
            + '</td></tr>';
          return;
        }

        var rowsHtml = activeDepts.map(function (id, index) {
          var dg = deptGroups[id];
          var total = dg.totalPresent + dg.totalAbsent;
          var pct = total > 0 ? ((dg.totalPresent / total) * 100).toFixed(1) : '0.0';
          return '<tr>'
            + '<td>' + (index + 1) + '</td>'
            + '<td class="b">' + dg.name + '</td>'
            + '<td>' + dg.classCount + '</td>'
            + '<td>' + dg.studentCount + '</td>'
            + '<td>' + dg.recordCount + '</td>'
            + '<td>' + dg.totalPresent + '</td>'
            + '<td>' + dg.totalAbsent + '</td>'
            + '<td class="b" style="color: ' + (parseFloat(pct) >= 75 ? 'var(--gD)' : 'var(--red)') + '">' + pct + '%</td>'
            + '</tr>';
        }).join('');

        tbody.innerHTML = rowsHtml;
      }).catch(function (err) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--red);">Error loading report: ' + (err.message || 'unknown error') + '</td></tr>';
      });
    }

    function genStuRpt() {
      var deptId = document.getElementById('arstu-dept') ? document.getElementById('arstu-dept').value : '';
      var from = document.getElementById('arstu-fr') ? document.getElementById('arstu-fr').value : '';
      var to = document.getElementById('arstu-to') ? document.getElementById('arstu-to').value : '';
      var tbody = document.getElementById('arb-student');
      if (!tbody) return;

      if (!from || !to) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:36px;color:var(--tdi);">'
          + '<span style="font-size:38px;display:block;margin-bottom:10px;">📅</span>'
          + '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">Select a date range to generate the report.</div>'
          + '<div style="font-size:12px;color:var(--tdi);">Use the date pickers above to filter by date range.</div>'
          + '</td></tr>';
        return;
      }

      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--tdi);">⏳ Loading report data...</td></tr>';

      var url = '/attendance?';
      if (from) url += 'from=' + encodeURIComponent(from) + '&';
      if (to) url += 'to=' + encodeURIComponent(to) + '&';

      apiCall('GET', url).then(function (attendance) {
        attendance = Array.isArray(attendance) ? attendance : [];
        var students = DB.get('students') || [];
        if (deptId) {
          students = students.filter(function (s) { return s.deptId === deptId; });
        }

        if (students.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:36px;color:var(--tdi);">'
            + '<span style="font-size:38px;display:block;margin-bottom:10px;">👨‍🎓</span>'
            + '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">No students found.</div>'
            + '</td></tr>';
          return;
        }

        var studentStats = {};
        students.forEach(function (s) {
          studentStats[s.regNo] = {
            name: s.name,
            regNo: s.regNo,
            deptName: s.deptName || '—',
            present: 0,
            absent: 0
          };
        });

        attendance.forEach(function (att) {
          if (Array.isArray(att.records)) {
            att.records.forEach(function (rec) {
              if (studentStats[rec.regNo]) {
                if (rec.status === 'present') studentStats[rec.regNo].present++;
                else if (rec.status === 'absent') studentStats[rec.regNo].absent++;
              }
            });
          }
        });

        var rowsHtml = students.map(function (s, index) {
          var stat = studentStats[s.regNo];
          var total = stat.present + stat.absent;
          var pct = total > 0 ? ((stat.present / total) * 100).toFixed(1) : '0.0';
          return '<tr>'
            + '<td>' + (index + 1) + '</td>'
            + '<td class="b">' + stat.name + '</td>'
            + '<td>' + stat.regNo + '</td>'
            + '<td>' + stat.deptName + '</td>'
            + '<td class="b" style="color: ' + (parseFloat(pct) >= 75 ? 'var(--gD)' : 'var(--red)') + '">' + pct + '%</td>'
            + '</tr>';
        }).join('');

        tbody.innerHTML = rowsHtml;
      }).catch(function (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--red);">Error loading report: ' + (err.message || 'unknown error') + '</td></tr>';
      });
    }

    function expAdminRpt(type, format) {
      var activeTab = 'dept';
      if (document.getElementById('rpt-overall') && document.getElementById('rpt-overall').style.display !== 'none') activeTab = 'overall';
      else if (document.getElementById('rpt-student') && document.getElementById('rpt-student').style.display !== 'none') activeTab = 'student';

      var tableBodyEl = document.getElementById('arb-' + activeTab);
      if (!tableBodyEl) return;

      var headers = [];
      var rows = [];

      var headerSelector = '#pg-reports #rpt-' + activeTab + ' table thead tr th';
      document.querySelectorAll(headerSelector).forEach(function (th) {
        headers.push(th.textContent.trim());
      });

      tableBodyEl.querySelectorAll('tr').forEach(function (tr) {
        var row = [];
        tr.querySelectorAll('td').forEach(function (td) {
          row.push(td.textContent.trim());
        });
        if (row.length > 0) rows.push(row);
      });

      if (rows.length === 0 || (rows.length === 1 && rows[0][0].indexOf('No') === 0 || rows[0][0].indexOf('⏳') === 0)) {
        showToast('No data to export', 'warn');
        return;
      }

      var allData = [headers].concat(rows);
      var fileName = 'Attendance_Report_' + activeTab + '_' + new Date().toISOString().split('T')[0];

      if (format === 'csv') {
        downloadCSV(allData, fileName);
      } else if (format === 'xlsx') {
        if (typeof XLSX === 'undefined') {
          showToast('XLSX library not loaded yet', 'warn');
          return;
        }
        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.aoa_to_sheet(allData);
        XLSX.book_append_sheet(wb, ws, "Report");
        XLSX.writeFile(wb, fileName + ".xlsx");
      }
    }

    // ─── DASHBOARD ───────────────────────────────────────────────────────────────
    function initDash() {
      // FAST PATH — runs immediately from cached data
      populateChartFilters();
      renderNotificationsMain();
      renderActivityFeed();
      renderSystemHealth();
      apiCall('GET', '/settings/maintenance').then(function (d) {
        var badge = document.getElementById('sb-maint-badge');
        if (badge) badge.style.display = (d && d.active) ? 'inline-flex' : 'none';
      }).catch(function () { });
      // DEFERRED PATH — runs after shell paints
      requestAnimationFrame(function () {
        setTimeout(renderDeferredDashboard, 50);
      });
    }
    function shiftToMenu(fun1, fun2) {
      om(fun1);
      nav(fun2);
    }

    function syncBadgesFromAPI() {
      var tok = getToken();
      if (!tok) return;
      var h = { 'Authorization': 'Bearer ' + tok };
      fetch('/api/dashboard/summary', { headers: h }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.error) return;
        var el;
        el = document.getElementById('c-students'); if (el) el.textContent = d.students;
        el = document.getElementById('c-depts'); if (el) el.textContent = d.depts;
        el = document.getElementById('c-teachers'); if (el) el.textContent = d.teachers;
        el = document.getElementById('c-classes'); if (el) el.textContent = d.classes;
        el = document.getElementById('sb-stu-badge'); if (el) el.textContent = d.students;
        el = document.getElementById('sb-dept-badge'); if (el) el.textContent = d.depts;
        el = document.getElementById('sb-teach-badge'); if (el) el.textContent = d.teachers;
      }).catch(function () { });
    }

    // ─── DEFERRED DASHBOARD HELPERS ──────────────────────────────────────────────
    function fetchWithTimeout(url, timeoutMs, headers) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      return fetch(url, { headers: headers, signal: controller.signal })
        .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function (err) { clearTimeout(timer); throw err; });
    }

    function showWidgetRetry(containerId, label) {
      var el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--tdi);font-size:12px;">'
        + '⚠️ ' + label + ' failed to load. '
        + '<button onclick="retryDeferredWidget(\'' + containerId + '\',\'' + label + '\')" style="background:var(--gD);color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:11px;font-weight:600;cursor:pointer;font-family:Poppins,sans-serif;margin-left:8px;">Retry</button>'
        + '</div>';
    }

    var _deferredWidgetRetries = {};

    function retryDeferredWidget(containerId, label) {
      if (_deferredWidgetRetries[containerId]) return;
      _deferredWidgetRetries[containerId] = true;
      var el = document.getElementById(containerId);
      if (el) el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--tdi);font-size:12px;">⏳ Loading ' + label + '…</div>';
      renderDeferredDashboard();
    }

    function renderDeferredDashboard() {
      var tok = getToken();
      if (!tok) return;
      var h = { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' };

      var params = [];
      var deptVal = document.getElementById('f-dept');
      if (deptVal && deptVal.value) params.push('deptId=' + encodeURIComponent(deptVal.value));
      var classVal = document.getElementById('f-class');
      if (classVal && classVal.value) params.push('classId=' + encodeURIComponent(classVal.value));
      var fromVal = document.getElementById('f-from');
      if (fromVal && fromVal.value) params.push('from=' + encodeURIComponent(fromVal.value));
      var toVal = document.getElementById('f-to');
      if (toVal && toVal.value) params.push('to=' + encodeURIComponent(toVal.value));
      var dateVal = document.getElementById('f-date');
      if (dateVal && dateVal.value) params.push('date=' + encodeURIComponent(dateVal.value));
      params.push('reportType=' + (reportType || 'overall'));
      var qs = params.join('&');

      // Attendance overview — timeboxed 8s
      if (!_deferredWidgetRetries['bar-chart']) {
        fetchWithTimeout('/api/dashboard/attendance-overview?' + qs, 8000, h)
          .then(function (data) {
            renderBars(data.chartItems || []);
            var csP = document.getElementById('cs-present');
            var csA = document.getElementById('cs-absent');
            var csPct = document.getElementById('cs-pct');
            if (csP) csP.textContent = data.summary && data.summary.present !== undefined ? data.summary.present : '—';
            if (csA) csA.textContent = data.summary && data.summary.absent !== undefined ? data.summary.absent : '—';
            if (csPct) csPct.textContent = data.summary && data.summary.pct !== undefined ? data.summary.pct : '—%';
          }).catch(function () {
            showWidgetRetry('bar-chart', 'Attendance chart');
          });
      }

      // Defaulters — timeboxed 8s
      if (!_deferredWidgetRetries['def-list']) {
        fetchWithTimeout('/api/dashboard/defaulters', 8000, h)
          .then(function (data) {
            var list = Array.isArray(data) ? data : [];
            document.getElementById('def-total-label').textContent = list.length + ' student' + (list.length !== 1 ? 's' : '');
            var listEl = document.getElementById('def-list');
            if (!list.length) {
              listEl.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,.5);font-size:12px;">🎉 No defaulters</div>';
              return;
            }
            listEl.innerHTML = list.slice(0, 6).map(function (s) {
              return '<div class="def-item">'
                + '<div class="def-av">' + (s.name ? s.name[0] : '?') + '</div>'
                + '<div style="flex:1;min-width:0;">'
                + '<div class="def-name">' + s.name + '</div>'
                + '<div class="def-cls">' + (s.className || '—') + '</div>'
                + '</div>'
                + '<div class="def-pct-badge">' + s.pct + '%</div>'
                + '</div>';
            }).join('');
            window._defaultersFullList = list;
          }).catch(function () {
            showWidgetRetry('def-list', 'Defaulters');
          });
      }

      // Unmarked teachers — timeboxed 8s (existing endpoint)
      if (!_deferredWidgetRetries['unmarked-list']) {
        fetchWithTimeout('/api/attendance/unmarked-teachers', 8000, h)
          .then(function (data) {
            var list = Array.isArray(data) ? data : [];
            var badge = document.getElementById('unmarked-count-badge');
            if (badge) badge.textContent = list.length + ' pending';
            var listEl = document.getElementById('unmarked-list');
            if (!list.length) {
              listEl.innerHTML = '<div class="empty-state"><span class="ei">✅</span><p>All teachers marked attendance this week</p></div>';
              return;
            }
            listEl.innerHTML = list.map(function (item) {
              var daysString = (item.missingDays || []).map(function (d) { return formatDate(d); }).join(', ');
              var dayLabel = item.missingCount > 1 ? 'days' : 'day';
              return '<div class="unm-item">'
                + '<div class="unm-av">⚠️</div>'
                + '<div class="unm-info">'
                + '<div class="unm-name">' + (item.teacherName || '—') + '</div>'
                + '<div class="unm-sub">' + (item.subjectName || '') + ' · ' + (item.className || '') + '</div>'
                + '<div class="unm-meta">Missing: ' + daysString + ' (' + item.missingCount + ' ' + dayLabel + ')</div>'
                + '</div>'
                + '<button class="notify-btn" onclick="openNotifyModal(\'' + (item.teacherId || '') + '\',\'' + (item.teacherName || '') + '\',\'' + (item.subjectName || '') + '\',\'' + (item.className || '') + '\')">📢 Notify</button>'
                + '</div>';
            }).join('');
          }).catch(function () {
            showWidgetRetry('unmarked-list', 'Unmarked teachers');
          });
      }
    }

    // ─── BAR CHART ───────────────────────────────────────────────────────────────
    var reportType = 'overall';

    function setReportType(type) {
      reportType = type;
      document.getElementById('rp-overall').classList.toggle('act', type === 'overall');
      document.getElementById('rp-specific').classList.toggle('act', type === 'specific');
      document.getElementById('date-overall-row').style.display = type === 'overall' ? 'flex' : 'none';
      document.getElementById('date-specific-row').style.display = type === 'specific' ? 'flex' : 'none';
      onFilterChange();
    }

    function setWeekRange(rangeType) {
      var today = new Date();
      var fromDate, toDate;

      if (rangeType === 'this') {
        var dayOfWeek = today.getDay();
        var monday = new Date(today);
        monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
        fromDate = monday.toISOString().split('T')[0];
        toDate = new Date(today).toISOString().split('T')[0];
      } else if (rangeType === 'last') {
        var dayOfWeek2 = today.getDay();
        var lastMon = new Date(today);
        lastMon.setDate(today.getDate() - ((dayOfWeek2 + 6) % 7) - 7);
        var lastFri = new Date(lastMon);
        lastFri.setDate(lastMon.getDate() + 4);
        fromDate = lastMon.toISOString().split('T')[0];
        toDate = lastFri.toISOString().split('T')[0];
      } else {
        // 'month'
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        toDate = today.toISOString().split('T')[0];
      }

      document.getElementById('f-from').value = fromDate;
      document.getElementById('f-to').value = toDate;
      onFilterChange();
    }

    function onFilterChange() {
      var selectedDept = document.getElementById('f-dept').value;
      var allClasses = DB.get('classes').filter(function (c) {
        return !selectedDept || c.deptId === selectedDept;
      });

      // Refresh the class dropdown while preserving the current selection
      var classDropdown = document.getElementById('f-class');
      var currentClassId = classDropdown.value;
      classDropdown.innerHTML = '<option value="">All</option>'
        + allClasses.map(function (c) {
          return '<option value="' + c._id + '"' + (c._id === currentClassId ? ' selected' : '') + '>' + c.name + '</option>';
        }).join('');

      renderDeferredDashboard();
    }

    function buildBarChart() {
      renderDeferredDashboard();
    }

    function renderBars(items) {
      var wrapper = document.getElementById('bar-chart');
      if (!items.length) {
        wrapper.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--tdi);font-size:12px;">No data for selected filters</div>';
        return;
      }

      var topIndex = items.reduce(function (maxIdx, item, idx) {
        return item.pct > items[maxIdx].pct ? idx : maxIdx;
      }, 0);

      wrapper.innerHTML = items.map(function (item, index) {
        var barHeight = item.total > 0 ? Math.max(20, Math.round((item.pct / 100) * 130)) : 14;
        var barClass = 'bar-pill ';
        if (item.type === 'weekend' || item.type === 'nodata') barClass += 'striped';
        else if (item.type === 'high') barClass += 'solid-dark';
        else if (item.type === 'mid') barClass += 'solid-light';
        else barClass += 'absent';

        var pctLabel = (index === topIndex && item.total > 0) ? '<div class="bar-pct-label">' + item.pct + '%</div>' : '';
        var titleAttr = item.total > 0 ? ' title="' + (item.full || item.label) + ': ' + item.present + 'P / ' + item.absent + 'A (' + item.pct + '%)"' : '';
        var todayClass = item.isToday ? ' today' : '';

        return '<div class="bar-col">'
          + '<div class="bar-outer">' + pctLabel
          + '<div class="' + barClass + '" style="height:' + barHeight + 'px;"' + titleAttr + '></div></div>'
          + '<div class="bar-day' + todayClass + '">' + item.label + '</div>'
          + '</div>';
      }).join('');
    }

    // ─── GAUGE ───────────────────────────────────────────────────────────────────
    function updateGauge() {
      // Gauge now populated via deferred API data
    }

    // ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
    function renderNotificationsMain() {
      var notifications = DB.get('notifications').slice().reverse();
      var unreadCount = notifications.filter(function (n) { return !n.read; }).length;

      document.getElementById('notif-count-badge').textContent = unreadCount + ' new';
      var badge = document.getElementById('notif-badge-count');
      badge.textContent = unreadCount;
      badge.style.display = unreadCount ? 'flex' : 'none';

      var listEl = document.getElementById('notif-list-main');
      if (!notifications.length) {
        listEl.innerHTML = '<div class="empty-state"><span class="ei">🎉</span><p>No notifications</p></div>';
        return;
      }

      listEl.innerHTML = notifications.slice(0, 8).map(function (n) {
        var isGrievance = n.message && n.message.startsWith('[Grievance]');
        var isSolved = n.status === 'Solved';
        var isCancelled = n.status === 'Cancelled';
        var icon = n.type === 'error' ? '❌' : (isGrievance ? '📣' : '📩');
        var tagClass = isSolved ? 'notif-tag-req' : (n.type === 'error' ? 'notif-tag-err' : 'notif-tag-req');
        var statusBadge = isSolved
          ? '<span style="background:#e8f5e9;color:var(--gD);font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;border:1px solid var(--gLr);">✅ Solved</span>'
          : isCancelled
            ? '<span style="background:#fef2f2;color:#dc2626;font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;border:1px solid rgba(239,68,68,.2);">❌ Cancelled</span>'
            : '<span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;border:1px solid rgba(245,158,11,.25);">⏳ Pending</span>';
        var unreadDot = !n.read ? '<div class="notif-unread-dot"></div>' : '';
        var highlight = !n.read ? 'highlight-notif' : '';

        var actionBtns = (!isSolved && !isCancelled)
          ? '<div style="display:flex;gap:6px;margin-top:7px;">'
          + '<button onclick="event.stopPropagation();solveNotification(\'' + n._id + '\')" style="flex:1;padding:4px 0;background:var(--gD);color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:Poppins,sans-serif;">✅ Solve</button>'
          + '<button onclick="event.stopPropagation();cancelNotification(\'' + n._id + '\')" style="flex:1;padding:4px 0;background:#fff;color:#dc2626;border:1.5px solid rgba(239,68,68,.3);border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:Poppins,sans-serif;">❌ Cancel</button>'
          + '</div>'
          : '';

        return '<div class="notif-item ' + highlight + '" onclick="markNotificationRead(\'' + n._id + '\')">'
          + '<div class="notif-icon-row">'
          + '<div class="notif-ic ' + (n.type === 'error' ? 'error' : 'request') + '">' + icon + '</div>'
          + '<div class="notif-from">' + n.from + '</div>'
          + statusBadge + unreadDot
          + '</div>'
          + '<div class="notif-msg">' + n.message + '</div>'
          + '<div class="notif-time">' + timeAgo(n.time) + '</div>'
          + actionBtns
          + '</div>';
      }).join('');
    }

    function renderNotificationDropdown() {
      var notifications = DB.get('notifications').slice().reverse();
      var listEl = document.getElementById('nd-list');

      if (!notifications.length) {
        listEl.innerHTML = '<div class="nd-empty">No notifications</div>';
        return;
      }

      listEl.innerHTML = notifications.slice(0, 8).map(function (n) {
        var isSolved = n.status === 'Solved';
        var isCancelled = n.status === 'Cancelled';
        var unreadDot = !n.read ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--blue);display:inline-block;margin-left:3px;vertical-align:middle;"></div>' : '';
        var tagClass = n.type === 'error' ? 'notif-tag-err' : 'notif-tag-req';
        var statusChip = isSolved
          ? '<span style="font-size:9px;color:var(--gD);font-weight:700;">✅</span>'
          : isCancelled
            ? '<span style="font-size:9px;color:#dc2626;font-weight:700;">❌</span>'
            : '<span style="font-size:9px;color:#92400e;font-weight:700;">⏳</span>';
        return '<div class="nd-item' + (!n.read ? ' unread' : '') + '" onclick="markNotificationRead(\'' + n._id + '\');toggleNotificationDropdown()">'
          + '<div style="font-size:20px;flex-shrink:0;">' + (n.type === 'error' ? '❌' : '📩') + '</div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div class="nd-from">' + n.from + unreadDot + statusChip + '<span class="' + tagClass + '" style="margin-left:auto;">' + n.type + '</span></div>'
          + '<div class="nd-msg">' + n.message + '</div>'
          + '<div class="nd-tm">' + timeAgo(n.time) + '</div>'
          + '</div></div>';
      }).join('');
    }

    function renderNotificationsAll() {
      var notifications = DB.get('notifications').slice().reverse();
      var listEl = document.getElementById('notif-all-list');

      if (!notifications.length) {
        listEl.innerHTML = '<div class="empty-state"><span class="ei">🎉</span><p>No notifications</p></div>';
        return;
      }

      listEl.innerHTML = notifications.map(function (n) {
        var isSolved = n.status === 'Solved';
        var isCancelled = n.status === 'Cancelled';
        var tagClass = n.type === 'error' ? 'notif-tag-err' : 'notif-tag-req';
        var unreadDot = !n.read ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--blue);display:inline-block;margin-left:4px;"></div>' : '';
        var statusChip = isSolved
          ? '<span style="background:#e8f5e9;color:var(--gD);font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;border:1px solid var(--gLr);margin-left:auto;">✅ Solved</span>'
          : isCancelled
            ? '<span style="background:#fef2f2;color:#dc2626;font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;border:1px solid rgba(239,68,68,.2);margin-left:auto;">❌ Cancelled</span>'
            : '<span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;border:1px solid rgba(245,158,11,.25);margin-left:auto;">⏳ Pending</span>';
        var actionBtns = (!isSolved && !isCancelled)
          ? '<div style="display:flex;gap:6px;margin-top:8px;">'
          + '<button class="btn-pri bxs" onclick="event.stopPropagation();solveNotification(\'' + n._id + '\');renderNotificationsAll()">✅ Solve</button>'
          + '<button class="btn bout bxs" style="color:#dc2626;border-color:rgba(239,68,68,.3);" onclick="event.stopPropagation();cancelNotification(\'' + n._id + '\');renderNotificationsAll()">❌ Cancel</button>'
          + '</div>'
          : '';

        return '<div class="m-item" onclick="markNotificationRead(\'' + n._id + '\')">'
          + '<div class="m-ic" style="background:' + (n.type === 'error' ? 'rgba(239,68,68,.08)' : 'rgba(245,158,11,.08)') + '">' + (n.type === 'error' ? '❌' : '📩') + '</div>'
          + '<div class="m-body" style="flex:1;">'
          + '<div class="m-name" style="display:flex;align-items:center;gap:7px;">' + n.from
          + '<span class="' + tagClass + '">' + n.type + '</span>' + unreadDot + statusChip + '</div>'
          + '<div class="m-sub">' + n.message + '</div>'
          + '<div style="font-size:10px;color:var(--tdi);margin-top:3px;">' + new Date(n.time).toLocaleString('en-IN') + '</div>'
          + actionBtns
          + '</div></div>';
      }).join('');
    }

    function markNotificationRead(id) {
      DB.update('notifications', id, { read: true });
      renderNotificationsMain();
      renderNotificationDropdown();
    }
    var markNotifRead = markNotificationRead; // alias for HTML

    function clearAllNotifications() {
      DB.get('notifications').forEach(function (n) {
        DB.update('notifications', n._id, { read: true });
      });
      renderNotificationsMain();
      renderNotificationDropdown();
      document.getElementById('notif-drop').classList.remove('open');
      showToast('✅ All marked as read');
    }
    var clearAllNotifs = clearAllNotifications;

    function approveRequest(id) {
      var notification = DB.get('notifications').find(function (x) { return x._id === id; });
      DB.update('notifications', id, { read: true, approved: true, status: 'Solved', solvedAt: new Date().toISOString() });
      if (notification && notification.grievanceId) {
        DB.update('teacher-grievances', notification.grievanceId, { status: 'Resolved', resolvedAt: new Date().toISOString() });
      }
      addLog('Request Approved', 'Approved request from ' + (notification ? notification.from : 'teacher'));
      renderNotificationsAll();
      renderNotificationsMain();
      dbToast('✅ Request approved!', 'success');
    }

    function solveNotification(id) {
      var n = DB.get('notifications').find(function (x) { return x._id === id; });
      if (!n) return;
      DB.update('notifications', id, { read: true, status: 'Solved', solvedAt: new Date().toISOString() });

      if (n.grievanceId) {
        DB.update('teacher-grievances', n.grievanceId, { status: 'Resolved', resolvedAt: new Date().toISOString(), resolvedBy: 'Admin' });
      }
      addLog('Notification Solved', 'Admin resolved notification from ' + (n.from || 'teacher'));
      renderNotificationsMain();
      renderNotificationDropdown();
      dbToast('✅ Marked as Solved — teacher portal updated', 'success');
    }

    function cancelNotification(id) {
      var n = DB.get('notifications').find(function (x) { return x._id === id; });
      if (!n) return;
      DB.update('notifications', id, { read: true, status: 'Cancelled', cancelledAt: new Date().toISOString() });
      if (n.grievanceId) {
        DB.update('teacher-grievances', n.grievanceId, { status: 'Cancelled', cancelledAt: new Date().toISOString() });
      }
      addLog('Notification Cancelled', 'Admin dismissed notification from ' + (n.from || 'teacher'));
      renderNotificationsMain();
      renderNotificationDropdown();
      showToast('❌ Notification cancelled');
    }

    function toggleNotificationDropdown() {
      var dropdown = document.getElementById('notif-drop');
      dropdown.classList.toggle('open');
      if (dropdown.classList.contains('open')) renderNotificationDropdown();
    }
    var toggleNotifDrop = toggleNotificationDropdown;

    document.addEventListener('click', function (e) {
      var dropdown = document.getElementById('notif-drop');
      if (dropdown && !dropdown.contains(e.target) && !e.target.closest('.tb-icon')) {
        dropdown.classList.remove('open');
      }
    });

    

    // ─── UNMARKED TEACHERS ───────────────────────────────────────────────────────
    function getUnmarked() {
      var assignments = DB.get('assignments');
      var attendance = DB.get('attendance');
      var weekDates = thisWeek();
      var unmarkedList = [];

      assignments.forEach(function (assignment) {
        var markedRecords = attendance.filter(function (a) {
          return a.classId === assignment.classId
            && a.subjectId === assignment.subjectId
            && weekDates.includes(a.date);
        });
        var markedDays = new Set(markedRecords.map(function (a) { return a.date; }));
        var missingDays = weekDates.filter(function (d) { return !markedDays.has(d); });

        if (missingDays.length > 0) {
          unmarkedList.push(Object.assign({}, assignment, {
            missingDays: missingDays,
            missingCount: missingDays.length
          }));
        }
      });

      return unmarkedList;
    }

    function renderUnmarkedTeachers() {
      // Replaced by deferred API path
    }
    var renderUnmarked = renderUnmarkedTeachers; // alias

    var notifyTarget = null;

    function openNotifyModal(teacherId, teacherName, subjectName, className) {
      notifyTarget = { tid: teacherId, tname: teacherName };
      document.getElementById('notify-sub').textContent = 'To: ' + teacherName;
      document.getElementById('notify-msg').value =
        'Dear ' + teacherName + ',\n\nThis is a reminder to mark attendance for '
        + subjectName + ' (' + className + ') for the missing days this week.\n\nRegards,\nAdministrator';
      openModal_('m-notify');
    }

    function sendNotification() {
      var message = document.getElementById('notify-msg').value.trim();
      var priority = document.getElementById('notify-priority').value;
      if (!message) { showToast('Please enter a message', 'warn'); return; }
      if (!notifyTarget) { closeModalBg('m-notify'); return; }

      DB.insert('teacher-notifications', {
        toTeacherId: notifyTarget.tid,
        toTeacherName: notifyTarget.tname,
        from: 'Administrator',
        message: message,
        priority: priority,
        type: 'attendance-alert',
        time: new Date().toISOString(),
        read: false
      });

      addLog('Notification Sent', 'Attendance reminder (' + priority + ') sent to ' + notifyTarget.tname);
      closeModalBg('m-notify');
      dbToast('Reminder sent to ' + notifyTarget.tname + '!', 'success');
      notifyTarget = null;
    }

    // ─── ACTIVITY FEED ───────────────────────────────────────────────────────────
    var AVATAR_COLORS = ['#388e3c', '#3b82f6', '#8b5cf6', '#f59e0b', '#0891b2', '#ef4444'];

    function renderActivityFeed() {
      var recentLogs = DB.get('logs').slice().reverse().slice(0, 6);
      var listEl = document.getElementById('activity-list');

      if (!recentLogs.length) {
        listEl.innerHTML = '<div class="empty-state"><span class="ei">📋</span><p>No activity yet</p></div>';
        return;
      }

      var badgeMap = {
        'Login': 'ab-green',
        'Student Added': 'ab-blue',
        'Teacher Added': 'ab-blue',
        'Notification Sent': 'ab-amber',
        'Attendance Marked': 'ab-green',
        'Logs Cleared': 'ab-red'
      };

      listEl.innerHTML = recentLogs.map(function (log, index) {
        var color = AVATAR_COLORS[index % AVATAR_COLORS.length];
        var badge = badgeMap[log.action] || 'ab-green';
        return '<div class="activity-item">'
          + '<div class="act-av" style="background:' + color + '">' + ((log.userName || '?')[0] || '?').toUpperCase() + '</div>'
          + '<div class="act-body">'
          + '<div class="act-name">' + log.userName + '</div>'
          + '<div class="act-task">Working on <b>' + log.action + '</b> — ' + log.details + '</div>'
          + '</div>'
          + '<div class="act-badge ' + badge + '">' + log.action + '</div>'
          + '</div>';
      }).join('');
    }
    var renderActivity = renderActivityFeed; // alias

    // ─── DEFAULTERS ──────────────────────────────────────────────────────────────
    function renderDefaulters(showFull) {
      // Replaced by deferred API path
    }

    function downloadDefaulters() {
      var list = window._defaultersFullList || [];
      if (!list.length) { showToast('No defaulter data to download'); return; }
      downloadCSV(
        [['Name', 'Reg No', 'Class', 'Dept', 'Attendance%']].concat(
          list.map(function (s) { return [s.name, s.regNo, s.className || '', s.deptName || '', s.pct + '%']; })
        ),
        'Defaulters'
      );
      showToast('⬇️ Downloaded!');
    }

    // ─── SYSTEM HEALTH CARD ──────────────────────────────────────────────────────
    function renderSystemHealth() {
      var students = DB.get('students');
      var teachers = DB.get('users').filter(function (u) { return u.role === 'teacher'; });

      var healthItems = [
        { icon: '👨‍🎓', bg: '#dbeafe', label: 'Total Students', value: students.length, pill: null },
        { icon: '👩‍🏫', bg: '#ede9fe', label: 'Total Teachers', value: teachers.length, pill: null },
        { icon: '📋', bg: '#d1fae5', label: 'Attendance Records', value: '—', pill: null },
        { icon: '🖥️', bg: '#ecfdf5', label: 'Server Status', value: 'Online', pill: { text: '● Running', cls: 'sh-ok' } },
        { icon: '🗃️', bg: '#f0fdf4', label: 'Database', value: 'Connected', pill: { text: '● Active', cls: 'sh-ok' } }
      ];

      var listEl = document.getElementById('sys-health-list');
      if (!listEl) return;

      listEl.innerHTML = healthItems.map(function (item) {
        var pillHtml = item.pill
          ? '<div class="sh-pill ' + item.pill.cls + '">' + item.pill.text + '</div>' : '';
        return '<div class="sh-item">'
          + '<div class="sh-ic" style="background:' + item.bg + '">' + item.icon + '</div>'
          + '<div class="sh-body"><div class="sh-label">' + item.label + '</div><div class="sh-val">' + item.value + '</div></div>'
          + pillHtml + '</div>';
      }).join('');
    }

    // ─── CHART FILTER POPULATION ────────────────────────────────────────────────
    function populateChartFilters() {
      var depts = DB.get('depts');
      var students = DB.get('students');
      var subjects = DB.get('subjects');

      document.getElementById('f-dept').innerHTML = '<option value="">All</option>'
        + depts.map(function (d) { return '<option value="' + d._id + '">' + d.name + '</option>'; }).join('');

      var years = Array.from(new Set(students.map(function (s) { return s.academicYear; }).filter(Boolean))).sort().reverse();
      document.getElementById('f-year').innerHTML = '<option value="">All</option>'
        + years.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');

      document.getElementById('f-subj').innerHTML = '<option value="">All</option>'
        + subjects.map(function (s) { return '<option value="' + s._id + '">' + s.name + '</option>'; }).join('');

      setWeekRange('this');
    }
    var populateFilters = populateChartFilters; // alias

    // ─── DEPARTMENTS PAGE ────────────────────────────────────────────────────────
    function renderDepartments() {
      var depts = DB.get('depts') || [];
      var classes = DB.get('classes');
      var subjects = DB.get('subjects');
      var students = DB.get('students');
      var grid = document.getElementById('dg2');
      grid.className = 'tgrd';

      if (!grid) return;

      if (!depts.length) {
        grid.innerHTML = `
          <div class="empty-state">
            <span class="ei">🏛️</span>
            <p style="font-size: 13.5px;">No department found.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = depts.map(function (dept) {
        var classCount = classes.filter(function (c) { return c.deptId === dept._id; }).length;
        var subjectCount = subjects.filter(function (s) { return s.deptId === dept._id; }).length;
        var studentCount = students.filter(function (s) { return s.deptId === dept._id; }).length;
        var teacherCount = DB.get('users').filter(function (u) {
          return u.role === 'teacher' && (u.dept === dept.name || u.deptId === dept._id);
        }).length;

        return '<div class="tcrd">'
          + '<div class="tav" style="font-size:28px;background:linear-gradient(135deg,var(--gM),var(--gB));">' + (dept.icon || '🏛️') + '</div>'
          + '<div class="tnm">' + dept.name + '</div>'
          + '<div class="tdp">' + dept.code + '</div>'
          + '<div class="tsts">'
          + '<div class="tst2"><span>' + classCount + '</span>Classes</div>'
          + '<div class="tst2"><span>' + subjectCount + '</span>Subjects</div>'
          + '<div class="tst2"><span>' + studentCount + '</span>Students</div>'
          + '<div class="tst2"><span>' + teacherCount + '</span>Teachers</div>'
          + '</div>'
          + '<div style="display:flex;gap:6px;margin-top:12px;justify-content:center;flex-wrap:wrap;">'
          + '<button class="btn-pri bxs" onclick="nav(\'struct\');setTimeout(function(){dtoDept(\'' + dept._id + '\')},200)">📂 Explore</button>'
          + '<button class="btn bgho bxs" onclick="editDept(\'' + dept._id + '\')">✏️ Edit</button>'
          + '<button class="btn bdan bxs" onclick="dDept(\'' + dept._id + '\')">🗑 Del</button>'
          + '</div></div>';
      }).join('');
    }
    var rdepts = renderDepartments; // alias
    // Wrap dept mutations to auto-update badges
    var _origRenderDepts = renderDepartments;
    renderDepartments = function () { _origRenderDepts(); syncBadgesFromAPI(); };

    function editDept(deptId) {
      var dept = DB.get('depts').find(function (x) { return x._id === deptId; });
      if (!dept) return;
      document.getElementById('ed-id').value = deptId;
      document.getElementById('ed-nm').value = dept.name || '';
      document.getElementById('ed-cd').value = dept.code || '';
      document.getElementById('ed-num').value = dept.number || dept.deptNum || '';

      // Course Type + Branch
      var coEl = document.getElementById('ed-cotype');
      var brEl = document.getElementById('ed-branch');
      if (coEl) {
        coEl.value = dept.courseType || '';
        edUpdateBranch();                     // populate branch options first
        if (brEl) brEl.value = dept.branch || '';
      }

      // HoD fields — pre-fill without re-triggering lookup
      hodLookupReset('ed-');
      var hodIdEl = document.getElementById('ed-hod-id');
      var hodNmEl = document.getElementById('ed-hod-name');
      if (hodIdEl) hodIdEl.value = dept.hodTrackId || dept.hodId || '';
      if (hodNmEl) hodNmEl.value = dept.hodName || '';
      // If name already exists, show green tick
      if (hodNmEl && hodNmEl.value) hodLookupBadge('ok', 'ed-');

      openModal_('m-edit-dept');
    }

    function saveEditDept() {
      var id = document.getElementById('ed-id').value;
      var name = getFieldValue('ed-nm');
      var code = getFieldValue('ed-cd');
      var number = getFieldValue('ed-num');
      var courseType = document.getElementById('ed-cotype') ? document.getElementById('ed-cotype').value : 'UG';
      var branch = document.getElementById('ed-branch') ? document.getElementById('ed-branch').value : 'B.E';
      var hodId = getFieldValue('ed-hod-id') || null;
      var hodName = getFieldValue('ed-hod-name') || '';
      if (!name || !code) { showToast('Department name and code are required', 'warn'); return; }
      if (number && !/^\d{3}$/.test(number)) { showToast('Department Number must be exactly 3 digits', 'warn'); return; }
      if (!courseType || !branch) { showToast('Course Type and Branch are required', 'warn'); return; }
      if (hodId && !hodName) { showToast('Re-verify HoD TrackID — name not resolved', 'warn'); return; }
      dbToast('Updating department…', 'saving', '"' + name + '"');
      apiUpdateDept(id, name, code, number, courseType, branch, hodId, hodName).then(function (d) {
        if (!d) return;
        addLog('Department Updated', '"' + name + '" (' + code + ')');
        closeModalBg('m-edit-dept');
        renderDepartments();
        hodLookupReset('ed-');
        dbToast('Department updated', 'success', '"' + name + '" → Database');
      });
    }

    function addDept() {
      var name = getFieldValue('dept-name');
      var twoLetterCode = getFieldValue('dept-2code').toLowerCase();
      var code = getFieldValue('dept-code').toUpperCase();
      var number = getFieldValue('dept-number');
      var courseType = document.getElementById('co-type') ? document.getElementById('co-type').value : '';
      var branch = document.getElementById('branch') ? document.getElementById('branch').value : '';
      var hodId = getFieldValue('hod-id') || null;
      var hodName = getFieldValue('hod-name') || '';
      if (!name) { showToast('Department name is required', 'warn'); return; }
      if (!twoLetterCode) { showToast('2-Letter code required (e.g. cs)', 'warn'); return; }
      if (!code) { showToast('3-Letter code required (e.g. CSE)', 'warn'); return; }
      if (!number || !/^\d{3}$/.test(number)) { showToast('3-digit register number required', 'warn'); return; }
      if (!courseType || !branch) { showToast('Course Type and Branch required', 'warn'); return; }
      var okEl = document.getElementById('hod-ok');
      if (hodId && (!hodName || !okEl || okEl.style.display === 'none')) { showToast('HoD TrackID verification pending or failed', 'warn'); return; }
      dbToast('Adding department…', 'saving', '"' + name + '"');
      apiAddDept(name, code, number, twoLetterCode, courseType, branch, hodId, hodName).then(function (d) {
        if (!d) return;
        closeModalBg('m-add-dept');
        renderDepartments();
        populateAdminDropdowns();
        syncBadgesFromAPI();
        addLog('Department Added', '"' + name + '" (' + code + ') 2L=' + twoLetterCode + ' regCode=' + number);
        dbToast('Department added', 'success', '"' + name + '" → Database');
        resetDeptForm();
      });
    }

    function dDept(deptId) {
      var dept = DB.get('depts').find(function (x) { return x._id === deptId; });
      requireSpecialPw(function () { dDeptConfirmed(deptId, dept); });
    }
    function dDeptConfirmed(deptId, dept) {
      document.getElementById('dc-confirm-id').value = deptId;
      document.getElementById('dc-confirm-msg').textContent =
        'Delete department "' + (dept ? dept.name : '') + '"? All linked classes and subjects will be removed.';
      document.getElementById('dc-confirm-btn').onclick = function () {
        dbToast('Deleting...', 'saving');
        apiDeleteDept(deptId, dept ? dept.name : '').then(function () {
          addLog('Department Deleted', '"' + (dept ? dept.name : '') + '"');
          closeModalBg('m-dc-confirm');
          renderDepartments();
          syncBadgesFromAPI();
          dbToast('Deleted', 'success');
          window.location.reload();
        });
      };
      openModal_('m-dc-confirm');
    }

    // ─── STRUCTURE PAGE (CLASSES & SUBJECTS) ────────────────────────────────────
    var structureContext = { deptId: null, deptName: '', deptCode: '', sem: null };
    var currentClassId = null;
    var currentTeacherId = null;
    var _emptyStateFired = {};

    function resetStructureState() {
      structureContext = { deptId: null, deptName: '', deptCode: '', sem: null };
    }
    var rstruct = resetStructureState;

    function showStructureView(viewName) {
      ['dept', 'cs'].forEach(function (v) {
        var el = document.getElementById('sv-' + v);
        if (el) el.style.display = 'none';
      });
      var target = document.getElementById('sv-' + viewName);
      if (target) target.style.display = 'block';
      updateBreadcrumb();
    }
    var showSV = showStructureView;

    function updateBreadcrumb() {
      var breadcrumb = document.getElementById('sbc');
      var items = [{ label: 'Departments', fn: 'rstruct();rsdv();' }];
      if (structureContext.deptId) {
        items.push({ label: structureContext.deptName, fn: 'dtoDept(\'' + structureContext.deptId + '\')' });
      }
      breadcrumb.innerHTML = items.map(function (item, index) {
        if (index < items.length - 1) {
          return '<span class="bci" onclick="' + item.fn + '">' + item.label + '</span><span class="bcs">›</span>';
        }
        return '<span class="bcc">' + item.label + '</span>';
      }).join('');
    }
    var ubc = updateBreadcrumb;

    function renderDepartmentSelector() {
      var depts = DB.get('depts') || [];
      var classes = DB.get('classes') || [];
      var subjects = DB.get('subjects') || [];
      var grid = document.getElementById('sdg');

      if (!grid) return;

      grid.className = 'tgrd';

      if (!depts.length) {
        grid.innerHTML =
          '<div class="emst">' +
          '<span class="emico">🏛️</span>' +
          '<div class="emtx">No department found. Add one first.</div>' +
          '</div>';

        showStructureView('dept');
        return;
      }

      _emptyStateFired.deptSelector = false;

      grid.innerHTML = depts.map(function (dept) {
        var classCount = classes.filter(function (c) { return c.deptId === dept._id; }).length;
        var subjectCount = subjects.filter(function (s) { return s.deptId === dept._id; }).length;

        return '<div class="tcrd" onclick="dtoDept(\'' + dept._id + '\')">'
          + '<div class="tav" style="font-size:28px;background:linear-gradient(135deg,var(--gM),var(--gB));">' + (dept.icon || '🏛️') + '</div>'
          + '<div class="tnm">' + dept.name + '</div>'
          + '<div class="tdp">' + dept.code + '</div>'
          + '<div class="tsts">'
          + '<div class="tst2"><span>' + classCount + '</span>Classes</div>'
          + '<div class="tst2"><span>' + subjectCount + '</span>Subjects</div>'
          + '</div>'
          + '<div style="margin-top:12px;font-size:11px;color:var(--gM);font-weight:600;">Explore →</div>'
          + '</div>';
      }).join('');

      showStructureView('dept');
    }
    var rsdv = renderDepartmentSelector;

    function dtoDept(deptId) {
      var dept = DB.get('depts').find(function (d) { return d._id === deptId; });
      if (!dept) return;
      structureContext.deptId = deptId;
      structureContext.deptName = dept.name;
      structureContext.deptCode = dept.code;
      renderClassSubjectView(deptId);
      showStructureView('cs');
    }

    function renderClassSubjectView(deptId) {
      var allClasses = DB.get('classes').filter(function (c) { return !deptId || c.deptId === deptId; }) || [];
      var classGrid = document.getElementById('scg');

      if (classGrid) {
        classGrid.innerHTML = allClasses.length
          ? allClasses.map(function (cls) {
            var studentCount = cls.studentCount || 0;
            var assignmentCount = DB.get('assignments').filter(function (a) { return a.classId === cls._id; }).length;
            return '<div class="ec" onclick="openCD(\'' + cls._id + '\')">'
              + '<div class="ech"><div class="eci" style="background:var(--gLt)">🏫</div>'
              + '<div><div class="ecn">' + cls.name + '</div>'
              + '<div class="ecsu">Hall: ' + (cls.hallNo || '—') + ' · Sec ' + (cls.section || '—') + ' · ' + cls.deptName + '</div></div></div>'
              + '<div class="ecb"><div class="emt">' + studentCount + ' students · ' + assignmentCount + ' subjects</div></div>'
              + '</div>';
          }).join('')
          : '<div class="emst" style="grid-column:1/-1"><span class="emico">🏫</span><div class="emtx">No classes. Click "+ Add Class".</div></div>';
      }

      var allSubjects = DB.get('subjects').filter(function (s) { return !deptId || s.deptId === deptId; }) || [];
      var subjectGrid = document.getElementById('ssg2');

      if (subjectGrid) {
        subjectGrid.innerHTML = allSubjects.length
          ? allSubjects.map(function (subj) {
            var assignments = DB.get('assignments').filter(function (a) { return a.subjectId === subj._id; });
            var teacherNames = Array.from(new Set(assignments.map(function (a) { return a.teacherName; }).filter(Boolean)));
            var sectionCount = assignments.length;
            return '<div class="ec" onclick="openSubjAssignModal(\'' + subj._id + '\')" style="cursor:pointer;">'
              + '<div class="ech"><div class="eci" style="background:rgba(59,130,246,.1)">📚</div>'
              + '<div style="flex:1"><div class="ecn">' + subj.name + '</div>'
              + '<div class="ecsu">' + subj.code + ' · ' + subj.credits + ' credits · ' + subj.type + '</div></div>'
              + '<button class="btn-xs btn-out" onclick="event.stopPropagation();openSD(\'' + subj._id + '\')" title="Subject Details / Edit" style="flex-shrink:0;margin-left:6px;padding:4px 10px;font-size:11px;">ℹ Details</button>'
              + '</div>'
              + '<div class="ecb"><div class="emt">' + (sectionCount ? '📋 ' + sectionCount + ' section(s) assigned' : '➕ Click to assign sections') + '</div></div>'
              + '</div>';
          }).join('')
          : '<div class="emst" style="grid-column:1/-1"><span class="emico">📚</span><div class="emtx">No subjects. Click "+ Add Subject".</div></div>';
      }
    }
    var renderCSViewNosem = renderClassSubjectView;

    function switchStructureTab(tabName) {
      document.querySelectorAll('#sv-cs .tab').forEach(function (tab, index) {
        tab.classList.toggle('act', index === (tabName === 'classes' ? 0 : 1));
      });
      document.getElementById('sp-classes').style.display = tabName === 'classes' ? 'block' : 'none';
      document.getElementById('sp-subjects').style.display = tabName === 'subjects' ? 'block' : 'none';
    }
    var sst = switchStructureTab;

    function openCD(classId) {
      var cls = DB.get('classes').find(function (c) { return c._id === classId; });
      if (!cls) return;
      currentClassId = classId;

      document.getElementById('cd-ttl').textContent = cls.name + ' — ' + cls.deptName;
      document.getElementById('cd-sub').textContent = 'Year: ' + cls.year + ' | Sem: ' + cls.sem + ' | Section: ' + cls.section + ' | Hall: ' + (cls.hallNo || '—');

      var classAssignments = DB.get('assignments').filter(function (a) { return a.classId === classId; });

      document.getElementById('cd-stats').innerHTML =
        '<div style="background:var(--gP);border-radius:11px;padding:14px;text-align:center;">'
        + '<div style="font-size:24px;font-weight:800;color:var(--gK)">' + (cls.studentCount || '—') + '</div>'
        + '<div style="font-size:10px;color:var(--tdi);margin-top:3px;text-transform:uppercase;">Students</div></div>'
        + '<div style="background:var(--gP);border-radius:11px;padding:14px;text-align:center;">'
        + '<div style="font-size:24px;font-weight:800;color:var(--td)">' + classAssignments.length + '</div>'
        + '<div style="font-size:10px;color:var(--tdi);margin-top:3px;text-transform:uppercase;">Subjects</div></div>'
        + '<div style="background:var(--gP);border-radius:11px;padding:14px;text-align:center;">'
        + '<div style="font-size:24px;font-weight:800;color:var(--teal)">' + (cls.hallNo || '—') + '</div>'
        + '<div style="font-size:10px;color:var(--tdi);margin-top:3px;text-transform:uppercase;">Hall No.</div></div>';

      document.getElementById('cd-asgn').innerHTML = classAssignments.length
        ? classAssignments.map(function (a) {
          return '<div class="arow">'
            + '<div class="ainfo">'
            + '<div class="anm">📚 ' + a.subjectName + '</div>'
            + '<div class="acls">👩‍🏫 ' + (a.teacherName || 'Unassigned') + '</div>'
            + '</div>'
            + '<button class="btn bdan bxs" onclick="rmAsgn(\'' + a._id + '\',\'class\')">✖</button>'
            + '</div>';
        }).join('')
        : '<div style="text-align:center;padding:18px;color:var(--tdi);font-size:12px;">No subjects assigned. Click "+ Assign Subject".</div>';

      document.getElementById('cd-sc').textContent = cls.studentCount || '—';
      // Show loading state while fetching roster
      document.getElementById('cd-stus').innerHTML = '<div style="text-align:center;padding:14px;color:var(--tdi);font-size:12px;">⏳ Loading roster…</div>';

      document.getElementById('cd-del').onclick = function () {
        if (!confirm('Delete class "' + cls.name + '"?\nThis will also remove all subject assignments. This cannot be undone.')) return;
        dbToast('Deleting...', 'saving');
        apiDeleteClass(classId, cls.name).then(function () {
          addLog('Class Deleted', '"' + cls.name + '"');
          closeModalBg('m-cls-detail');
          renderClassSubjectView(structureContext.deptId);
          dbToast('Class deleted', 'success');
        });
      };

      openModal_('m-cls-detail');

      // Fetch lightweight roster from API (fires only when class is opened)
      var tok = getToken();
      if (!tok) return;
      fetch('/api/students?classId=' + encodeURIComponent(classId) + '&roster=1', { headers: { 'Authorization': 'Bearer ' + tok } })
        .then(function (r) { return r.json(); })
        .then(function (roster) {
          var list = Array.isArray(roster) ? roster : [];
          document.getElementById('cd-sc').textContent = list.length;
          document.getElementById('cd-stus').innerHTML = list.length
            ? '<div class="tw"><table class="tbl"><thead><tr><th>#</th><th>Name</th><th>Reg No.</th></tr></thead><tbody>'
            + list.map(function (s, i) {
              return '<tr><td>' + (i + 1) + '</td><td class="b">' + s.name + '</td><td>' + s.regNo + '</td></tr>';
            }).join('')
            + '</tbody></table></div>'
            : '<div style="text-align:center;padding:14px;color:var(--tdi);font-size:12px;">No students enrolled.</div>';
        })
        .catch(function () {
          document.getElementById('cd-stus').innerHTML = '<div style="text-align:center;padding:14px;color:var(--tdi);font-size:12px;">Failed to load roster.</div>';
        });
    }

    function editClsInline() {
      if (!currentClassId) return;
      var cls = DB.get('classes').find(function (c) { return c._id === currentClassId; });
      if (!cls) return;
      document.getElementById('ec-dept').value = cls.deptId || '';
      document.getElementById('ec-sec').value = cls.section || '';
      document.getElementById('ec-hall').value = cls.hallNo || '';
      document.getElementById('ec-yr').value = cls.year || '';
      document.getElementById('ec-sem').value = cls.sem || '';
      document.getElementById('ec-batch').value = cls.batch || '';
      ecAutoName();
      // Auto-generate name display (read-only)
      var dept = DB.get('depts').find(function (d) { return d._id === cls.deptId; });
      document.getElementById('ec-nm').value = cls.name || (dept ? cls.batch + '-' + dept.code + '-' + cls.section : '');
      closeModalBg('m-cls-detail');
      openModal_('m-edit-cls');
    }

    function ecAutoName() {
      var cls = DB.get('classes').find(function (c) { return c._id === currentClassId; });
      if (!cls) return;
      var dept = DB.get('depts').find(function (d) { return d._id === cls.deptId; });
      var section = document.getElementById('ec-sec').value.trim() || cls.section;
      if (dept && cls.batch && section)
        document.getElementById('ec-nm').value = cls.batch + '-' + dept.code + '-' + section;
    }

    function saveEditCls() {
      if (!currentClassId) return;
      var cls = DB.get('classes').find(function (c) { return c._id === currentClassId; });
      var deptName = getFieldValue('ec-dept') || '';
      var section = getFieldValue('ec-sec') || '';
      var hallNo = getFieldValue('ec-hall');
      var year = getFieldValue('ec-yr');
      var sem = getFieldValue('ec-sem');
      var batch = getFieldValue('ec-batch');
      var dept = DB.get('depts').find(function (d) { return d && cls && d._id === cls.deptId; });
      var name = dept ? (batch + '-' + dept.code + '-' + section) : getFieldValue('ec-nm');
      dbToast('Saving changes...', 'saving');
      apiUpdateClass(currentClassId, { section: section, hallNo: hallNo, name: name, year: year, sem: sem, batch: batch, deptName: deptName }).then(function (d) {
        if (!d) return;
        addLog('Class Updated', '"' + name + '"');
        closeModalBg('m-edit-cls');
        openCD(currentClassId);
        if (structureContext.deptId) renderClassSubjectView(structureContext.deptId);
        dbToast('Class updated', 'success');
      });
    }

    function oasc() {
      var cls = DB.get('classes').find(function (c) { return c._id === currentClassId; });
      if (!cls) return;
      document.getElementById('as-cls').value = cls.name;
      var deptSubjects = DB.get('subjects').filter(function (s) { return s.deptId === cls.deptId; });
      document.getElementById('as-subj').innerHTML = deptSubjects.map(function (s) {
        return '<option value="' + s._id + '">' + s.name + ' (' + s.code + ')</option>';
      }).join('') || '<option>No subjects</option>';
      var allTeachers = DB.get('users').filter(function (u) { return u.role === 'teacher'; });
      document.getElementById('as-tch').innerHTML = allTeachers.map(function (t) {
        return '<option value="' + t._id + '">' + t.name + '</option>';
      }).join('') || '<option value="">No teachers</option>';
      openModal_('m-asgn-subj');
    }

    function saveAsgn() {
      var cls = DB.get('classes').find(function (c) { return c._id === currentClassId; });
      var subjId = document.getElementById('as-subj').value;
      var subjEl = document.getElementById('as-subj');
      var subjName = subjEl.selectedOptions[0] ? subjEl.selectedOptions[0].text : '';
      var tchId = document.getElementById('as-tch').value;
      var tchEl = document.getElementById('as-tch');
      var tchName = tchEl.selectedOptions[0] ? tchEl.selectedOptions[0].text : '';
      if (!subjId) { showToast('Select a subject', 'warn'); return; }
      if (!tchId) { showToast('Select a teacher', 'warn'); return; }
      if (DB.one('assignments', { classId: currentClassId, subjectId: subjId })) { showToast('Already assigned', 'warn'); return; }
      dbToast('Saving...', 'saving');
      apiCall('POST', '/assignments', {
        classId: currentClassId, className: cls.name,
        subjectId: subjId, subjectName: subjName.split(' (')[0],
        teacherId: tchId, teacherName: tchName,
        deptName: cls.deptName, deptCode: cls.deptCode
      }).then(function (d) {
        if (!d || d.error) { dbToast('DB Error: ' + (d && d.error ? d.error : 'Unknown'), 'error'); return; }
        return apiCall('GET', '/assignments').then(function (all) {
          if (Array.isArray(all)) DB.set('assignments', all);
          closeModalBg('m-asgn-subj');
          openCD(currentClassId);
          addLog('Subject Assigned', '"' + subjName + '" → ' + cls.name);
          dbToast('Assignment saved', 'success');
        });
      }).catch(function () {
        dbToast('Network error saving assignment', 'error');
      });
    }

    function rmAsgn(assignmentId, fromView) {
      dbToast('Removing...', 'saving');
      apiCall('DELETE', '/assignments/' + assignmentId).then(function () {
        return apiCall('GET', '/assignments').then(function (all) {
          if (Array.isArray(all)) DB.set('assignments', all);
          addLog('Assignment Removed', '');
          if (fromView === 'class') openCD(currentClassId);
          else openTD(currentTeacherId);
          dbToast('Removed', 'success');
        });
      }).catch(function () {
        dbToast('Network error removing assignment', 'error');
      });
    }

    function openSD(subjectId) {
      currentSubjectId = subjectId;
      var subj = DB.get('subjects').find(function (s) { return s._id === subjectId; });
      if (!subj) return;
      document.getElementById('sd-ttl').textContent = subj.name;
      document.getElementById('sd-sub').textContent = subj.code + ' · ' + subj.credits + ' Credits · ' + subj.type + ' · ' + subj.deptName;

      var assignments = DB.get('assignments').filter(function (a) { return a.subjectId === subjectId; });
      document.getElementById('sd-stats').innerHTML =
        '<div style="background:var(--gP);border-radius:11px;padding:14px;text-align:center;">'
        + '<div style="font-size:24px;font-weight:800;color:var(--gK)">' + subj.credits + '</div>'
        + '<div style="font-size:10px;color:var(--tdi);margin-top:3px;text-transform:uppercase;">Credits</div></div>'
        + '<div style="background:var(--gP);border-radius:11px;padding:14px;text-align:center;">'
        + '<div style="font-size:24px;font-weight:800;color:var(--td)">' + assignments.length + '</div>'
        + '<div style="font-size:10px;color:var(--tdi);margin-top:3px;text-transform:uppercase;">Classes</div></div>'
        + '<div style="background:rgba(59,130,246,.08);border-radius:11px;padding:14px;text-align:center;">'
        + '<div style="font-size:14px;font-weight:700;color:#2563eb">' + subj.type + '</div>'
        + '<div style="font-size:10px;color:var(--tdi);margin-top:3px;text-transform:uppercase;">Type</div></div>';

      document.getElementById('sd-asgn').innerHTML = assignments.length
        ? assignments.map(function (a) {
          return '<div class="arow"><div class="ainfo">'
            + '<div class="anm">🏫 ' + a.className + '</div>'
            + '<div class="acls">👩‍🏫 ' + (a.teacherName || 'Unassigned') + '</div>'
            + '</div></div>';
        }).join('')
        : '<div style="text-align:center;padding:14px;color:var(--tdi);font-size:12px;">Not assigned to any class.</div>';

      document.getElementById('sd-del').onclick = function () {
        if (!confirm('Delete subject "' + subj.name + '"? This cannot be undone.')) return;
        dbToast('Deleting...', 'saving');
        apiDeleteSubject(subjectId, subj.name).then(function () {
          addLog('Subject Deleted', '"' + subj.name + '"');
          closeModalBg('m-subj-detail');
          renderClassSubjectView(structureContext.deptId);
          dbToast('Subject deleted from DB, check Undo Menu for undo', 'success');
        });
      };
      openModal_('m-subj-detail');
    }

    var currentSubjectId = null;
    function editSubjInline() {
      if (!currentSubjectId) return;
      var subj = DB.get('subjects').find(function (s) { return s._id === currentSubjectId; });
      if (!subj) return;
      document.getElementById('es-nm').value = subj.name || '';
      document.getElementById('es-cd').value = subj.code || '';
      document.getElementById('es-cr').value = subj.credits || 3;
      document.getElementById('es-tp').value = subj.type || 'Theory';
      closeModalBg('m-subj-detail');
      openModal_('m-edit-subj');
    }

    function saveEditSubj() {
      if (!currentSubjectId) return;
      var name = getFieldValue('es-nm');
      var code = getFieldValue('es-cd');
      var credits = parseInt(getFieldValue('es-cr')) || 3;
      var type = getFieldValue('es-tp') || 'Theory';
      if (!name || !code) { showToast('Name and code required', 'warn'); return; }
      apiUpdateSubject(currentSubjectId, { name: name, code: code, credits: credits, type: type }).then(function (d) {
        if (!d) return;
        addLog('Subject Updated', '"' + name + '"');
        closeModalBg('m-edit-subj');
        if (structureContext.deptId) renderClassSubjectView(structureContext.deptId);
        showToast('Subject "' + name + '" updated');
      });
    }

    function ncAutoName() {
      var deptId = getFieldValue('nc-dept');
      var batch = getFieldValue('nc-batch');
      var sem = getFieldValue('nc-sem');
      var section = (document.getElementById('nc-sec').value || '').trim();
      var dept = DB.get('depts').find(function (d) { return d._id === deptId; });
      var nameEl = document.getElementById('nc-name');
      var warnEl = document.getElementById('nc-warn');
      var addBtn = document.getElementById('nc-add-btn');
      if (dept && batch && section) {
        var batchV = batch.slice(2, 4) + '-' + batch.slice(5, 7);
        var autoName = batchV + ' ' + dept.code + '-' + section;
        nameEl.value = autoName;
        // Check duplicate
        var dup = DB.get('classes').find(function (cls) {
          return cls.deptId === deptId && cls.batch === batch && cls.section === section;
        });
        if (dup) {
          warnEl.textContent = '⚠️ Class "' + autoName + '" already exists for this department/batch/section.';
          warnEl.style.display = 'block';
          addBtn.disabled = true;
          addBtn.style.opacity = '.5';
          addBtn.style.cursor = 'not-allowed';
        } else {
          warnEl.style.display = 'none';
          addBtn.disabled = false;
          addBtn.style.opacity = '1';
          addBtn.style.cursor = 'pointer';
        }
      } else {
        nameEl.value = '';
        warnEl.style.display = 'none';
        addBtn.disabled = true;
        addBtn.style.opacity = '.5';
      }
    }
    function openAddClassModal() {
      // Ensure dropdowns are populated with latest DB data
      populateAdminDropdowns();

      // Reset fields
      document.getElementById('nc-sec').value = '';
      document.getElementById('nc-hall').value = '';
      document.getElementById('nc-name').value = '';
      var warnEl = document.getElementById('nc-warn');
      if (warnEl) warnEl.style.display = 'none';
      var addBtn = document.getElementById('nc-add-btn');
      if (addBtn) { addBtn.disabled = true; addBtn.style.opacity = '.5'; addBtn.style.cursor = 'not-allowed'; }

      // Auto-select current dept from structure context
      if (structureContext && structureContext.deptId) {
        var deptSel = document.getElementById('nc-dept');
        if (deptSel) {
          deptSel.value = structureContext.deptId;
          ncAutoName(); // trigger name generation
        }
      }

      openModal_('m-add-class-quick');
    }

    function ncValidate() { ncAutoName(); }
    function ncdc() { ncAutoName(); }

    function addCls() {
      var deptId = getFieldValue('nc-dept');
      var year = getFieldValue('nc-yr');
      var sem = getFieldValue('nc-sem');
      var batch = getFieldValue('nc-batch');
      var section = (document.getElementById('nc-sec').value || '').trim() || '';
      var hallNo = getFieldValue('nc-hall');
      if (!deptId) { showToast('Select a department', 'warn'); return; }
      if (!batch) { showToast('Select a batch', 'warn'); return; }
      if (!section) { showToast('Enter a section', 'warn'); return; }
      if (!hallNo) { showToast('Enter a hall number', 'warn'); return; }
      var dept = DB.get('depts').find(function (d) { return d._id === deptId; });
      var className = getFieldValue('nc-name');
      // Final duplicate check
      if (DB.get('classes').find(function (cls) { return cls.name.toLowerCase() === className.toLowerCase(); })) {
        showToast('Class "' + className + '" already exists!', 'warn'); return;
      }
      apiAddClass({ deptId: deptId, deptName: dept.name, deptCode: dept.code, year: year, sem: sem, section: section, hallNo: hallNo, name: className, batch: batch })
        .then(function (d) {
          if (!d) return;
          closeModalBg('m-add-class-quick');
          document.getElementById('nc-sec').value = '';
          document.getElementById('nc-hall').value = '';
          document.getElementById('nc-name').value = '';
          document.getElementById('nc-warn').style.display = 'none';
          document.getElementById('nc-add-btn').disabled = true;
          document.getElementById('nc-add-btn').style.opacity = '.5';
          if (structureContext.deptId === deptId) renderClassSubjectView(deptId);
          addLog('Class Added', '"' + className + '"');
          dbToast('Class "' + className + '" added to DB', 'success');
        });
    }

    function openAddSubj() {
      if (!structureContext.deptId) {
        showToast('Please explore a department first before adding a subject.', 'warn');
        return;
      }

      // Auto-select current dept from structure context
      var deptSel = document.getElementById('ns-dept');
      if (deptSel) deptSel.value = structureContext.deptId;

      // Show active dept in modal title
      var titleEl = document.querySelector('#m-add-subj-ctx .modal-title');
      if (titleEl) titleEl.textContent = '📚 Add Subject';

      // Clear previous input values
      ['ns-nm', 'ns-ssc', 'ns-cd', 'ns-sc'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
      var crEl = document.getElementById('ns-cr');
      if (crEl) crEl.value = '3';
      openModal_('m-add-subj-ctx');
    }

    function nsScAuto() {
      var deptId = getFieldValue('ns-dept');
      var shortCode = getFieldValue('ns-ssc');
      var code = getFieldValue('ns-cd');
      var type = getFieldValue('ns-tp')[0].toUpperCase();
      if (deptId && code && type) {
        var dept = DB.get('depts').find(function (d) { return d._id === deptId; });
        var subjectCode = code + '-' + shortCode;
        document.getElementById('ns-sc').value = subjectCode;
      } else {
        document.getElementById('ns-sc').value = '';
        showToast('Please select a department, code and type', 'warn'); return;
      }

      var dup = DB.get('subjects').find(function (sub) {
        return sub.subjectCode === subjectCode;
      });

      if (dup) {
        showToast('Subject code already exists', 'warn');
        document.getElementById('es-save-btn').disabled = true;
        document.getElementById('es-save-btn').style.opacity = '0.5';
      } else {
        document.getElementById('es-save-btn').disabled = false;
        document.getElementById('es-save-btn').style.opacity = '1';
      }
    }

    // ── Auto Subject Code (Edit) ──────────────────────────────────────────────
    function esScAuto() {
      var deptCode = getFieldValue('es-dc');
      var shortCode = getFieldValue('es-ssc');
      var code = getFieldValue('es-cd');
      var type = getFieldValue('es-tp')[0].toUpperCase();
      var editedSubjId = window.activeEditSubjId || '';

      if (deptCode && code && type) {
        var subjectCode = code + '-' + shortCode;
        document.getElementById('es-sc').value = subjectCode;
      } else {
        document.getElementById('es-sc').value = '';
        showToast('Please select a department, code and type', 'warn');
        return;
      }

      // Check for duplicates (ignore the currently editing subject)
      var dup = DB.get('subjects').find(function (sub) {
        return sub._id !== editedSubjId && sub.subjectCode === subjectCode;
      });

      if (dup) {
        showToast('Subject code already exists', 'warn');
        document.getElementById('es-save-btn').disabled = true;
        document.getElementById('es-save-btn').style.opacity = '0.5';
      } else {
        document.getElementById('es-save-btn').disabled = false;
        document.getElementById('es-save-btn').style.opacity = '1';
      }
    }

    function addSubCtx() {
      var name = getFieldValue('ns-nm');
      var code = getFieldValue('ns-cd');
      var credits = parseInt(getFieldValue('ns-cr')) || 3;
      var type = getFieldValue('ns-tp') || 'Theory';
      var shortCode = getFieldValue('ns-ssc');
      var subjectName = shortCode + '-' + type + ' ' + code;
      var subjectCode = getFieldValue('ns-sc');
      if (!name || !code) { showToast('Name and code required', 'warn'); return; }
      if (!structureContext.deptId) { showToast('Please select a department first by exploring structure', 'warn'); return; }
      var dept = DB.get('depts').find(function (d) { return d._id === structureContext.deptId; });
      if (DB.get('subjects').find(function (s) { return s.subjectCode === subjectCode; })) { showToast('Subject code already exists', 'warn'); return; }
      apiAddSubject({ name: name, code: code, credits: credits, type: type, deptId: structureContext.deptId, deptName: dept.name, deptCode: dept.code, subjectCode: subjectCode })
        .then(function (newSubject) {
          if (!newSubject || newSubject.error) return;

          closeModalBg('m-add-subj-ctx');
          renderClassSubjectView(structureContext.deptId);
          addLog('Subject Added', '"' + name + '" (' + code + ')');
          dbToast('Subject "' + name + '" added', 'success');
          clearInputs(['ns-nm', 'ns-cd']);
        });
    }

    // ─── SUBJECT STAFF & HALL ASSIGNMENT MODAL ────────────────────────────────────
    var _saSubjectId = null;

    // ─── SUBJECT STAFF & HALL ASSIGNMENT MODAL ────────────────────────────────────
    var _saSubjectId = null;

    function openSubjAssignModal(subjectId) {
      _saSubjectId = subjectId;

      // Read subject info from cache (subjects are always synced on login)
      var subj = DB.get('subjects').find(function (s) { return s._id === subjectId; });
      if (!subj) { dbToast('Subject not found in DB', 'warn'); return; }

      // Set header
      document.getElementById('sa-ttl').textContent = '\u{1F4CC} ' + subj.name + ' — Assign Staff & Hall';
      document.getElementById('sa-sub').textContent = subj.code + ' · ' + subj.credits + ' Credits · ' + subj.type + (subj.deptName ? ' · ' + subj.deptName : '');
      document.getElementById('sa-warn').style.display = 'none';

      // Show modal immediately with loading state
      var tbody = document.getElementById('sa-rows');
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;color:var(--tmu);font-size:13px;">\u23f3 Loading from database…</td></tr>';
      openModal_('m-subj-assign');

      // ✅ Fetch existing assignments DIRECTLY from Database - MongoDB
      apiCall('GET', '/assignments?subjectId=' + encodeURIComponent(subjectId))
        .then(function (existing) {
          tbody.innerHTML = '';
          if (Array.isArray(existing) && existing.length > 0) {
            existing.forEach(function (a) { addAssignRow(a.classId, a.teacherId, a.hallNo); });
          } else {
            addAssignRow(); // one default empty row
          }
        })
        .catch(function () {
          tbody.innerHTML = '';
          addAssignRow();
          showToast('Could not load existing assignments from DB, reloading', 'warn');
          setTimeout(function () { window.location.reload(); }, 1000);
        });
    }

    function _buildSaClassOptions(selectedId) {
      var classes = DB.get('classes');
      return '<option value="">\u2014 Select Section \u2014</option>'
        + classes.map(function (c) {
          var hall = c.hallNo || '';
          return '<option value="' + c._id + '" data-hall="' + hall + '" data-dept="' + (c.deptId || '') + '"'
            + (c._id === selectedId ? ' selected' : '') + '>' + c.name + '</option>';
        }).join('');
    }

    function _buildSaTeacherOptions(selectedId, deptId) {
      var teachers = DB.get('users').filter(function (u) {
        if (u.role !== 'teacher') return false;
        if (deptId && u.deptId !== deptId) return false;
        return true;
      });
      return '<option value="">\u2014 Select Staff \u2014</option>'
        + teachers.map(function (t) {
          return '<option value="' + t._id + '"' + (t._id === selectedId ? ' selected' : '') + '>' + t.name + '</option>';
        }).join('');
    }

    function addAssignRow(classId, teacherId, hallNo) {
      var tbody = document.getElementById('sa-rows');
      var tr = document.createElement('tr');
      tr.className = 'sa-row';
      tr.style.borderBottom = '1px solid var(--brl)';
      var deptId = '';
      if (classId) {
        var cls = DB.get('classes').find(function (c) { return c._id === classId; });
        if (cls) deptId = cls.deptId;
      }
      tr.innerHTML =
        '<td style="padding:8px 10px;">'
        + '<select class="fc2 sa-cls" onchange="onSaClassChange(this)" style="font-size:13px;padding:8px 10px;min-width:150px;">'
        + _buildSaClassOptions(classId || '')
        + '</select></td>'
        + '<td style="padding:8px 10px;">'
        + '<select class="fc2 sa-tch" style="font-size:13px;padding:8px 10px;min-width:160px;">'
        + _buildSaTeacherOptions(teacherId || '', deptId)
        + '</select></td>'
        + '<td style="padding:8px 10px;">'
        + '<input type="text" class="fc2 sa-hall" placeholder="e.g. H101" maxlength="20"'
        + ' style="font-size:13px;padding:8px 10px;min-width:90px;" value="' + (hallNo || '') + '">'
        + '</td>'
        + '<td style="padding:8px 10px;text-align:center;">'
        + '<button onclick="removeAssignRow(this)" style="background:var(--red);color:#fff;border:none;border-radius:8px;'
        + 'width:28px;height:28px;cursor:pointer;font-size:15px;line-height:1;display:inline-flex;align-items:center;'
        + 'justify-content:center;" title="Remove row">✕</button>'
        + '</td>';
      tbody.appendChild(tr);
      // Auto-fill hall from class default when no hallNo supplied
      if (!hallNo && classId) {
        if (cls && cls.hallNo) tr.querySelector('.sa-hall').value = cls.hallNo;
      }
    }

    function onSaClassChange(sel) {
      var tr = sel.closest ? sel.closest('tr') : sel.parentNode.parentNode;
      if (!tr) return;
      var opt = sel.options[sel.selectedIndex];
      var hall = opt ? (opt.getAttribute('data-hall') || '') : '';
      tr.querySelector('.sa-hall').value = hall;
      // Scope teacher dropdown to selected class's department
      var deptId = opt ? (opt.getAttribute('data-dept') || '') : '';
      var tchSel = tr.querySelector('.sa-tch');
      if (tchSel) {
        tchSel.innerHTML = _buildSaTeacherOptions('', deptId);
      }
    }

    function removeAssignRow(btn) {
      var tr = btn.closest ? btn.closest('tr') : btn.parentNode.parentNode;
      var tbody = document.getElementById('sa-rows');
      if (tbody.querySelectorAll('tr.sa-row').length <= 1) {
        showToast('At least one row is required', 'warn'); return;
      }
      tbody.removeChild(tr);
    }

    function saveSubjAssignments() {
      var warnEl = document.getElementById('sa-warn');
      warnEl.style.display = 'none';
      var rows = document.querySelectorAll('#sa-rows tr.sa-row');
      if (!rows.length) { showToast('Add at least one row', 'warn'); return; }
      var assignments = [];
      var seenClasses = {};
      var errorMsg = '';
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var classId = row.querySelector('.sa-cls').value;
        var teacherId = row.querySelector('.sa-tch').value;
        var hallNo = row.querySelector('.sa-hall').value.trim();
        if (!classId || !teacherId || !hallNo) {
          errorMsg = 'Row ' + (i + 1) + ': All fields (Section, Staff, Hall No.) are required.';
          break;
        }
        if (seenClasses[classId]) {
          var clsName = row.querySelector('.sa-cls').options[row.querySelector('.sa-cls').selectedIndex].text;
          errorMsg = 'Duplicate section "' + clsName + '" in row ' + (i + 1) + '.';
          break;
        }
        seenClasses[classId] = true;
        assignments.push({ classId: classId, teacherId: teacherId, hallNo: hallNo });
      }
      if (errorMsg) {
        warnEl.textContent = '\u26a0 ' + errorMsg;
        warnEl.style.display = 'block';
        return;
      }
      apiBulkSaveAssignments(_saSubjectId, assignments);
    }

    function apiBulkSaveAssignments(subjectId, assignments) {
      var subj = DB.get('subjects').find(function (s) { return s._id === subjectId; });
      var classes = DB.get('classes');
      var users = DB.get('users');
      if (!subj) { dbToast('Subject not found in Database', 'error'); return; }

      // Enrich rows with display names before sending to server
      var enriched = [];
      var rowErr = '';
      for (var i = 0; i < assignments.length; i++) {
        var row = assignments[i];
        var cls = classes.find(function (c) { return c._id === row.classId; });
        var teacher = users.find(function (u) { return u._id === row.teacherId; });
        if (!cls || !teacher) { rowErr = 'Row ' + (i + 1) + ': invalid class or teacher'; break; }
        enriched.push({
          subjectId: subjectId,
          subjectName: subj.name,
          classId: row.classId,
          className: cls.name,
          teacherId: row.teacherId,
          teacherName: teacher.name,
          hallNo: row.hallNo,
          deptName: cls.deptName || subj.deptName || '',
          deptCode: cls.deptCode || subj.deptCode || ''
        });
      }
      if (rowErr) { showToast(rowErr, 'warn'); return; }

      dbToast('Saving to Database…', 'saving', enriched.length + ' section(s)');

      apiCall('POST', '/assignments/bulk', { subjectId: subjectId, assignments: enriched })
        .then(function (d) {
          if (!d || d.error) {
            dbToast('DB Error: ' + (d && d.error ? d.error : 'Unknown'), 'error');
            return;
          }

          dbToast('Saved to Database', 'success', d.count + ' section(s) written to DB');
          closeModalBg('m-subj-assign');
          addLog('Assignments Bulk Saved', d.count + ' sections → ' + subj.name);


          apiCall('GET', '/assignments')
            .then(function (allAssignments) {
              if (Array.isArray(allAssignments)) {
                // Update ONLY the in-memory assignments cache — not a localStorage write
                DB.set('assignments', allAssignments);
              }
              if (structureContext && structureContext.deptId) renderClassSubjectView(structureContext.deptId);
            })
            .catch(function () {
              if (structureContext && structureContext.deptId) renderClassSubjectView(structureContext.deptId);
            });
        })
        .catch(function (err) {
          console.error('Bulk save error:', err);
          dbToast('Network error, reloading', 'error');
          setTimeout(function () { window.location.reload(); }, 1000);
        });
    }


    // ─── STUDENTS PAGE — GLOBAL STATE ─────────────────────────────────────────
    var _studentPage = 1;
    var _studentData = [];
    var _studentTotal = 0;
    var _studentSortBy = 'regNo';
    var _studentSortDir = 'asc';
    var _studentFilterSnapshot = {};

    // ─── STUDENTS PAGE — NEW FUNCTIONS ──────────────────────────────────────
    function populateStudentFilterDropdowns() {
      var yearEl = document.getElementById('sf-ay');
      var batchEl = document.getElementById('sf-batch');
      var deptEl = document.getElementById('sf-dept');
      var clsEl = document.getElementById('sf-cls');
      var secEl = document.getElementById('sf-sec');
      if (yearEl) { yearEl.innerHTML = '<option value="">⏳ Loading…</option>'; }
      if (batchEl) { batchEl.innerHTML = '<option value="">⏳ Loading…</option>'; }
      if (clsEl) { clsEl.innerHTML = '<option value="">All Classes</option>'; clsEl.value = ''; }
      if (secEl) { secEl.innerHTML = '<option value="">All</option>'; secEl.value = ''; }
      if (deptEl) {
        var depts = Array.isArray(DB.get('depts')) ? DB.get('depts') : [];
        deptEl.innerHTML = '<option value="">All Departments</option>'
          + depts.map(function (d) { return '<option value="' + d._id + '">' + d.name + '</option>'; }).join('');
        deptEl.value = '';
      }
      var tok = getToken();
      if (!tok) return;
      Promise.all([
        fetch('/api/year/current', { headers: { 'Authorization': 'Bearer ' + tok } }).then(function (r) { return r.json(); }),
        fetch('/api/year/batches', { headers: { 'Authorization': 'Bearer ' + tok } }).then(function (r) { return r.json(); })
      ]).then(function (results) {
        var currentYear = (typeof results[0] === 'string' && results[0]) ? results[0] : (YEAR_CONFIG.current || '');
        var batchList = Array.isArray(results[1]) ? results[1] : (Array.isArray(YEAR_CONFIG.batches) ? YEAR_CONFIG.batches : []);
        if (yearEl) {
          yearEl.innerHTML = '<option value="">All Years</option>'
            + (currentYear ? '<option value="' + currentYear + '">' + currentYear + '</option>' : '');
          yearEl.value = '';
        }
        if (batchEl) {
          batchEl.innerHTML = '<option value="">All Batches</option>'
            + batchList.map(function (b) { return '<option value="' + b + '">' + b + '</option>'; }).join('');
        }
        YEAR_CONFIG.current = currentYear;
        YEAR_CONFIG.batches = batchList;
      }).catch(function () {
        if (yearEl) {
          yearEl.innerHTML = '<option value="">All Years</option>'
            + (YEAR_CONFIG.current ? '<option value="' + YEAR_CONFIG.current + '">' + YEAR_CONFIG.current + '</option>' : '');
          yearEl.value = '';
        }
        if (batchEl) {
          var batchOpts = Array.isArray(YEAR_CONFIG.batches) ? YEAR_CONFIG.batches : [];
          batchEl.innerHTML = '<option value="">All Batches</option>'
            + batchOpts.map(function (b) { return '<option value="' + b + '">' + b + '</option>'; }).join('');
        }
      });
      updateShowListEnabled();
    }

    function _resetClassDropdown() {
      var clsEl = document.getElementById('sf-cls');
      var secEl = document.getElementById('sf-sec');
      if (clsEl) { clsEl.innerHTML = '<option value="">All Classes</option>'; clsEl.value = ''; }
      if (secEl) { secEl.innerHTML = '<option value="">All</option>'; secEl.value = ''; }
    }

    function _fetchClasses() {
      var deptId = document.getElementById('sf-dept') ? document.getElementById('sf-dept').value : '';
      var batch = document.getElementById('sf-batch') ? document.getElementById('sf-batch').value : '';
      var clsEl = document.getElementById('sf-cls');
      var secEl = document.getElementById('sf-sec');
      if (!deptId || !clsEl) { _resetClassDropdown(); return; }
      if (secEl) { secEl.innerHTML = '<option value="">All</option>'; secEl.value = ''; }
      clsEl.innerHTML = '<option value="">Loading…</option>';
      var tok = getToken();
      if (!tok) return;
      var url = '/api/classes?deptId=' + encodeURIComponent(deptId);
      if (batch) url += '&batch=' + encodeURIComponent(batch);
      fetch(url, { headers: { 'Authorization': 'Bearer ' + tok } })
        .then(function (r) { return r.json(); })
        .then(function (classes) {
          if (!Array.isArray(classes)) return;
          window.__filteredClasses = classes;
          clsEl.innerHTML = '<option value="">All Classes</option>'
            + classes.map(function (c) { return '<option value="' + c._id + '" data-name="' + c.name.replace(/"/g, '&quot;') + '">' + c.name + '</option>'; }).join('');
          clsEl.value = '';
        })
        .catch(function () { clsEl.innerHTML = '<option value="">All Classes</option>'; });
    }

    function onStudentYearChange() {
      var batchEl = document.getElementById('sf-batch');
      var ctEl = document.getElementById('sf-ct');
      var deptEl = document.getElementById('sf-dept');
      if (batchEl) { batchEl.value = ''; }
      if (ctEl) { ctEl.value = ''; }
      if (deptEl) { deptEl.value = ''; }
      _resetClassDropdown();
    }

    function onStudentBatchChange() {
      var ctEl = document.getElementById('sf-ct');
      var deptEl = document.getElementById('sf-dept');
      if (ctEl) { ctEl.value = ''; }
      if (deptEl) { deptEl.value = ''; }
      _resetClassDropdown();
    }

    function onStudentCourseTypeChange() {
      var deptEl = document.getElementById('sf-dept');
      if (deptEl) { deptEl.value = ''; }
      _resetClassDropdown();
    }

    function onStudentDeptChange() {
      _resetClassDropdown();
      var deptId = document.getElementById('sf-dept') ? document.getElementById('sf-dept').value : '';
      if (deptId) {
        _fetchClasses();
      }
    }

    function onStudentClassChange() {
      var clsEl = document.getElementById('sf-cls');
      var secEl = document.getElementById('sf-sec');
      if (!secEl) return;
      var classes = window.__filteredClasses || [];
      var selectedId = clsEl ? clsEl.value : '';
      if (!selectedId) {
        secEl.innerHTML = '<option value="">All</option>';
        return;
      }
      var selectedOpt = clsEl.querySelector('option[value="' + selectedId + '"]');
      var selectedName = selectedOpt ? selectedOpt.getAttribute('data-name') : '';
      var sections = classes
        .filter(function (c) { return c.name === selectedName && c.section; })
        .map(function (c) { return c.section; });
      var unique = [];
      sections.forEach(function (s) { if (unique.indexOf(s) === -1) unique.push(s); });
      unique.sort();
      secEl.innerHTML = '<option value="">All</option>'
        + unique.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
    }

    function onStudentSectionChange() {
    }

    function updateShowListEnabled() {
      var btn = document.getElementById('btn-show-list');
      if (!btn) return;
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }

    function _buildStudentQueryString(page) {
      var ay = document.getElementById('sf-ay') ? document.getElementById('sf-ay').value : '';
      var batch = document.getElementById('sf-batch') ? document.getElementById('sf-batch').value : '';
      var ct = document.getElementById('sf-ct') ? document.getElementById('sf-ct').value : '';
      var dept = document.getElementById('sf-dept') ? document.getElementById('sf-dept').value : '';
      var cls = document.getElementById('sf-cls') ? document.getElementById('sf-cls').value : '';
      var section = document.getElementById('sf-sec') ? document.getElementById('sf-sec').value : '';
      _studentFilterSnapshot = { ay: ay, batch: batch, ct: ct, dept: dept, cls: cls, section: section };
      var params = '?page=' + (page || 1) + '&limit=65&sortBy=' + encodeURIComponent(_studentSortBy) + '&sortDir=' + _studentSortDir;
      if (ay) params += '&academicYear=' + encodeURIComponent(ay);
      if (batch) params += '&batch=' + encodeURIComponent(batch);
      if (ct) params += '&courseType=' + encodeURIComponent(ct);
      if (dept) params += '&deptId=' + encodeURIComponent(dept);
      if (cls) params += '&classId=' + encodeURIComponent(cls);
      if (section) params += '&section=' + encodeURIComponent(section);
      return params;
    }

    function _renderStudentTable(data, append) {
      var tbody = document.getElementById('stb');
      var total = _studentTotal;
      var countEl = document.getElementById('scb');
      if (!tbody) return;
      var rows = data.map(function (student, idx) {
        var absIdx = append ? (_studentData.length - data.length + idx + 1) : (idx + 1);
        return '<tr>'
          + '<td>' + absIdx + '</td>'
          + '<td class="b">' + (student.name || '—') + '</td>'
          + '<td>' + (student.regNo || '—') + '</td>'
          + '<td>' + (student.academicYear || '—') + '</td>'
          + '<td>' + (student.courseType || '—') + '</td>'
          + '<td>' + (student.branch || student.deptName || '—') + '</td>'
          + '<td>' + (student.deptName || '—') + '</td>'
          + '<td>' + (student.className || '—') + '</td>'
          + '<td>' + (student.section || '—') + '</td>'
          + '<td><button class="btn bgho bxs" onclick="openStuEdit(\'' + student._id + '\')">✏️</button></td>'
          + '</tr>';
      }).join('');
      if (append) {
        tbody.insertAdjacentHTML('beforeend', rows);
      } else {
        tbody.innerHTML = rows || '<tr><td colspan="10" style="text-align:center;padding:36px 16px;color:var(--tdi);">'
          + '<span style="font-size:38px;display:block;margin-bottom:10px;">👨‍🎓</span>'
          + '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">No students found matching your filters.</div>'
          + '<div style="font-size:12px;color:var(--tdi);">Try adjusting your filters or add a student using the button above.</div>'
          + '</td></tr>';
      }
      if (countEl) countEl.textContent = total + ' student' + (total === 1 ? '' : 's');
      var moreWrap = document.getElementById('load-more-wrap');
      if (moreWrap) moreWrap.style.display = (_studentData.length < total) ? 'block' : 'none';
    }

    function showStudentList() {
      var ay = document.getElementById('sf-ay') ? document.getElementById('sf-ay').value : '';
      _studentPage = 1;
      _studentData = [];
      var tok = getToken();
      if (!tok) return;
      var qs = _buildStudentQueryString(1);
      document.getElementById('load-more-wrap').style.display = 'none';
      document.getElementById('stb').innerHTML = '<tr><td colspan="10" style="text-align:center;padding:36px;color:var(--tdi);">⏳ Loading…</td></tr>';
      fetch('/api/students' + qs, { headers: { 'Authorization': 'Bearer ' + tok } })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var list = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
          _studentData = list;
          _studentTotal = res && typeof res.total === 'number' ? res.total : list.length;
          _renderStudentTable(_studentData, false);
        })
        .catch(function () {
          document.getElementById('stb').innerHTML = '<tr><td colspan="10" style="text-align:center;padding:36px;color:var(--tdi);">Failed to load students.</td></tr>';
        });
    }

    function loadMoreStudents() {
      _studentPage++;
      var tok = getToken();
      if (!tok) return;
      var qs = _buildStudentQueryString(_studentPage);
      document.getElementById('btn-load-more').disabled = true;
      document.getElementById('btn-load-more').textContent = 'Loading…';
      fetch('/api/students' + qs, { headers: { 'Authorization': 'Bearer ' + tok } })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var list = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
          _studentData = _studentData.concat(list);
          _studentTotal = res && typeof res.total === 'number' ? res.total : _studentData.length;
          _renderStudentTable(list, true);
          document.getElementById('btn-load-more').disabled = false;
          document.getElementById('btn-load-more').textContent = 'Load More';
        })
        .catch(function () {
          _studentPage--;
          document.getElementById('btn-load-more').disabled = false;
          document.getElementById('btn-load-more').textContent = 'Load More';
          showToast('Failed to load more students', 'error');
        });
    }

    function sortStudentsBy(column) {
      if (_studentSortBy === column) {
        _studentSortDir = _studentSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        _studentSortBy = column;
        _studentSortDir = 'asc';
      }
      // Update sort indicators
      document.querySelectorAll('.sort-ind').forEach(function (el) {
        var col = el.getAttribute('data-sort');
        if (col === _studentSortBy) {
          el.textContent = _studentSortDir === 'asc' ? ' ▲' : ' ▼';
        } else {
          el.textContent = '';
        }
      });
      if (_studentData.length === 0) return;
      showStudentList();
    }

    function _refreshStudentList() {
      // Re-fetch the current list silently (called after add/edit/delete)
      if (_studentData.length === 0) return;
      showStudentList();
    }

    var _studentSearchQuery = '';
    function filterStudentsLive(query) {
      _studentSearchQuery = (query || '').toLowerCase();
      if (!_studentData.length) {
        // No data loaded yet — do nothing (search is live only on loaded data)
        return;
      }
      var filtered = _studentData.filter(function (s) {
        if (!_studentSearchQuery) return true;
        return (s.name || '').toLowerCase().indexOf(_studentSearchQuery) !== -1
          || (s.regNo || '').toLowerCase().indexOf(_studentSearchQuery) !== -1;
      });
      var countEl = document.getElementById('scb');
      var tbody = document.getElementById('stb');
      if (countEl) countEl.textContent = _studentTotal + ' student' + (_studentTotal === 1 ? '' : 's')
        + (_studentSearchQuery ? ' (' + filtered.length + ' shown)' : '');
      if (tbody) {
        if (!filtered.length) {
          tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:36px 16px;color:var(--tdi);">'
            + '<span style="font-size:38px;display:block;margin-bottom:10px;">🔍</span>'
            + '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">No students match your search.</div>'
            + '</td></tr>';
        } else {
          tbody.innerHTML = filtered.map(function (student, idx) {
            return '<tr>'
              + '<td>' + (idx + 1) + '</td>'
              + '<td class="b">' + (student.name || '—') + '</td>'
              + '<td>' + (student.regNo || '—') + '</td>'
              + '<td>' + (student.academicYear || '—') + '</td>'
              + '<td>' + (student.courseType || '—') + '</td>'
              + '<td>' + (student.branch || student.deptName || '—') + '</td>'
              + '<td>' + (student.deptName || '—') + '</td>'
              + '<td>' + (student.className || '—') + '</td>'
              + '<td>' + (student.section || '—') + '</td>'
              + '<td><button class="btn bgho bxs" onclick="openStuEdit(\'' + student._id + '\')">✏️</button></td>'
              + '</tr>';
          }).join('');
        }
      }
    }

    function updateBranch() {
      const type = document.getElementById('co-type').value;
      const branchDD = document.getElementById('branch');

      let options = `<option value="">— Select —</option>`;

      if (type === 'UG') {
        options += `
          <option value="B.E">B.E</option>
          <option value="B.TECH">B.TECH</option>
        `;
      }
      else if (type === 'PG') {
        options += `
          <option value="M.E">M.E</option>
          <option value="M.TECH">M.TECH</option>
        `;
      }

      branchDD.innerHTML = options;
    }

    // ─── HOD TRACKID LOOKUP ──────────────────────────────────────────────────────
    // Debounced 600 ms + 3 s minimum spinner. Checks isHod before accepting.
    // API endpoint expected: GET /api/teachers/trackid/:id
    //   Response: { fullName: "...", isHod: true|false }  OR  { error: "..." }
    // pfx '' = Add Dept modal   |   pfx 'ed-' = Edit Dept modal

    var _hodLookupTimer = null;   // debounce handle (add modal)
    var _hodLookupMinTimer = null; // minimum 3-second spinner timer (add modal)
    var _edHodLookupTimer = null;   // debounce handle (edit modal)
    var _edHodLookupMinTimer = null; // minimum 3-second spinner timer (edit modal)

    /** Reset all badge/message state — pfx '' = add modal, 'ed-' = edit modal */
    function hodLookupReset(pfx) {
      pfx = pfx || '';
      [pfx + 'hod-spin', pfx + 'hod-ok', pfx + 'hod-err'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      var msgId = pfx ? pfx + 'hod-lookup-msg' : 'hod-lookup-msg';
      var msg = document.getElementById(msgId);
      if (msg) { msg.textContent = ''; msg.style.color = ''; }
    }

    /** Show one badge, hide the others */
    function hodLookupBadge(which, pfx) {   // which: 'spin' | 'ok' | 'err'
      pfx = pfx || '';
      ['spin', 'ok', 'err'].forEach(function (k) {
        var el = document.getElementById(pfx + 'hod-' + k);
        if (el) el.style.display = (k === which) ? 'inline-block' : 'none';
      });
    }

    /** Called every keystroke — debounces 600 ms, then checks isHod + fetches name */
    function scheduleHodLookup(rawId, pfx) {
      pfx = pfx || '';
      var timerKey = pfx ? '_edHodLookupTimer' : '_hodLookupTimer';
      var minTimerKey = pfx ? '_edHodLookupMinTimer' : '_hodLookupMinTimer';
      var id = (rawId || '').trim();

      // Clear previous debounce + minimum timer
      if (window[timerKey]) clearTimeout(window[timerKey]);
      if (window[minTimerKey]) clearTimeout(window[minTimerKey]);

      // Reset everything when field is empty
      if (!id) {
        hodLookupReset(pfx);
        var hn = document.getElementById(pfx + 'hod-name');
        if (hn) hn.value = '';
        return;
      }

      // Debounce: wait 600 ms of silence before starting
      window[timerKey] = setTimeout(function () {
        hodLookupBadge('spin', pfx);
        var msgId = pfx ? pfx + 'hod-lookup-msg' : 'hod-lookup-msg';
        var msg = document.getElementById(msgId);
        if (msg) { msg.textContent = 'Looking up TrackID…'; msg.style.color = 'var(--tmu)'; }

        var tok = getToken();
        var fetchDone = false;
        var minDone = false;
        var fetchResult = null; // { ok, name, error }

        // Minimum 3-second spinner so it doesn't flash
        window[minTimerKey] = setTimeout(function () {
          minDone = true;
          if (fetchDone) applyHodResult(fetchResult, pfx);
        }, 3000);

        // Actual API call — GET /api/teachers/trackid/:id
        fetch('/api/teachers/trackid/' + encodeURIComponent(id), {
          headers: { 'Authorization': tok ? 'Bearer ' + tok : '' }
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            fetchDone = true;
            if (data && data.fullName) {
              fetchResult = { ok: true, name: data.fullName };
            } else {
              fetchResult = { ok: false, error: data && data.error ? data.error : 'TrackID not found' };
            }
            if (minDone) applyHodResult(fetchResult, pfx);
          })
          .catch(function () {
            fetchDone = true;
            fetchResult = { ok: false, error: 'Network error — check connection' };
            if (minDone) applyHodResult(fetchResult, pfx);
          });

      }, 600);
    }

    /** Apply result after both fetch + 3-second minimum are done */
    function applyHodResult(result, pfx) {
      pfx = pfx || '';
      var hn = document.getElementById(pfx + 'hod-name');
      var msgId = pfx ? pfx + 'hod-lookup-msg' : 'hod-lookup-msg';
      var msg = document.getElementById(msgId);

      if (result && result.ok) {
        hodLookupBadge('ok', pfx);
        if (hn) hn.value = result.name;
        if (msg) { msg.textContent = '✔ HoD verified: ' + result.name; msg.style.color = 'var(--gD)'; }
        showToast('✔ HoD verified: ' + result.name);
      } else {
        hodLookupBadge('err', pfx);
        if (hn) hn.value = '';
        var errTxt = result ? result.error : 'Unknown error';
        if (msg) { msg.textContent = '✘ ' + errTxt; msg.style.color = 'var(--red)'; }
        showToast(errTxt, 'warn');
      }
    }

    /** Branch dropdown updater for Edit Dept modal */
    function edUpdateBranch() {
      var ct = document.getElementById('ed-cotype');
      var br = document.getElementById('ed-branch');
      if (!ct || !br) return;
      var ugBranches = ['B.E', 'B.Tech'];
      var pgBranches = ['M.E', 'M.Tech'];
      var opts = ct.value === 'UG' ? ugBranches : ct.value === 'PG' ? pgBranches : [];
      br.innerHTML = opts.length
        ? opts.map(function (o) { return '<option value="' + o + '">' + o + '</option>'; }).join('')
        : '<option value="">— Select Course Type First —</option>';
    }

    function openStuEdit(studentId) {
      var student = DB.get('students').find(function (x) { return x._id === studentId; });
      if (!student) return;

      document.getElementById('edit-subtitle').textContent = student.regNo + ' · ' + (student.className || '');
      document.getElementById('edit-name').value = student.name || '';
      document.getElementById('edit-regNo').value = student.regNo || '';

      // firstName / lastName — use stored values or auto-split from name
      (function () {
        var fnEl = document.getElementById('edit-firstName');
        var lnEl = document.getElementById('edit-lastName');
        if (!fnEl || !lnEl) return;
        if (student.firstName || student.lastName) {
          fnEl.value = student.firstName || '';
          lnEl.value = student.lastName || '';
        } else {
          var parts = (student.name || '').split(/\s+/).filter(Boolean);
          if (parts.length === 1) { fnEl.value = parts[0]; lnEl.value = ''; }
          else if (parts.length === 2) { fnEl.value = parts[0]; lnEl.value = parts[1]; }
          else if (parts.length >= 3) { lnEl.value = parts[parts.length - 1]; fnEl.value = parts.slice(0, parts.length - 1).join(' '); }
        }
      }());

      var yearOptions = YEAR_CONFIG.current ? [YEAR_CONFIG.current] : [];
      if (student.academicYear && yearOptions.indexOf(student.academicYear) === -1) {
        yearOptions.push(student.academicYear);
      }
      ['edit-year', 'stu-year'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = yearOptions.length
          ? yearOptions.map(function (y) {
            return '<option' + (y === student.academicYear ? ' selected' : '') + '>' + y + '</option>';
          }).join('')
          : '<option value="">— No current academic year set —</option>';
      });

      var batchOptions = Array.isArray(YEAR_CONFIG.batches) ? YEAR_CONFIG.batches.slice() : [];
      if (student.batch && batchOptions.indexOf(student.batch) === -1) {
        batchOptions.push(student.batch);
      }
      var editBatchEl = document.getElementById('edit-batch');
      if (editBatchEl) {
        editBatchEl.innerHTML = batchOptions.length
          ? batchOptions.map(function (b) {
            return '<option' + (b === student.batch ? ' selected' : '') + '>' + b + '</option>';
          }).join('')
          : '<option value="">— No active batches set —</option>';
      }

      document.getElementById('edit-courseType').value = student.courseType || '';
      onEditCourseTypeChange(student.branch || student.course);
      setTimeout(function () {
        document.getElementById('edit-branch').value = student.branch || student.course || '';
      }, 50);

      var depts = DB.get('depts');
      document.getElementById('edit-dept').innerHTML = '<option value="">— Select —</option>'
        + depts.map(function (d) {
          return '<option value="' + d._id + '"' + (d._id === student.deptId ? ' selected' : '') + '>' + d.name + '</option>';
        }).join('');

      var classes = DB.get('classes');
      document.getElementById('edit-class').innerHTML = '<option value="">— Select —</option>'
        + classes.map(function (c) {
          return '<option value="' + c._id + '"' + (c._id === student.classId ? ' selected' : '') + '>' + c.name + '</option>';
        }).join('');

      document.getElementById('edit-section').value = student.section || '';

      // ── login details ──
      var emailEl = document.getElementById('edit-email');
      var usernameEl = document.getElementById('edit-username');
      var passwordEl = document.getElementById('edit-password');
      if (emailEl) emailEl.value = student.email || '';
      if (usernameEl) usernameEl.value = student.username || (student.email ? student.email.split('@')[0] : '');
      if (passwordEl) passwordEl.value = '';
      _editEmailVerified = true;  // existing email is already confirmed
      _editEmailBeforeNo = '';
      openModal_('m-stu-edit');
    }

    function onEditCourseTypeChange(selectedCourse) {
      var courseType = document.getElementById('edit-courseType') ? document.getElementById('edit-courseType').value : '';
      var el = document.getElementById('edit-branch');
      if (!el) return;
      el.innerHTML = '<option value="">— Select —</option>'
        + (COURSES[courseType] ? Object.keys(COURSES[courseType]).map(function (c) {
          return '<option' + (c === selectedCourse ? ' selected' : '') + '>' + c + '</option>';
        }).join('') : '');
    }

    /** Auto-split full name into first/last when editing */
    function onEditNameInput() {
      var parts = getFieldValue('edit-name').split(/\s+/).filter(Boolean);
      var fn = '', ln = '';
      if (parts.length === 1) { fn = parts[0]; ln = ''; }
      else if (parts.length === 2) { fn = parts[0]; ln = parts[1]; }
      else if (parts.length >= 3) { ln = parts[0]; fn = parts.slice(1).join(' '); }
      var fnEl = document.getElementById('edit-firstName');
      var lnEl = document.getElementById('edit-lastName');
      if (fnEl) fnEl.value = fn;
      if (lnEl) lnEl.value = ln;
    }

    function saveStuEdit() {
      var name = getFieldValue('edit-name');
      var firstName = getFieldValue('edit-firstName');
      var lastName = getFieldValue('edit-lastName');
      var regNo = getFieldValue('edit-regNo');
      var year = getFieldValue('edit-year');
      var ct = getFieldValue('edit-courseType');
      var batch = getFieldValue('edit-batch');
      var trackId = getFieldValue('edit-trackId');
      var branch = getFieldValue('edit-branch');
      var deptId = document.getElementById('edit-dept').value;
      var classId = document.getElementById('edit-class').value;
      var section = getFieldValue('edit-section');
      var email = document.getElementById('edit-email') ? document.getElementById('edit-email').value.trim() : '';
      var username = getFieldValue('edit-username') || (email ? email.split('@')[0] : '');
      var password = document.getElementById('edit-password') ? document.getElementById('edit-password').value : '';

      if (!name || !regNo || !year || !ct || !branch || !deptId || !classId || !section) {
        showToast('All fields are required'); return;
      }

      var dept = DB.get('depts').find(function (d) { return d._id === deptId; });
      var cls = DB.get('classes').find(function (c) { return c._id === classId; });
      var allStudents = DB.get('students');
      var matchIndex = allStudents.findIndex(function (s) { return s.regNo === regNo || s.name === name; });
      if (matchIndex < 0) { showToast('Student not found'); return; }

      var studentId = allStudents[matchIndex]._id;
      dbToast('Saving', 'saving');
      var updatePayload = {
        name: name,
        firstName: firstName, lastName: lastName, regNo: regNo,
        academicYear: year, courseType: ct, course: branch, branch: branch,
        deptId: deptId, deptName: dept ? dept.name : '',
        classId: classId, className: cls ? cls.name : '',
        section: section, batch: batch, trackId: trackId,
        email: email, username: username
      };
      if (password) updatePayload.password = password;
      apiUpdateStudent(
        studentId, updatePayload,
        name
      )
        .then(function (d) {
          if (!d) return;
          addLog('Student Updated', '"' + name + '"');
          closeModalBg('m-stu-edit');
          _refreshStudentList();
          dbToast('Student updated', 'success');
        });
    }

    function dStuFromEdit() {
      var regNo = getFieldValue('edit-regNo');
      var student = DB.get('students').find(function (s) { return s.regNo === regNo; });
      if (!student) { showToast('Not found', 'warn'); return; }
      document.getElementById('dc-confirm-id').value = student._id;
      document.getElementById('dc-confirm-msg').textContent = 'Delete student "' + student.name + '"?';
      document.getElementById('dc-confirm-btn').onclick = function () {
        apiDeleteStudent(student._id, student.name).then(function () {
          addLog('Student Deleted', '"' + student.name + '"');
          closeModalBg('m-dc-confirm');
          closeModalBg('m-stu-edit');
          _refreshStudentList();
          syncBadgesFromAPI();
          dbToast('Deleted', 'success');
        });
      };
      openModal_('m-dc-confirm');
    }

    function addStu() {
      var name = getFieldValue('stu-name');
      var firstName = getFieldValue('stu-firstName');
      var lastName = getFieldValue('stu-lastName');
      var regNo = getFieldValue('stu-regNo');
      var trackId = getFieldValue('stu-trackId');
      if (!trackId && regNo.length >= 12) {
        var _yr = regNo.substring(4, 6);
        var _dc = regNo.substring(6, 9);
        var _rl = regNo.substring(9, 12);
        var _dp = DB.get('depts').find(function (d) { return d.number === _dc; });
        var _tc = _dp
          ? (_dp.twoLetterCode || (_dp.code ? _dp.code.slice(0, 2).toLowerCase() : ''))
          : '';
        trackId = buildStuTrackId(_yr, _tc, _rl);
        // Write it back into the field so the user can see it
        var _tidEl = document.getElementById('stu-trackId');
        if (_tidEl) _tidEl.value = trackId;
      }
      if (!trackId) { showToast('Track ID could not be generated — ensure the department has a 2-letter code', 'warn'); return; }
      var year = document.getElementById('stu-year') ? document.getElementById('stu-year').value : '';
      var batch = document.getElementById('stu-batch') ? document.getElementById('stu-batch').value : '';
      var courseType = document.getElementById('stu-courseType') ? document.getElementById('stu-courseType').value : '';
      var branch = document.getElementById('stu-branch') ? document.getElementById('stu-branch').value : '';
      var deptId = document.getElementById('stu-dept') ? document.getElementById('stu-dept').value : '';
      var classId = document.getElementById('stu-class') ? document.getElementById('stu-class').value : '';
      var section = getFieldValue('stu-section');
      var email = document.getElementById('stu-email') ? document.getElementById('stu-email').value.trim() : '';
      var username = getFieldValue('stu-username') || email.split('@')[0];
      var password = document.getElementById('stu-password') ? document.getElementById('stu-password').value : '';
      var dept = DB.get('depts').find(function (d) { return d._id === deptId; });
      var cls = DB.get('classes').find(function (c) { return c._id === classId; });

      if (!name) { showToast('Student name is required', 'warn'); return; }
      if (!regNo || regNo.length < 12) { showToast('Valid 12-digit Register Number required', 'warn'); return; }
      if (!classId) { showToast('Class is required', 'warn'); return; }
      if (!email) { showToast('Email is required', 'warn'); return; }
      if (!_stuEmailVerified) {
        showToast('Please confirm the email first (click the email field)', 'warn');
        document.getElementById('stu-email').focus(); return;
      }
      apiAddStudent({
        name: name, firstName: firstName, lastName: lastName,
        regNo: regNo, trackId: trackId,
        academicYear: year, batch: batch,
        courseType: courseType, branch: branch, course: branch,
        deptId: deptId, deptName: dept ? dept.name : '',
        classId: classId, className: cls ? cls.name : '',
        year: cls ? cls.year : '', section: section,
        email: email, username: username, password: password
      }).then(function (d) {
        if (!d) return;
        addLog('Student Added', '"' + name + '" (' + regNo + ')');
        closeModalBg('m-add-student');
        _refreshStudentList();
        syncBadgesFromAPI();
        resetStudentForm();
      });
    }

    function onCourseTypeChange() {
      // kept for edit-student form compatibility
      var courseType = document.getElementById('stu-courseType') ? document.getElementById('stu-courseType').value : '';
      var el = document.getElementById('stu-branch');
      if (!el) return;
      el.innerHTML = '<option value="">— Select —</option>'
        + (COURSES[courseType] ? Object.keys(COURSES[courseType]).map(function (c) { return '<option>' + c + '</option>'; }).join('') : '');
    }

    function onBranchChange() { /* no-op — branch is set automatically from dept */ }

    // ─── ADD-STUDENT AUTO-FILL HANDLERS ─────────────────────────────────────────

    /** When dept changes → fill courseType + branch from DB, filter class list */
    // ─── STUDENT AUTO-FILL HELPERS ───────────────────────────────────────────────
    // Register No format: 7140 | YY | DDD | RRR
    //  7140 = institute, YY = year (25→2025-26), DDD = 3-digit dept.number, RRR = roll

    /** Build full email: "Arun M","25","cs" → "arunm25cs@srishakthi.ac.in" */
    function buildStuEmail(name, yearCode, twoCode) {
      var namePart = (name || '').trim().split(/\s+/).map(function (p) { return p.toLowerCase(); }).join('');
      if (!namePart || !yearCode || !twoCode) return '';
      return namePart + yearCode + twoCode.toLowerCase() + '@srishakthi.ac.in';
    }

    /** Build TrackId: "25","cs","208" → "TR25CS208" */
    function buildStuTrackId(yearCode, twoCode, roll) {
      if (!yearCode || !twoCode || !roll) return '';
      return 'TR' + yearCode + twoCode.toUpperCase() + String(roll).padStart(3, '0').slice(-3);
    }

    /** Build teacher TrackId from empId: "EMP001" → "TREMP001" */
    function buildTchTrackId() {
      var empId = getFieldValue('t-ei');
      var trackInput = document.getElementById('t-ti');

      if (!empId) {
        if (trackInput) trackInput.value = '';
        return '';
      }

      var gen = 'TR-' + empId;

      if (trackInput) {
        trackInput.value = gen;
      }

      return gen;
    }

    /** Find dept from DB by 3-digit register code (dept.number) */
    function getDeptByNumber(deptCode) {
      return DB.get('depts').find(function (d) { return d.number === deptCode; }) || null;
    }

    // ── email confirm state ───────────────────────────────────────────────────────
    var _stuEmailVerified = false;
    var _stuEmailBeforeNo = '';   // snapshot taken when user clicks "No"

    function _setStuAddBtn(on) {
      var btn = document.getElementById('btn-add-stu');
      if (!btn) return;
      btn.disabled = !on;
      btn.style.opacity = on ? '1' : '.5';
      btn.style.cursor = on ? 'pointer' : 'not-allowed';
    }

    /** Show the inline popup when email field is focused */
    function showStuEmailPopup() {
      var emailEl = document.getElementById('stu-email');
      var popup = document.getElementById('stu-email-popup');
      if (!popup || !emailEl) return;
      if (emailEl.value.trim() && !_stuEmailVerified) {
        popup.style.display = 'block';
      }
    }

    function hideStuEmailPopup() {
      var popup = document.getElementById('stu-email-popup');
      if (popup) popup.style.display = 'none';
    }

    /** "Yes" / "No" popup buttons */
    function stuEmailVerify(correct) {
      hideStuEmailPopup();
      var emailEl = document.getElementById('stu-email');
      var usernameEl = document.getElementById('stu-username');
      if (correct) {
        _stuEmailVerified = true;
        _stuEmailBeforeNo = '';
        var full = emailEl ? emailEl.value.trim() : '';
        if (usernameEl) usernameEl.value = full.split('@')[0];
        _setStuAddBtn(true);
        showToast('✓ Email confirmed');
      } else {
        // "No" — snapshot current value; any change to it will unlock Add button
        _stuEmailVerified = false;
        _stuEmailBeforeNo = emailEl ? emailEl.value.trim() : '';
        _setStuAddBtn(false);
        if (emailEl) { emailEl.focus(); emailEl.select(); }
      }
    }

    /** Email manually edited */
    function onStuEmailInput() {
      var emailEl = document.getElementById('stu-email');
      var email = emailEl ? emailEl.value.trim() : '';
      _stuEmailVerified = false;
      hideStuEmailPopup();
      // If they changed the email after clicking "No" → auto-enable Add button
      if (_stuEmailBeforeNo && email && email !== _stuEmailBeforeNo) {
        _stuEmailVerified = true;
        var usernameEl = document.getElementById('stu-username');
        if (usernameEl) usernameEl.value = email.split('@')[0];
        _setStuAddBtn(true);
      } else {
        _setStuAddBtn(false);
      }
    }

    /** Called when email is auto-generated by the form (regNo / name input) */
    function _stuShowEmailVerify(email) {
      _stuEmailVerified = false;
      _stuEmailBeforeNo = '';
      hideStuEmailPopup();
      _setStuAddBtn(false);
    }
    function onTchEmailInput() {
      var emailEl = document.getElementById('t-em');
      var email = emailEl ? emailEl.value.trim() : '';

      var usernameEl = document.getElementById('t-us');
      usernameEl.value = email.split('@')[0];
    }

    // ── EDIT-STUDENT EMAIL HANDLERS ───────────────────────────────────────────────
    var _editEmailVerified = false;
    var _editEmailBeforeNo = '';

    function showEditEmailPopup() {
      var emailEl = document.getElementById('edit-email');
      var popup = document.getElementById('edit-email-popup');
      if (!popup || !emailEl) return;
      if (emailEl.value.trim() && !_editEmailVerified) {
        popup.style.display = 'block';
      }
    }

    function hideEditEmailPopup() {
      var popup = document.getElementById('edit-email-popup');
      if (popup) popup.style.display = 'none';
    }

    function editEmailVerify(correct) {
      hideEditEmailPopup();
      var emailEl = document.getElementById('edit-email');
      var usernameEl = document.getElementById('edit-username');
      if (correct) {
        _editEmailVerified = true;
        _editEmailBeforeNo = '';
        var full = emailEl ? emailEl.value.trim() : '';
        if (usernameEl) usernameEl.value = full.split('@')[0];
        showToast('✓ Email confirmed');
      } else {
        _editEmailVerified = false;
        _editEmailBeforeNo = emailEl ? emailEl.value.trim() : '';
        if (emailEl) { emailEl.focus(); emailEl.select(); }
      }
    }

    function onEditEmailInput() {
      var emailEl = document.getElementById('edit-email');
      var email = emailEl ? emailEl.value.trim() : '';
      hideEditEmailPopup();
      if (_editEmailBeforeNo && email && email !== _editEmailBeforeNo) {
        _editEmailVerified = true;
        var usernameEl = document.getElementById('edit-username');
        if (usernameEl) usernameEl.value = email.split('@')[0];
      } else if (email !== (document.getElementById('edit-email').__origEmail || email)) {
        _editEmailVerified = false;
      }
    }

    /** Dept dropdown changed → fill courseType/branch, filter class list */
    function onStuDeptChange() {
      var deptId = document.getElementById('stu-dept') ? document.getElementById('stu-dept').value : '';
      var dept = DB.get('depts').find(function (d) { return d._id === deptId; });
      var ctEl = document.getElementById('stu-courseType');
      var brEl = document.getElementById('stu-branch');
      if (ctEl) ctEl.value = dept ? (dept.courseType || '') : '';
      if (brEl) brEl.value = dept ? (dept.branch || '') : '';
      var clsEl = document.getElementById('stu-class');
      if (clsEl) {
        var classes = DB.get('classes').filter(function (c) { return !deptId || c.deptId === deptId; });
        clsEl.innerHTML = '<option value="">— Select —</option>'
          + classes.map(function (c) { return '<option value="' + c._id + '">' + c.name + '</option>'; }).join('');
        var secEl = document.getElementById('stu-section');
        if (secEl) secEl.value = '';
      }
    }

    function onStuClassChange() {
      var classId = document.getElementById('stu-class') ? document.getElementById('stu-class').value : '';
      var cls = DB.get('classes').find(function (c) { return c._id === classId; });
      var secEl = document.getElementById('stu-section');
      if (secEl) secEl.value = cls && cls.section ? cls.section : '';
    }

    function onEditClassChange() {
      var classId = document.getElementById('edit-class') ? document.getElementById('edit-class').value : '';
      var cls = DB.get('classes').find(function (c) { return c._id === classId; });
      var secEl = document.getElementById('edit-section');
      if (secEl && cls && cls.section) secEl.value = cls.section;
    }

    /** Register No → decode all fields */
    function onStuRegNoChange() {
      var regNo = (getFieldValue('stu-regNo') || '').replace(/\D/g, '');
      var rnEl = document.getElementById('stu-regNo');
      if (rnEl) rnEl.value = regNo;
      if (regNo.length < 12) return;

      var yearCode = regNo.substring(4, 6);
      var deptCode = regNo.substring(6, 9);
      var roll = regNo.substring(9, 12);

      // Academic year
      var acYear = '20' + yearCode + '-' + (parseInt(yearCode, 10) + 1);
      var yearEl = document.getElementById('stu-year');
      if (yearEl) {
        for (var i = 0; i < yearEl.options.length; i++) {
          if (yearEl.options[i].value === acYear || yearEl.options[i].text === acYear) {
            yearEl.value = acYear; break;
          }
        }
      }

      // Batch year
      var batchYear = '20' + yearCode + '-' + (parseInt(yearCode, 10) + 4);
      var yearEl = document.getElementById('stu-batch');
      if (yearEl) {
        for (var i = 0; i < yearEl.options.length; i++) {
          if (yearEl.options[i].value === batchYear || yearEl.options[i].text === batchYear) {
            yearEl.value = batchYear; break;
          }
        }
      }

      // Dept
      var dept = getDeptByNumber(deptCode);
      if (dept) {
        var deptEl = document.getElementById('stu-dept');
        if (deptEl) { deptEl.value = dept._id; onStuDeptChange(); }
        var ctEl = document.getElementById('stu-courseType');
        var brEl = document.getElementById('stu-branch');
        if (ctEl) ctEl.value = dept.courseType || '';
        if (brEl) brEl.value = dept.branch || '';
      }

      var twoCode = dept
        ? (dept.twoLetterCode || (dept.code ? dept.code.slice(0, 2).toLowerCase() : ''))
        : '';

      // TrackId
      var tid = buildStuTrackId(yearCode, twoCode, roll);
      var tidEl = document.getElementById('stu-trackId');
      if (tidEl) tidEl.value = tid;

      // Email
      var name = getFieldValue('stu-name');
      var email = buildStuEmail(name, yearCode, twoCode);
      var emailEl = document.getElementById('stu-email');
      if (emailEl) emailEl.value = email;
      _stuShowEmailVerify(email);
    }

    /** Name typed → split first/last, refresh email if regNo decoded */
    function onStuNameInput() {
      var trimmed = (document.getElementById('stu-name').value || '').trim();
      var parts = trimmed.split(/\s+/).filter(Boolean);

      var fn = '';
      var ln = '';

      if (parts.length === 1) {
        fn = parts[0];
      }
      else if (parts.length === 2) {
        fn = parts[0];
        ln = parts[1];
      }
      else {
        var last = parts[parts.length - 1];
        var secondLast = parts[parts.length - 2];

        var twoInitials =
          /^[A-Za-z]{1,2}$/.test(last) &&
          /^[A-Za-z]{1,2}$/.test(secondLast);

        if (twoInitials) {
          fn = parts.slice(0, -2).join(' ');
          ln = parts.slice(-2).join(' ');
        } else {
          fn = parts.slice(0, -1).join(' ');
          ln = last;
        }
      }

      var fnEl = document.getElementById('stu-firstName');
      var lnEl = document.getElementById('stu-lastName');

      if (fnEl) fnEl.value = fn;
      if (lnEl) lnEl.value = ln;


      var regNo = (getFieldValue('stu-regNo') || '');
      if (regNo.length >= 12) {
        var yearCode = regNo.substring(4, 6);
        var deptCode = regNo.substring(6, 9);
        var dept = getDeptByNumber(deptCode);
        var twoCode = dept
          ? (dept.twoLetterCode || (dept.code ? dept.code.slice(0, 2).toLowerCase() : ''))
          : '';
        if (dept && twoCode) {
          var email = buildStuEmail(trimmed, yearCode, twoCode);
          var emailEl = document.getElementById('stu-email');
          if (emailEl) emailEl.value = email;
          _stuShowEmailVerify(email);
          // Also refresh trackId in case name changed before regNo was fully decoded
          var roll = regNo.substring(9, 12);
          var tidEl = document.getElementById('stu-trackId');
          if (tidEl && !tidEl.value) tidEl.value = buildStuTrackId(yearCode, twoCode, roll);
        }
      }
    }

    function onTchNameInput() {
      var trimmed = (document.getElementById('t-nm').value || '').trim();
      var parts = trimmed.split(/\s+/).filter(Boolean);

      var fn = '';
      var ln = '';

      if (parts.length === 1) {
        fn = parts[0];
      }
      else if (parts.length === 2) {
        fn = parts[0];
        ln = parts[1];
      }
      else {
        var last = parts[parts.length - 1];
        var secondLast = parts[parts.length - 2];

        var twoInitials =
          /^[A-Za-z]{1,2}$/.test(last) &&
          /^[A-Za-z]{1,2}$/.test(secondLast);

        if (twoInitials) {
          fn = parts.slice(0, -2).join(' ');
          ln = parts.slice(-2).join(' ');
        } else {
          fn = parts.slice(0, -1).join(' ');
          ln = last;
        }
      }

      document.getElementById('t-fn').value = fn;
      document.getElementById('t-ln').value = ln;
    }

    // ─── RESET / CLEAR HELPERS ───────────────────────────────────────────────────
    function resetDeptForm() {
      clearInputs(['dept-name', 'dept-2code', 'dept-code', 'dept-number', 'hod-id', 'hod-name']);
      var coEl = document.getElementById('co-type'); if (coEl) coEl.value = '';
      var brEl = document.getElementById('branch'); if (brEl) brEl.innerHTML = '<option value="">— Select Course Type First —</option>';
      hodLookupReset('');
    }

    function resetTeacherForm() {
      clearInputs(['t-nm', 't-fn', 't-ln', 't-ei', 't-us', 't-ti']);

      var password = STUDENT_PASSWORD;
      var pwEl = document.getElementById('t-pw'); if (pwEl) pwEl.value = password;
      var dpEl = document.getElementById('t-dp'); if (dpEl) dpEl.value = '';
      var dgEl = document.getElementById('t-dg'); if (dgEl) dgEl.selectedIndex = 0;
      ['t-hod', 't-advisor', 't-examcoord', 't-tt', 't-warden', 't-placement'].concat(
        ADMIN_RIGHTS_OPTIONS.map(function (r) { return 't-' + r; })
      ).forEach(function (id) {
        var el = document.getElementById(id); if (el) el.checked = false;
      });
    }

    function resetStudentForm() {
      clearInputs(['stu-name', 'stu-firstName', 'stu-lastName', 'stu-courseType', 'stu-branch', 'stu-trackId', 'stu-section', 'stu-email', 'stu-username']);
      var rnEl = document.getElementById('stu-regNo'); if (rnEl) rnEl.value = '7140';
      var pwEl = document.getElementById('stu-password'); if (pwEl) pwEl.value = '';
      var dpEl = document.getElementById('stu-dept'); if (dpEl) dpEl.value = '';
      var clEl = document.getElementById('stu-class'); if (clEl) clEl.innerHTML = '<option value="">— Select —</option>';
      hideStuEmailPopup();
      _stuEmailVerified = false;
      _stuEmailBeforeNo = '';
      _setStuAddBtn(false);
    }

    // ─── TEACHERS PAGE — GLOBAL STATE ────────────────────────────────────────
    var _teacherData = [];
    var _teacherSearchQuery = '';

    // ─── TEACHERS PAGE — NEW FUNCTIONS ──────────────────────────────────────
    function populateTeacherDeptDropdown() {
      var deptFilter = document.getElementById('tf-dept');
      if (!deptFilter) return;
      var depts = Array.isArray(DB.get('depts')) ? DB.get('depts') : [];
      deptFilter.innerHTML = '<option value="">All Departments</option>'
        + depts.map(function (d) { return '<option value="' + d._id + '">' + d.name + '</option>'; }).join('');
      deptFilter.value = '';
    }

    function onTeacherDeptChange() {
      var dept = document.getElementById('tf-dept') ? document.getElementById('tf-dept').value : '';
      var grid = document.getElementById('tgr');
      if (!grid) return;
      grid.className = 'tgrd';
      grid.innerHTML = '<div class="emst"><span class="emico" style="font-size:28px;">⏳</span><div class="emtx">Loading teachers…</div></div>';
      var params = dept ? '?deptId=' + encodeURIComponent(dept) : '';
      apiCall('GET', '/teachers' + params)
        .then(function (list) {
          _teacherData = Array.isArray(list) ? list : [];
          _teacherSearchQuery = '';
          _renderTeacherGrid(_teacherData);
        })
        .catch(function () {
          grid.innerHTML = '<div class="emst"><span class="emico">👩‍🏫</span><div class="emtx">Failed to load teachers. Try again.</div></div>';
        });
    }

    function _renderTeacherGrid(data) {
      var grid = document.getElementById('tgr');
      if (!grid) return;
      grid.className = 'tgrd';
      var query = _teacherSearchQuery;
      var display = data;
      if (query) {
        display = data.filter(function (t) {
          return (t.name || '').toLowerCase().indexOf(query) !== -1
            || (t.empId || '').toLowerCase().indexOf(query) !== -1
            || (t.dept || '').toLowerCase().indexOf(query) !== -1;
        });
      }
      if (!display.length) {
        var deptVal = document.getElementById('tf-dept') ? document.getElementById('tf-dept').value : '';
        var emptyMsg = query ? 'No teachers match your search.' : (deptVal ? 'No teachers found in this department.' : 'No teachers found.');
        grid.innerHTML = '<div class="emst"><span class="emico">👩‍🏫</span>'
          + '<div class="emtx">' + emptyMsg + '</div>'
          + '<div style="margin-top:10px;font-size:12px;color:var(--tdi);">Add a teacher using the button above.</div></div>';
        return;
      }
      var assignments = Array.isArray(DB.get('assignments')) ? DB.get('assignments') : [];
      grid.innerHTML = display.map(function (teacher) {
        var assignmentCount = assignments.filter(function (a) { return a.teacherId === teacher.trackId || a.teacherId === teacher._id; }).length;
        var nameInitial = ((teacher.name || '')[0] || 'T').toUpperCase();
        var tid = teacher.trackId || teacher._id;
        return '<div class="tcrd" onclick="openTD(\'' + tid + '\')">'
          + '<button class="tce" onclick="event.stopPropagation();openTD(\'' + tid + '\')" title="View / Edit teacher">✏️ Edit</button>'
          + '<div class="tav">' + nameInitial + '</div>'
          + '<div class="tnm">' + (teacher.name || '—') + '</div>'
          + '<div class="tdp">' + (teacher.desig || '—') + ' · ' + (teacher.dept || '—') + '</div>'
          + '<div class="tsts">'
          + '<div class="tst2"><span>' + assignmentCount + '</span>Subjects</div>'
          + '<div class="tst2"><span>' + (teacher.empId || '—') + '</span>Emp ID</div>'
          + '</div></div>';
      }).join('');
    }

    function renderTeachers() {
      var grid = document.getElementById('tgr');
      if (!grid) return;
      if (_teacherData.length) {
        _renderTeacherGrid(_teacherData);
      } else {
        grid.innerHTML = '<div class="emst"><span class="emico" style="font-size:28px;">⏳</span><div class="emtx">Loading teachers…</div></div>';
        _refreshTeacherList();
      }
    }

    function filterTeachersLive(query) {
      _teacherSearchQuery = (query || '').toLowerCase();
      _renderTeacherGrid(_teacherData);
    }

    function openTD(teacherId) {
      // Look up by trackId first, then fall back to _id or shadowId
      var teacher;
      if (teacherId) {
        teacher = DB.get('users').find(function (u) { return u.trackId === teacherId; });
      }
      if (!teacher) return;
      currentTeacherId = teacher.trackId || teacher._id;

      document.getElementById('td-nm').textContent = teacher.name;
      document.getElementById('td-dp').textContent = (teacher.desig || '—') + ' · ' + (teacher.dept || '—') + ' · ' + (teacher.empId || '—');
      document.getElementById('td-edit-nm').value = teacher.name || '';
      document.getElementById('td-edit-ei').value = teacher.empId || '';
      document.getElementById('td-edit-us').value = teacher.username || '';
      document.getElementById('td-edit-pw').value = '';

      var sp = Array.isArray(teacher.specials) ? teacher.specials : [];
      var KNOWN_SPECIAL_CHECKBOXES = {
        isHod: 'td-sp-hod', isClassAdvisor: 'td-sp-advisor', isExamCoordinator: 'td-sp-exam',
        isTimeTableCoordinator: 'td-sp-tt', isWarden: 'td-sp-warden', isPlacementCoordinator: 'td-sp-placement'
      };
      Object.keys(KNOWN_SPECIAL_CHECKBOXES).forEach(function (opt) {
        var el = document.getElementById(KNOWN_SPECIAL_CHECKBOXES[opt]);
        if (el) el.checked = sp.some(function (s) { return s.option === opt; });
      });
      _editSpecialsCustom = sp.filter(function (s) { return !KNOWN_SPECIAL_CHECKBOXES.hasOwnProperty(s.option); });

      var ar = Array.isArray(teacher.adminRights) ? teacher.adminRights : [];
      ADMIN_RIGHTS_OPTIONS.forEach(function (r) {
        var el = document.getElementById('td-ar-' + r);
        if (el) el.checked = ar.indexOf(r) !== -1;
      });

      var depts = DB.get('depts');
      var teacherDeptId = teacher.deptId ? (typeof teacher.deptId === 'object' && teacher.deptId._id ? teacher.deptId._id : teacher.deptId) : '';
      document.getElementById('td-edit-dept').innerHTML = '<option value="">— Select —</option>' + depts.map(function (d) {
        var selected = String(d._id) === String(teacherDeptId) ? ' selected' : '';
        return '<option value="' + d._id + '"' + selected + '>' + d.name + '</option>';
      }).join('');
      document.getElementById('td-edit-dg').value = teacher.desig || '';

      var tid = teacher.trackId || teacher._id;
      var assignments = DB.get('assignments').filter(function (a) { return a.teacherId === tid; });
      document.getElementById('td-asgn').innerHTML = assignments.length
        ? assignments.map(function (a) {
          return '<div class="arow">'
            + '<div class="ainfo">'
            + '<div class="anm">📚 ' + a.subjectName + '</div>'
            + '<div class="acls">🏫 ' + a.className + ' · ' + (a.deptName || '') + '</div>'
            + '</div>'
            + '<button class="btn bdan bxs" onclick="rmAsgn(\'' + a._id + '\',\'teacher\')">✖</button>'
            + '</div>';
        }).join('')
        : '<div style="text-align:center;padding:18px;color:var(--tdi);font-size:12px;">No assignments.</div>';

      document.getElementById('td-del').onclick = function () {
        requireSpecialPw(function () {
          document.getElementById('dc-confirm-msg').textContent =
            'Delete teacher "' + teacher.name + '"? This permanently removes them and all their assignments. Restorable via Undo for 10 days.';
          document.getElementById('dc-confirm-btn').textContent = 'Confirm Delete';
          document.getElementById('dc-confirm-btn').onclick = function () {
            var btn = document.getElementById('dc-confirm-btn');
            btn.disabled = true;
            btn.textContent = 'Deleting…';
            apiDeleteTeacher(tid, teacher.name).then(function () {
              DB.delete('users', tid);
              DB.get('assignments').filter(function (a) { return a.teacherId === tid; })
                .forEach(function (a) { DB.delete('assignments', a._id); });
              addLog('Teacher Deleted', '"' + teacher.name + '"');
              closeModalBg('m-dc-confirm');
              closeModalBg('m-tch-detail');
              _teacherData = _teacherData.filter(function (t) { return (t.trackId || t._id) !== tid; });
              _renderTeacherGrid(_teacherData);
            }).catch(function (err) {
              dbToast('Delete failed: ' + (err.message || 'server error'), 'error');
            }).finally(function () {
              btn.disabled = false;
              btn.textContent = 'Confirm Delete';
            });
          };
          openModal_('m-dc-confirm');
        });
      };

      openModal_('m-tch-detail');
    }

    function saveTchEdit() {
      var name = getFieldValue('td-edit-nm');
      var empId = getFieldValue('td-edit-ei');
      var deptSel = document.getElementById('td-edit-dept');
      var dept = deptSel ? deptSel.options[deptSel.selectedIndex]?.text || '' : '';
      var deptId = deptSel ? deptSel.value || null : null;
      var deptCode = '';
      var desig = getFieldValue('td-edit-dg');
      var username = getFieldValue('td-edit-us');
      var password = getFieldValue('td-edit-pw');
      if (!name) { showToast('Name required', 'warn'); return; }

      var depts = DB.get('depts');
      var matchedDept = depts.find(function (d) { return String(d._id) === String(deptId); });
      if (matchedDept) {
        deptCode = matchedDept.code || matchedDept.threeLetterCode || '';
        dept = matchedDept.name;
      }

      var specials = [];
      if (document.getElementById('td-sp-hod').checked) specials.push({ option: 'isHod', value: true, key: dept });
      if (document.getElementById('td-sp-advisor').checked) specials.push({ option: 'isClassAdvisor', value: true, key: dept });
      if (document.getElementById('td-sp-exam').checked) specials.push({ option: 'isExamCoordinator', value: true, key: dept });
      if (document.getElementById('td-sp-tt').checked) specials.push({ option: 'isTimeTableCoordinator', value: true, key: dept });
      if (document.getElementById('td-sp-warden').checked) specials.push({ option: 'isWarden', value: true, key: dept });
      if (document.getElementById('td-sp-placement').checked) specials.push({ option: 'isPlacementCoordinator', value: true, key: dept });
      specials = specials.concat(_editSpecialsCustom);

      var adminRights = ADMIN_RIGHTS_OPTIONS.filter(function (r) {
        var el = document.getElementById('td-ar-' + r);
        return el && el.checked;
      });
      if (!adminRights.length) adminRights = ['none'];

      var updates = { name: name, empId: empId, dept: dept, deptId: deptId, deptCode: deptCode, desig: desig, username: username, specials: specials, adminRights: adminRights };
      if (password) updates.password = password;

      apiUpdateTeacher(currentTeacherId, updates, name).then(function (d) {
        if (!d) return;
        addLog('Teacher Updated', '"' + name + '"');
        closeModalBg('m-tch-detail');
        _refreshTeacherList();
        dbToast('Teacher updated', 'success');
      }).catch(function (err) { dbToast('Failed to update: ' + (err.message || 'error'), 'error'); });
    }

    function addTch() {
      var fullName = getFieldValue('t-nm');
      var firstName = getFieldValue('t-fn');
      var lastName = getFieldValue('t-ln');
      var empId = getFieldValue('t-ei');
      var deptSel = document.getElementById('t-dp');
      var dept = deptSel ? deptSel.options[deptSel.selectedIndex]?.text || '' : '';
      var deptId = deptSel ? deptSel.value || null : null;
      var deptCode = '';
      var desig = document.getElementById('t-dg')?.value || '';
      var uname = getFieldValue('t-us')?.toLowerCase();
      var email = getFieldValue('t-em') || '';
      var passwd = getFieldValue('t-pw') || 'teacher123';
      var trackId = getFieldValue('t-ti') || buildTchTrackId(empId);

      var depts = DB.get('depts');
      var matchedDept = depts.find(function (d) { return String(d._id) === String(deptId); });
      if (matchedDept) {
        deptCode = matchedDept.code || matchedDept.threeLetterCode || '';
        dept = matchedDept.name;
      }

      var isHOD = document.getElementById('t-hod')?.checked || false;
      var isAdv = document.getElementById('t-advisor')?.checked || false;
      var isExam = document.getElementById('t-examcoord')?.checked || false;
      var isTt = document.getElementById('t-tt')?.checked || false;
      var isWarden = document.getElementById('t-warden')?.checked || false;
      var isPlacement = document.getElementById('t-placement')?.checked || false;

      if (!fullName || !uname) { showToast('Name and username required', 'warn'); return; }
      if (!trackId) { showToast('Track ID could not be generated — enter Employee ID first', 'warn'); return; }

      var specials = [];

      if (isHOD) specials.push({ option: 'isHod', value: true, key: dept });
      if (isAdv) specials.push({ option: 'isClassAdvisor', value: true, key: dept });
      if (isExam) specials.push({ option: 'isExamCoordinator', value: true, key: dept });
      if (isTt) specials.push({ option: 'isTimeTableCoordinator', value: true, key: dept });
      if (isWarden) specials.push({ option: 'isWarden', value: true, key: dept });
      if (isPlacement) specials.push({ option: 'isPlacementCoordinator', value: true, key: dept });

      var adminRights = ADMIN_RIGHTS_OPTIONS.filter(function (r) {
        var el = document.getElementById('t-' + r);
        return el && el.checked;
      });
      if (!adminRights.length) adminRights = ['none'];

      const payload = {
        fullName, firstName, lastName, employeeNo: empId, email: email,
        department: dept, deptId: deptId, deptCode: deptCode, designation: desig, email, username: uname, password: passwd,
        trackId, specials, adminRights, mustChangePassword: true, firstLogin: null
      };

      apiAddTeacher(payload)
        .then(function (d) {
          if (!d) return;

          addLog('Teacher Added', '"' + fullName + '" trackId=' + trackId);
          closeModalBg('m-add-teacher');
          _refreshTeacherList();
          syncBadgesFromAPI();
          dbToast('Teacher "' + fullName + '" added to Database — Password: ' + passwd, 'success');
          resetTeacherForm();
        });
    }

    function oaat() {
      var depts = DB.get('depts');
      document.getElementById('at-dp').innerHTML = '<option value="">— Select Dept —</option>'
        + depts.map(function (d) { return '<option value="' + d._id + '">' + d.name + '</option>'; }).join('');
      document.getElementById('at-cl').innerHTML = '<option value="">— Select Class —</option>';
      document.getElementById('at-sb').innerHTML = '<option value="">— Select Subject —</option>';
      openModal_('m-add-asgn-t');
    }

    function atdc() {
      var deptId = document.getElementById('at-dp').value;
      var classes = DB.get('classes').filter(function (c) { return !deptId || c.deptId === deptId; });
      var subjects = DB.get('subjects').filter(function (s) { return !deptId || s.deptId === deptId; });
      document.getElementById('at-cl').innerHTML = '<option value="">— Select Class —</option>'
        + classes.map(function (c) { return '<option value="' + c._id + '">' + c.name + '</option>'; }).join('');
      document.getElementById('at-sb').innerHTML = '<option value="">— Select Subject —</option>'
        + subjects.map(function (s) { return '<option value="' + s._id + '">' + s.name + ' (' + s.code + ')</option>'; }).join('');
    }

    function savTA() {
      var classId = document.getElementById('at-cl').value;
      var subjectId = document.getElementById('at-sb').value;
      if (!classId || !subjectId) { showToast('Select class and subject', 'warn'); return; }
      var cls = DB.get('classes').find(function (c) { return c._id === classId; });
      var subj = DB.get('subjects').find(function (s) { return s._id === subjectId; });
      var teacher = DB.get('users').find(function (u) { return u._id === currentTeacherId; });
      if (DB.one('assignments', { classId: classId, subjectId: subjectId })) { showToast('Already assigned', 'warn'); return; }
      dbToast('Saving...', 'saving');
      apiCall('POST', '/assignments', {
        classId: classId, className: cls.name,
        subjectId: subjectId, subjectName: subj.name,
        teacherId: currentTeacherId, teacherName: teacher ? teacher.name : '',
        deptName: cls.deptName, deptCode: cls.deptCode
      }).then(function (d) {
        if (!d || d.error) { dbToast('DB Error: ' + (d && d.error ? d.error : 'Unknown'), 'error'); return; }
        return apiCall('GET', '/assignments').then(function (all) {
          if (Array.isArray(all)) DB.set('assignments', all);
          addLog('Assignment Added', '"' + subj.name + '" → ' + cls.name);
          closeModalBg('m-add-asgn-t');
          openTD(currentTeacherId);
          dbToast('Assignment added to Database', 'success');
        });
      }).catch(function () {
        dbToast('Network error saving assignment', 'error');
      });
    }

    // ─── DROPDOWN POPULATION ────────────────────────────────────────────────────
    function populateAdminDropdowns() {
      var depts = DB.get('depts');
      var classes = DB.get('classes');

      var years = YEAR_CONFIG.current ? [YEAR_CONFIG.current] : [];
      var batch = Array.isArray(YEAR_CONFIG.batches) ? YEAR_CONFIG.batches : [];

      ['stu-year', 'edit-year'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = years.length
          ? years.map(function (y) { return '<option>' + y + '</option>'; }).join('')
          : '<option value="">— No current academic year set —</option>';
      });
      var sfAy = document.getElementById('sf-ay');
      if (sfAy) {
        sfAy.innerHTML = '<option value="">— Select —</option>'
          + years.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
        sfAy.value = '';
      }

      var sfBatch = document.getElementById('sf-batch');
      if (sfBatch) {
        sfBatch.innerHTML = '<option value="">— Select —</option>'
          + batch.map(function (b) { return '<option value="' + b + '">' + b + '</option>'; }).join('');
        sfBatch.value = '';
      }

      ['nc-batch', 'stu-batch', 'edit-batch'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = batch.length
          ? batch.map(function (y) { return '<option>' + y + '</option>'; }).join('')
          : '<option value="">— No active batches set —</option>';
      });

      ['t-dp'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<option value="">— Select —</option>'
          + depts.map(function (d) { return '<option value="' + d._id + '">' + d.name + '</option>'; }).join('');
      });

      ['stu-dept', 'edit-dept'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<option value="">— Select —</option>'
          + depts.map(function (d) { return '<option value="' + d._id + '">' + d.name + '</option>'; }).join('');
      });

      ['stu-class', 'edit-class'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<option value="">— Select —</option>'
          + classes.map(function (c) { return '<option value="' + c._id + '">' + c.name + '</option>'; }).join('');
      });

      ['nc-dept', 'ns-dept'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<option value="">— Select —</option>'
          + depts.map(function (d) { return '<option value="' + d._id + '">' + d.name + '</option>'; }).join('');
      });
    }
    var padm = populateAdminDropdowns;

    // ─── MODAL HELPERS ───────────────────────────────────────────────────────────
    function openModal_(id) { var el = document.getElementById(id); if (el) el.classList.add('open'); }
    function closeModalBg(id) { var el = document.getElementById(id); if (el) { el.classList.remove('open'); el.style.display = 'none'; } }

    // Alias used by inline HTML onclick handlers
    var om = openModal_;

    // Shorthand used by some HTML buttons
    function openAddModal(type) {
      if (type === 'student') openModal_('m-add-student');
    }

    // Close modal when clicking the background overlay
    document.querySelectorAll('.modal-bg').forEach(function (bg) {
      bg.addEventListener('click', function (e) {
        if (e.target === bg) bg.classList.remove('open');
      });
    });

    // ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────
    function getFieldValue(id) {
      var el = document.getElementById(id);
      return el ? el.value.trim() : '';
    }
    var gv = getFieldValue; // alias

    function clearInputs(ids) {
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
    }
    var cli = clearInputs; // alias

    
    var showT = showToast; // alias

    function downloadCSV(rows, filename) {
      var csvContent = rows.map(function (row) {
        return row.map(function (cell) {
          return '"' + String(cell || '').replace(/"/g, '""') + '"';
        }).join(',');
      }).join('\n');
      var blob = new Blob([csvContent], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = filename + '_' + new Date().toISOString().split('T')[0] + '.csv';
      link.click();
    }
    var dlcsv = downloadCSV; // alias

    // ─── BOOT ────────────────────────────────────────────────────────────────────
    initDB();

    (function checkAuthAndBoot() {
      var storedUser = sessionStorage.getItem('eams_user');
      if (!storedUser) { window.location.href = 'index.html'; return; }
      try {
        currentUser = JSON.parse(storedUser);
      } catch (e) {
        window.location.href = 'index.html';
        return;
      }
      if (!currentUser || currentUser.role !== 'admin') {
        window.location.href = 'index.html';
        return;
      }
      try {
        bootApp();
      } catch (err) {
        console.error('[EAMS] bootApp() threw before loader gate was set up:', err);
        _loaderActive = false;
        var loaderEl = document.getElementById('page-loader');
        if (loaderEl) loaderEl.style.display = 'none';
        var shellEl = document.getElementById('app-shell');
        if (shellEl) shellEl.classList.add('vis');
        showToast('Something went wrong while loading the page — check the console (F12) for details', 'warn');
      }
      setTimeout(updateAllSidebarBadges, 800);
    })();

    // --- PROFILE: Save Name ---
    function saveProfileName() {
      var inp = document.getElementById('pr-edit-name');
      var newName = inp ? inp.value.trim() : '';
      if (!newName) { showToast('Please enter a name'); return; }
      var token = getToken();
      fetch('/api/users/' + currentUser._id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ name: newName })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.error) { dbToast('Error: ' + d.error, 'error'); return; }
        currentUser.name = newName;
        sessionStorage.setItem('eams_user', JSON.stringify(currentUser));
        var avatarLetter = newName[0].toUpperCase();
        document.getElementById('pr-av-big').textContent = avatarLetter;
        document.getElementById('pr-name-big').textContent = newName;
        document.getElementById('sb-name').textContent = newName;
        document.getElementById('topbar-av').textContent = avatarLetter;
        document.getElementById('topbar-name').textContent = newName;
        document.getElementById('sb-av').textContent = avatarLetter;
        dbToast('Name updated successfully', 'success');
      }).catch(function () {
        dbToast('Server error', 'error');
      });
    }

    function saveProfilePassword() {
      var cur = document.getElementById('pr-pw-cur').value.trim();
      var nw = document.getElementById('pr-pw-new').value.trim();
      var conf = document.getElementById('pr-pw-conf').value.trim();
      var err = document.getElementById('pr-pw-err');
      var ok = document.getElementById('pr-pw-ok');
      err.style.display = 'none'; ok.style.display = 'none';
      if (!cur || !nw || !conf) { err.textContent = 'Please fill all fields.'; err.style.display = 'block'; return; }
      if (nw.length < 6) { err.textContent = 'New password must be at least 6 characters.'; err.style.display = 'block'; return; }
      if (nw !== conf) { err.textContent = 'Passwords do not match.'; err.style.display = 'block'; return; }
      var token = getToken();
      fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ currentPassword: cur, newPassword: nw })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.error) { err.textContent = d.error; err.style.display = 'block'; return; }
        ok.textContent = 'Password updated successfully!';
        ok.style.display = 'block';
        ['pr-pw-cur', 'pr-pw-new', 'pr-pw-conf'].forEach(function (id) { document.getElementById(id).value = ''; });
      }).catch(function () { err.textContent = 'Server error.'; err.style.display = 'block'; });
    }

    // --- SIDEBAR BADGE UPDATES ---
    function updateAllSidebarBadges() {
      var stuCount = DB.get('students').length;
      var tchCount = DB.get('users').filter(function (u) { return u.role === 'teacher' && u.active !== false; }).length;
      var deptCount = DB.get('depts').length;
      var el;
      el = document.getElementById('sb-stu-badge'); if (el) el.textContent = stuCount;
      el = document.getElementById('sb-teach-badge'); if (el) el.textContent = tchCount;
      el = document.getElementById('sb-dept-badge'); if (el) el.textContent = deptCount;
      syncBadgesFromAPI();
    }

    function togglePwField(inputId, btn) {
      var inp = document.getElementById(inputId);
      if (!inp) return;

      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';

      btn.textContent = show ? '🙈' : '👁';
      btn.title = show ? 'Hide password' : 'Show password';
    }

    // ═══════════════════════════════════════════════════════
    // Security
    // ═══════════════════════════════════════════════════════

    // document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // document.addEventListener('keydown', function (e) {
    //  if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key)) || (e.ctrlKey && e.key === 'U')) { e.preventDefault(); return false; }
    // });

    // ═══════════════════════════════════════════════════════
    //  ACTION TOAST  — countdown toast with cancel + auto-action - Main Function
    // ═══════════════════════════════════════════════════════
    var _actionToast = { interval: null };

    function actionToast(opts) {

      if (opts.key && window._lastActionToastKey === opts.key) return;
      if (opts.key) window._lastActionToastKey = opts.key;

      // ── kill any already-running toast ──
      clearActionToastTimers();
      var old = document.getElementById('action-toast');
      if (old) { old.classList.remove('at-show'); old.remove(); }

      var duration = (typeof opts.duration === 'number') ? opts.duration : 5;
      var remaining = duration;

      // ── build DOM ──
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

      requestAnimationFrame(function () {
        requestAnimationFrame(function () { toast.classList.add('at-show'); });
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
        setTimeout(function () { if (toast.parentNode) toast.remove(); }, 420);
        if (opts.key) window._lastActionToastKey = null;
        if (runConfirm) { if (opts.onConfirm) opts.onConfirm(); }
        else { if (opts.onCancel) opts.onCancel(); }
      }

      toast.querySelector('.at-cancel').onclick = function () { dismiss(false); };

      _actionToast.interval = setInterval(function () {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) dismiss(true);
      }, 1000);
    }

    function clearActionToastTimers() {
      if (_actionToast.interval) clearInterval(_actionToast.interval);
      _actionToast.interval = null;
    }

    // ═══════════════════════════════════════════════════════
    //  DB SYNC LAYER — All data fetched from Database - MongoDB
    // ═══════════════════════════════════════════════════════

    // DB Update Toast
    var _dbToastTimer = null;
    var _dbToastDuration = 2000;
    var _loaderActive = true;
    var _toastQueue = [];

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
        }
      };

      // Auto hide
      if (state !== 'saving') {
        _dbToastTimer = setTimeout(function () {
          el.classList.remove('show');
        }, _dbToastDuration);
      }
    }

    // API helper
    function apiCall(method, path, body) {
      var tok = getToken();
      return fetch('/api' + path, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': tok ? 'Bearer ' + tok : '' },
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'HTTP ' + r.status); });
        return r.json();
      });
    }

    // Sync a collection from API into the in-memory render cache (DB server is source of truth)
    function syncFromAPI(collection, apiPath) {
      var tok = getToken();
      if (!tok) return Promise.resolve([]);
      return fetch('/api' + apiPath, { headers: { 'Authorization': 'Bearer ' + tok } })
        .then(function (r) {
          if (r.status === 401) {
            console.warn('[EAMS] syncFromAPI got 401 on ' + apiPath + ' — redirecting to login');
            sessionStorage.removeItem('eams_token');
            sessionStorage.removeItem('eams_user');
            window.location.href = 'index.html';
            return [];
          }
          return r.json();
        })
        .then(function (data) {
          if (Array.isArray(data)) {
            DB.set(collection, data);
            return data;
          }
          console.warn('[EAMS] syncFromAPI unexpected response for ' + apiPath + ':', data);
          return [];
        }).catch(function (err) {
          console.error('[EAMS] syncFromAPI fetch error for ' + apiPath + ':', err);
          return [];
        });
    }

    function syncTeacherDirectory() {
      return apiCall('GET', '/teachers').then(function (teacherList) {
        if (!Array.isArray(teacherList)) return DB.get('users');
        var byTrack = {};
        teacherList.forEach(function (t) { if (t.trackId) byTrack[t.trackId] = t; });
        var merged = DB.get('users').map(function (u) {
          if (u.role !== 'teacher' || !u.trackId || !byTrack[u.trackId]) return u;
          var t = byTrack[u.trackId];
          return Object.assign({}, u, {
            dept: t.dept, department: t.department,
            deptId: t.deptId, deptCode: t.deptCode,
            empId: t.empId, employeeNo: t.employeeNo,
            desig: t.desig, designation: t.designation,
            email: t.email, specials: t.specials || [],
            adminRights: t.adminRights || [],
            isHOD: t.isHOD, isClassAdvisor: t.isClassAdvisor,
            isTimeTableCoordinator: t.isTimeTableCoordinator,
            shadowId: u._id,
            _id: t._id
          });
        });
        DB.set('users', merged);
        return merged;
      }).catch(function () { return DB.get('users'); });
    }

    function syncUsersWithTeacherDetails() {
      return syncFromAPI('users', '/users').then(syncTeacherDirectory);
    }

    function syncYearConfig() {
      var tok = getToken();
      if (!tok) return Promise.resolve(YEAR_CONFIG);
      return Promise.all([
        apiCall('GET', '/year/current'),
        apiCall('GET', '/year/batches')
      ]).then(function (results) {
        var current = results[0];
        var batches = results[1];
        YEAR_CONFIG.current = (typeof current === 'string' && current) ? current : '';
        YEAR_CONFIG.batches = Array.isArray(batches) ? batches : [];
        return YEAR_CONFIG;
      }).catch(function () { return YEAR_CONFIG; });
    }

    // Sync all collections — per-task progress tracking for accurate ETA
    function syncAllFromDB(cb, onProgress) {
      dbToast('Fetching from Database…', 'saving');
      var syncStart = Date.now();
      var taskDefs = [
        { name: 'depts', p: syncFromAPI('depts', '/depts') },
        { name: 'classes', p: syncFromAPI('classes', '/classes') },
        { name: 'subjects', p: syncFromAPI('subjects', '/subjects') },
        { name: 'students', p: syncFromAPI('students', '/students') },
        { name: 'users', p: syncUsersWithTeacherDetails() },
        { name: 'assignments', p: syncFromAPI('assignments', '/assignments') },
        { name: 'logs', p: syncFromAPI('logs', '/logs') },
        { name: 'notifications', p: syncFromAPI('notifications', '/notifications') },
        { name: 'yearConfig', p: syncYearConfig() },
      ];
      var pending = taskDefs.map(function (t) { return t.name; });

      // Wrap each promise to track its individual duration and report progress
      var tracked = taskDefs.map(function (task) {
        return task.p.then(function (result) {
          pending = pending.filter(function (n) { return n !== task.name; });
          if (onProgress) onProgress(task.name, pending.slice(), Date.now() - syncStart);
          return result;
        }).catch(function (err) {
          pending = pending.filter(function (n) { return n !== task.name; });
          if (onProgress) onProgress(task.name, pending.slice(), Date.now() - syncStart);
          throw err;
        });
      });

      Promise.all(tracked).then(function (results) {
        var names = ['depts', 'classes', 'subjects', 'students', 'users', 'assignments', 'logs', 'notifications'];
        dbToast('Synced from Database', 'success', results.slice(0, names.length).map(function (r, i) {
          return (Array.isArray(r) ? r.length : 0) + ' ' + names[i];
        }).join(' · '));
        if (cb) cb();
      }).catch(function (err) {
        console.error('[EAMS] syncAllFromDB failed:', err);
        dbToast('Sync failed', 'error');
        if (cb) cb();
      });
    }

    // ── DEPT OPERATIONS ──────────────────────────────────
    function apiAddDept(name, code, number, twoLetterCode, courseType, branch, hodId, hodName) {
      var payload = { name: name, code: code, number: number, twoLetterCode: twoLetterCode, courseType: courseType, branch: branch, hodName: hodName || '' };
      if (hodId) payload.hodId = hodId;
      return apiCall('POST', '/depts', payload)
        .then(function (d) {
          if (d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          return syncFromAPI('depts', '/depts').then(function () {
            return d;
          });
        });
    }

    function apiUpdateDept(id, name, code, number, courseType, branch, hodId, hodName) {
      var payload = { name: name, code: code, number: number, courseType: courseType, branch: branch, hodName: hodName || '' };
      if (hodId) payload.hodId = hodId; // only include hodId when non-empty
      return apiCall('PUT', '/depts/' + id, payload)
        .then(function (d) {
          if (d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          return syncFromAPI('depts', '/depts').then(function () {
            return d;
          });
        });
    }

    function apiDeleteDept(id, name) {
      dbToast('Deleting department…', 'saving', '"' + name + '"');
      return apiCall('DELETE', '/depts/' + id)
        .then(function () {
          return syncFromAPI('depts', '/depts').then(function () {
            dbToast('Department deleted', 'success', '"' + name + '" removed from Database');
          });
        });
    }

    // ── CLASS OPERATIONS ─────────────────────────────────
    function apiAddClass(data) {
      dbToast('Adding class…', 'saving', data.name);
      return apiCall('POST', '/classes', data)
        .then(function (d) {
          if (d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          return syncFromAPI('classes', '/classes').then(function () {
            dbToast('Class added', 'success', '"' + data.name + '" → Database');
            return d;
          });
        });
    }

    function apiDeleteClass(id, name) {
      dbToast('Deleting class…', 'saving', '"' + name + '"');
      return apiCall('DELETE', '/classes/' + id)
        .then(function () {
          return syncFromAPI('classes', '/classes').then(function () {
            dbToast('Class deleted', 'success', '"' + name + '" removed');
          });
        });
    }

    function apiUpdateClass(id, data) {
      dbToast('Updating class…', 'saving', data.name);
      return apiCall('PUT', '/classes/' + id, data)
        .then(function (d) {
          if (d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          return syncFromAPI('classes', '/classes').then(function () {
            dbToast('Class updated', 'success', '"' + data.name + '" → Database');
            return d;
          });
        });
    }

    // ── SUBJECT OPERATIONS ───────────────────────────────
    function apiAddSubject(data) {
      dbToast('Adding subject…', 'saving', data.name);
      return apiCall('POST', '/subjects', data)
        .then(function (d) {
          if (d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          return syncFromAPI('subjects', '/subjects').then(function () {
            dbToast('Subject added', 'success', '"' + data.name + '" → Database');
            return d;
          });
        });
    }

    function apiUpdateSubject(id, data) {
      dbToast('Updating subject…', 'saving', data.name);
      return apiCall('PUT', '/subjects/' + id, data)
        .then(function (d) {
          if (d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          return syncFromAPI('subjects', '/subjects').then(function () {
            dbToast('Subject updated', 'success', '"' + data.name + '" → Database');
            return d;
          });
        });
    }

    function apiDeleteSubject(id, name) {
      dbToast('Deleting subject…', 'saving', '"' + name + '"');
      return apiCall('DELETE', '/subjects/' + id)
        .then(function () {
          return syncFromAPI('subjects', '/subjects').then(function () {
            dbToast('Subject deleted', 'success', '"' + name + '" removed');
          });
        });
    }

    // ── TEACHER OPERATIONS ──────────────────────────────
    function _refreshTeacherList() {
      var dept = document.getElementById('tf-dept') ? document.getElementById('tf-dept').value : '';
      var params = dept ? '?deptId=' + encodeURIComponent(dept) : '';
      apiCall('GET', '/teachers' + params)
        .then(function (list) {
          _teacherData = Array.isArray(list) ? list : [];
          _renderTeacherGrid(_teacherData);
        })
        .catch(function () { });
    }

    function apiAddTeacher(data) {
      dbToast('Adding teacher…', 'saving', data.name);
      return apiCall('POST', '/teachers', data)
        .then(function (d) {
          if (d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          return syncUsersWithTeacherDetails().then(function () {
            _refreshTeacherList();
            dbToast('Teacher added', 'success', '"' + data.name + '" (' + data.username + ') → Database\nPassword: ' + data.password);
            return d;
          });
        });
    }

    function apiDeleteTeacher(id, name) {
      dbToast('Deleting teacher…', 'saving', '"' + name + '"');
      return apiCall('DELETE', '/teachers/' + id)
        .then(function (d) {
          if (d && d.error) { dbToast('Error: ' + d.error, 'error'); throw new Error(d.error); }
          return syncUsersWithTeacherDetails().then(function () {
            _refreshTeacherList();
            dbToast('Teacher deleted', 'success', '"' + name + '" removed from DB — undoable 10 days');
          });
        });
    }

    function apiUpdateTeacher(id, data, name) {
      dbToast('Updating teacher…', 'saving', name);
      return apiCall('PUT', '/teachers/' + id, data)
        .then(function (d) {
          if (d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          return syncUsersWithTeacherDetails().then(function () {
            _refreshTeacherList();
            dbToast('Teacher updated', 'success', '"' + name + '" → Database');
            return d;
          });
        });
    }

    // ── STUDENT OPERATIONS ──────────────────────────────
    function apiAddStudent(data) {
      dbToast('Adding student…', 'saving', data.name);
      return apiCall('POST', '/students', data)
        .then(function (d) {
          if (d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          return syncFromAPI('students', '/students').then(function () {
            dbToast('Student added', 'success', '"' + data.name + '" → Database');
            return d;
          });
        });
    }

    function apiDeleteStudent(id, name) {
      dbToast('Deleting student…', 'saving', '"' + name + '"');
      return apiCall('DELETE', '/students/' + id)
        .then(function () {
          return syncFromAPI('students', '/students').then(function () {
            dbToast('Student deleted', 'success', '"' + name + '" removed');
          });
        });
    }

    function apiUpdateStudent(id, data, name) {
      dbToast('Updating student…', 'saving', name);
      return apiCall('PUT', '/students/' + id, data)
        .then(function (d) {
          if (d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          return syncFromAPI('students', '/students').then(function () {
            dbToast('Student updated', 'success', '"' + name + '" → Database');
            return d;
          });
        });
    }

    // ── SETTINGS OPERATIONS (in-memory cache — DB server is source of truth) ──
    var _memSettings = {};

    function apiGetSettings() {
      return apiCall('GET', '/settings').then(function (d) {
        if (!d.error) _memSettings = d;
        return d;
      });
    }

    function apiSaveSetting(key, value, label) {
      dbToast('Saving ' + (label || key) + '…', 'saving');
      return apiCall('PUT', '/settings/' + key, { value: value })
        .then(function (d) {
          if (d && d.error) { dbToast('Error: ' + d.error, 'error'); return null; }
          _memSettings[key] = value;
          dbToast((label || key) + ' saved', 'success', 'Updated in Database');
          return d;
        });
    }

    // ═══════════════════════════════════════════════════════
    //  SPECIAL DELETE PASSWORD
    // ═══════════════════════════════════════════════════════

    var _specialPwCallback = null;

    function requireSpecialPw(cb) {
      _specialPwCallback = cb;
      document.getElementById('sppw-input').value = '';
      document.getElementById('sppw-err').style.display = 'none';
      openModal_('m-special-pw');
    }

    function verifySpecialPw() {
      var pw = document.getElementById('sppw-input').value.trim();
      var errEl = document.getElementById('sppw-err');
      errEl.style.display = 'none';
      if (!pw) { errEl.textContent = 'Enter password.'; errEl.style.display = 'block'; return; }
      dbToast('Verifying password…', 'saving');
      apiCall('POST', '/settings/verify-delete-password', { password: pw })
        .then(function (d) {
          if (d.valid) {
            closeModalBg('m-special-pw');
            dbToast('Verified', 'success');
            if (_specialPwCallback) { _specialPwCallback(); _specialPwCallback = null; }
          } else {
            errEl.textContent = d.error || 'Incorrect password.';
            errEl.style.display = 'block';
            dbToast('Wrong password', 'error');
          }
        }).catch(function () {
          errEl.textContent = 'Server error.';
          errEl.style.display = 'block';
        });
    }

    // Wrap confirm dialog to require special password for deletions
    function openDangerConfirm(id, msg, cb) {
      requireSpecialPw(function () {
        document.getElementById('dc-confirm-id').value = id || '';
        document.getElementById('dc-confirm-msg').textContent = msg;
        document.getElementById('dc-confirm-btn').onclick = cb;
        openModal_('m-dc-confirm');
      });
    }

    function openClearStorageModal() {
      document.querySelectorAll('.clr-chk').forEach(function (c) { c.checked = false; });
      document.getElementById('clr-all').checked = false;
      openModal_('m-clear-storage');
    }

    function toggleClearAll(master) {
      document.querySelectorAll('.clr-chk').forEach(function (c) { c.checked = master.checked; });
    }

    function confirmClearStorage() {
      var checked = Array.from(document.querySelectorAll('.clr-chk:checked')).map(function (c) { return c.value; });
      if (!checked.length) {
        showToast('Nothing selected, Tick at least one item to clear.');
        return;
      }

      var cleared = [];
      var loggedOut = false;

      dbToast('Clearing…', 'saving');

      checked.forEach(function (key) {
        if (key === 'settings') {
          _memSettings = {};
          cleared.push('Settings');

        } else if (key === 'session_token') {
          sessionStorage.removeItem('eams_token');
          cleared.push('Auth Token');
          loggedOut = true;

        } else if (key === 'session_user') {
          sessionStorage.removeItem('eams_user');
          cleared.push('Session User');

        } else {
          delete _memStore['ss3_' + key];
          cleared.push(key.charAt(0).toUpperCase() + key.slice(1));
        }
      });

      closeModalBg('m-clear-storage');
      dbToast('Cache cleared', 'success', cleared.join(' · ') + ' removed — Database unaffected.');

      if (loggedOut) {
        setTimeout(function () { doLogout(); }, 1200);
        return;
      }
      var allMain = ['depts', 'classes', 'subjects', 'students', 'users', 'assignments', 'attendance', 'notifications', 'logs'];
      var clearedAllMain = allMain.every(function (k) { return checked.indexOf(k) !== -1; });
      if (clearedAllMain) {
        setTimeout(function () { syncAllFromDB(); }, 600);
      }

    }

    // ── Teacher card click delegation ─────────────────────────────────────────
    (function () {
      var tgr = document.getElementById('tgr');
      if (!tgr) return;
      tgr.addEventListener('click', function (e) {
        var target = e.target.closest('[data-id]');
        if (!target) return;
        openTD(target.getAttribute('data-id'));
      });
    })();
  
// openModal wrapper for admin page modals
function openModal(id) { var el = document.getElementById(id); if (el) { el.style.display = 'flex'; el.classList.add('open'); } }
