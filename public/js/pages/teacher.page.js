// -- State ----------------------------------------------
var _memStore = {};
  const DB = {
    get: function(collection) {
      try { return _memStore['ss3_' + collection] || []; }
      catch (e) { return []; }
    },
    set: function(collection, data) {
      _memStore['ss3_' + collection] = data;
    },
    insert: function(collection, doc) {
      const rows = DB.get(collection);
      doc._id = '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      rows.push(doc);
      DB.set(collection, rows);
      return doc;
    },
    update: function(collection, id, updates) {
      const rows  = DB.get(collection);
      const index = rows.findIndex(function(row) { return row._id === id; });
      if (index >= 0) {
        rows[index] = Object.assign({}, rows[index], updates);
        DB.set(collection, rows);
        return rows[index];
      }
      return null;
    },
    delete: function(collection, id) {
      DB.set(collection, DB.get(collection).filter(function(row) { return row._id !== id; }));
    },
    one: function(collection, query) {
      query = query || {};
      return DB.get(collection).find(function(doc) {
        return Object.keys(query).every(function(key) { return doc[key] === query[key]; });
      }) || null;
    }
  };

  // ─── DATE CONSTANTS ─────────────────────────────────────────────────────────
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function formatDateLong(isoDate) {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatDateShort(isoDate) {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  function timeAgo(isoDate) {
    const diffSeconds = (Date.now() - new Date(isoDate)) / 1000;
    if (diffSeconds < 60)    return 'just now';
    if (diffSeconds < 3600)  return Math.floor(diffSeconds / 60)  + 'm ago';
    if (diffSeconds < 86400) return Math.floor(diffSeconds / 3600) + 'h ago';
    return Math.floor(diffSeconds / 86400) + 'd ago';
  }

  function showToast(msg, state, details) {
    if (typeof dbToast === 'function') {
      var s = state === 'warn' || state === 'error' ? 'error' : (state === 'info' || state === 'saving' ? 'saving' : 'success');
      dbToast(msg, s, details);
    }
  }

  // ─── SEED / INITIAL DATA ────────────────────────────────────────────────────
  function ensureDB() {
    // No default seeding — data comes from admin uploads
  }

  // ─── AUTHENTICATION ──────────────────────────────────────────────────────────
  let currentUser = null;
  function logToServer(action, details, category) {
    var tok = getToken();
    if (!tok) return;
    fetch('/api/logs', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
      body: JSON.stringify({ action:action, details:details||'', category:category||'general', role:'teacher' })
    }).catch(function(){});
  }

  // ── Session Auto-Logout after 45 minutes
  (function() {
    function checkSessionExpiry() {
      var loginTime = sessionStorage.getItem('eams_login_time');
      if (loginTime) {
        var elapsed = Date.now() - parseInt(loginTime, 10);
        if (elapsed > 45 * 60 * 1000) {
          if (typeof toast === 'function') {
            toast('⚠️ Session expired. Logging out...', 'error');
          }
          setTimeout(function() {
            doLogout();
          }, 1500);
        }
      }
    }
    checkSessionExpiry();
    setInterval(checkSessionExpiry, 15000);
  })();

  function toggleSidebar() {
    const sidebar      = document.getElementById('sidebar');
    const mainContent  = document.getElementById('maincontent');
    const toggleButton = document.getElementById('sbtoggle');
    const overlay      = document.getElementById('sb-overlay-t');
    const isMobile     = window.innerWidth <= 768;

    if (isMobile) {
      const isOpen = sidebar.classList.toggle('sb-mobile-open');
      if (overlay) overlay.classList.toggle('visible', isOpen);
      toggleButton.innerHTML = isOpen ? '✖' : '☰';
    } else {
      const isHidden = sidebar.classList.toggle('sb-hidden');
      mainContent.classList.toggle('sb-expanded', isHidden);
      toggleButton.classList.toggle('closed', isHidden);
      toggleButton.innerHTML = isHidden ? '☰' : '✖';
    }
  }

  function goToTimetable() {
    // eams_user + eams_token already in sessionStorage — timetable.html reads them
    window.location.href = 'timetable.html';
  }

  // ─── LIVE PROFILE & ASSIGNMENT SYNC ──────────────────────────────────────────
  // currentUser (set at login from sessionStorage) only ever carried _id/name/
  // username/role — dept/empId/desig/email/specials were never fetched, and
  // nothing in this file called /api/assignments either. That's why My Profile
  // and "Assigned Classes" were always empty: there was no code path that could
  // have populated them, regardless of what's actually in the Database.
  function syncMyProfile() {
    var tok = getToken();
    if (!tok) return Promise.resolve(null);
    return fetch('/api/profile/me', { headers: { 'Authorization': 'Bearer ' + tok } })
      .then(function(r) { return r.json(); })
      .then(function(p) {
        if (!p || p.error) return null;
        currentUser = Object.assign({}, currentUser, {
          _id: p._id || currentUser._id,
          name: p.name || currentUser.name,
          username: p.username || currentUser.username,
          empId: p.employeeNo || '',
          dept: p.department || '',
          desig: p.designation || '',
          email: p.email || '',
          isHOD: !!p.isHod,
          HoddeptName: p.HoddeptName || '',
          isClassAdvisor: !!p.isClassAdvisor,
          advisorClassName: p.className || '',
          isTimeTableCoordinator: !!p.isTimeTableCoordinator,
          TTdeptName: p.TTdeptName || '',
          isWarden: !!p.isWarden,
          isExamCoordinator: !!p.isExamCoordinator,
          isPlacementCoordinator: !!p.isPlacementCoordinator,
          isAdmin: !!p.isAdmin,
          adminRights: p.adminRights || ''
        });
        sessionStorage.setItem('eams_user', JSON.stringify(currentUser));

        // Refresh the bits of chrome that were drawn with stale/blank values
        // before this fetch resolved.
        var deptEl = document.getElementById('tpdept');
        if (deptEl) deptEl.textContent = currentUser.dept || 'Sri Shakthi';
        if (currentUser.isTimeTableCoordinator) {
          var badge = document.getElementById('sn-tt-badge');
          if (badge) badge.style.display = 'inline-block';
        }
        if (currentUser.isAdmin) {
          var adminHubBtn = document.getElementById('sn-admin-hub');
          if (adminHubBtn) adminHubBtn.style.display = 'flex';
        }
        return currentUser;
      }).catch(function() { return null; });
  }

  function syncMyAssignments() {
    var tok = getToken();
    if (!tok) return Promise.resolve([]);
    // No query params needed — /api/assignments filters to the logged-in
    // teacher's own records server-side (req.user._id), same id as currentUser._id.
    return fetch('/api/assignments', { headers: { 'Authorization': 'Bearer ' + tok } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var rows = Array.isArray(data) ? data : [];
        DB.set('assignments', rows);
        return rows;
      }).catch(function() { return []; });
  }

  // ─── syncMyStudents ───────────────────────────────────────────────────────────
  // Fetches /api/students?classId=X for every class in the teacher's assignments
  // and stores the deduplicated result in the render cache (DB). Called after
  // syncMyAssignments() has populated DB.get('assignments').
  function syncMyStudents() {
    var tok = getToken();
    if (!tok) return Promise.resolve([]);
    var myClasses = getMyClasses();
    if (!myClasses.length) return Promise.resolve([]);

    var promises = myClasses.map(function(c) {
      return fetch('/api/students?classId=' + encodeURIComponent(c.id), {
        headers: { 'Authorization': 'Bearer ' + tok }
      })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(d) {
        if (Array.isArray(d)) return d;
        if (d && Array.isArray(d.data)) return d.data;
        if (d && Array.isArray(d.students)) return d.students;
        return [];
      })
      .catch(function() { return []; });
    });

    return Promise.all(promises).then(function(results) {
      var flat = results.reduce(function(acc, arr) { return acc.concat(arr); }, []);
      var seen = Object.create(null);
      var unique = flat.filter(function(s) {
        var key = String(s._id);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
      DB.set('students', unique);
      return unique;
    });
  }

  // ─── syncMyAttendance ────────────────────────────────────────────────────────
  // Fetches the last 90 days of this teacher's attendance from /api/attendance
  // and stores it in the render cache for the dashboard chart, defaulters mini
  // widget, and today's schedule "already marked" check.
  // Report pages (renderAttendanceRecord, renderDefaultersList) call
  // fetchAttendanceForReport() independently so they can honour arbitrary filters.
  function syncMyAttendance() {
    var tok = getToken();
    if (!tok) return Promise.resolve([]);
    var to = todayISO();
    var from90 = new Date();
    from90.setDate(from90.getDate() - 90);
    var from = from90.toISOString().split('T')[0];
    return fetch(
      '/api/attendance?teacherId=' + encodeURIComponent(currentUser._id)
        + '&from=' + from + '&to=' + to,
      { headers: { 'Authorization': 'Bearer ' + tok } }
    )
    .then(function(r) { return r.ok ? r.json() : []; })
    .then(function(data) {
      var rows = Array.isArray(data) ? data : [];
      DB.set('attendance', rows);
      return rows;
    })
    .catch(function() { return []; });
  }

  // ─── fetchAttendanceForReport ─────────────────────────────────────────────────
  // On-demand attendance fetch used by the Attendance Record and Defaulters
  // report pages. Passes the current UI filter values as query params so the
  // server does the heavy filtering; only subjectId is client-side (not a param
  // the attendance route supports).
  function fetchAttendanceForReport(classId, subjectId, from, to) {
    var tok = getToken();
    if (!tok) return Promise.resolve([]);
    var url = '/api/attendance?teacherId=' + encodeURIComponent(currentUser._id);
    if (classId) url += '&classId=' + encodeURIComponent(classId);
    if (from && to) url += '&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
    return fetch(url, { headers: { 'Authorization': 'Bearer ' + tok } })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(data) { return Array.isArray(data) ? data : []; })
      .catch(function() { return []; });
  }

  function bootApp() {
    document.getElementById('app').classList.add('vis');
    document.getElementById('tpav').textContent    = currentUser.name[0];
    document.getElementById('tpname').textContent  = currentUser.name;
    document.getElementById('tpdept').textContent  = currentUser.dept || 'Sri Shakthi';
    document.getElementById('datelbl').textContent =
      new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    // Show COORD badge on Timetable menu if teacher is a TT coordinator
    if (currentUser.isTimeTableCoordinator) {
      var badge = document.getElementById('sn-tt-badge');
      if (badge) badge.style.display = 'inline-block';
    }
    populateAllFilters();
    initCalendar();
    renderNotifications();
    syncTeacherNotifications();
    setInterval(syncTeacherNotifications, 30000);
    
    var urlParams = new URLSearchParams(window.location.search);
    var initialTab = urlParams.get('tab') || urlParams.get('page') || 'dash';
    nav(initialTab);

    // Pull the real profile + assignment data from the Database now that the
    // shell is visible. Re-render whichever page is currently active once it
    // lands, so the initial dash render (drawn from empty cache) gets corrected.
    Promise.all([syncMyProfile(), syncMyAssignments()]).then(function() {
      populateAllFilters(); // class/subject dropdowns are built from assignments
      // Now that assignments are loaded we can fetch students (by classId) and
      // the teacher's recent attendance in parallel.
      return Promise.all([syncMyStudents(), syncMyAttendance()]);
    }).then(function() {
      populateAllFilters(); // refresh filters with real class/subject names
      if (document.getElementById('pg-dash').classList.contains('act'))    initDashboard();
      if (document.getElementById('pg-profile').classList.contains('act')) initProfilePage();
    });
  }

  // ─── NAVIGATION ──────────────────────────────────────────────────────────────
  function nav(pageName) {
    const validTabs = ['dash', 'sched', 'att', 'rep-att', 'rep-def', 'rep-stu', 'leaves', 'griev', 'profile'];
    if (validTabs.indexOf(pageName) === -1) pageName = 'dash';

    if (window.history && window.history.replaceState) {
      var url = new URL(window.location);
      url.searchParams.set('tab', pageName);
      window.history.replaceState(null, '', url);
    }

    document.querySelectorAll('.pg').forEach(function(p) { p.classList.remove('act'); });
    const targetPage = document.getElementById('pg-' + pageName);
    if (targetPage) targetPage.classList.add('act');

    document.querySelectorAll('.sb-item,.ss').forEach(function(item) { item.classList.remove('act'); });

    const navMap = {
      'dash':    'sn-dash',  'sched':   'sn-sched', 'att':     'sn-att',
      'rep-att': 'sn-ratt',  'rep-def': 'sn-rdef',  'rep-stu': 'sn-stu',
      'leaves':  'sn-leaves','griev':   'sn-griev'
    };
    if (navMap[pageName]) {
      const navEl = document.getElementById(navMap[pageName]);
      if (navEl) navEl.classList.add('act');
    }

    const pageActions = {
      'dash':    initDashboard,
      'sched':   function() { switchSchedTab(currentSchedTab || 'week'); },
      'att':     initAttendancePage,
      'rep-att': function() { populateReportFilters(); renderAttendanceRecord(); },
      'rep-def': function() { populateDefaulterFilters(); renderDefaultersList(); },
      'rep-stu': function() { populateStudentListFilters(); renderStudentList(); },
      'leaves':  loadTeacherLeaveHistory,
      'griev':   renderGrievances,
      'profile': function() { initProfilePage(); syncMyProfile().then(initProfilePage); }
    };
    if (pageActions[pageName]) pageActions[pageName]();
  }

  // ─── TEACHER HELPER FUNCTIONS ────────────────────────────────────────────────
  function getMyAssignments() {
    var list = DB.get('assignments') || [];
    if (!currentUser) return list;
    var myIds = [
      String(currentUser._id || ''),
      String(currentUser.roleId || ''),
      String(currentUser.id || ''),
      String(currentUser.empId || '')
    ].filter(Boolean);

    var filtered = list.filter(function(a) {
      if (!a) return false;
      if (!a.teacherId) return true;
      return myIds.indexOf(String(a.teacherId)) !== -1 ||
             (currentUser.name && a.teacherName && a.teacherName.toLowerCase() === currentUser.name.toLowerCase());
    });
    return filtered.length > 0 ? filtered : list;
  }

  function getMyClasses() {
    const seen = new Map();
    getMyAssignments().forEach(function(a) {
      if (!seen.has(a.classId)) seen.set(a.classId, { id: a.classId, name: a.className });
    });
    return Array.from(seen.values());
  }

  function getMySubjects() {
    const seen = new Map();
    getMyAssignments().forEach(function(a) {
      if (!seen.has(a.subjectId)) seen.set(a.subjectId, { id: a.subjectId, name: a.subjectName });
    });
    return Array.from(seen.values());
  }

  function buildClassOptions(includeAll) {
    const allOption = includeAll ? '<option value="">All</option>' : '<option value="">— Select —</option>';
    return allOption + getMyClasses().map(function(c) {
      return '<option value="' + c.id + '">' + c.name + '</option>';
    }).join('');
  }

  function buildSubjectOptions(includeAll) {
    const allOption = includeAll ? '<option value="">All</option>' : '<option value="">— Select —</option>';
    return allOption + getMySubjects().map(function(s) {
      return '<option value="' + s.id + '">' + s.name + '</option>';
    }).join('');
  }

  function populateAllFilters() {
    // Populate class dropdowns
    ['fc', 'rfc', 'dfc', 'slc'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = buildClassOptions(true);
    });

    // Populate subject dropdowns
    ['fs', 'rfs', 'dfs'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = buildSubjectOptions(true);
    });

    // Attendance take page class selector
    const attClassEl = document.getElementById('attcls');
    if (attClassEl) attClassEl.innerHTML = buildClassOptions(false);

    // Set default date range (last 7 days)
    const today       = todayISO();
    const weekAgo     = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoISO  = weekAgo.toISOString().split('T')[0];

    ['ff', 'rff'].forEach(function(id) { const el = document.getElementById(id); if (el) el.value = weekAgoISO; });
    ['ft', 'rft'].forEach(function(id) { const el = document.getElementById(id); if (el) el.value = today;      });

    // Default attendance date to today
    const attDateEl = document.getElementById('attdate');
    if (attDateEl && !attDateEl.value) attDateEl.value = today;

    // Schedule modal class selector
    document.getElementById('schedcls').innerHTML = buildClassOptions(false);
  }

  function populateReportFilters() {
    document.getElementById('rfc').innerHTML = buildClassOptions(true);
    document.getElementById('rfs').innerHTML = buildSubjectOptions(true);
  }

  function populateDefaulterFilters() {
    document.getElementById('dfc').innerHTML = buildClassOptions(true);
    document.getElementById('dfs').innerHTML = buildSubjectOptions(true);
  }

  function populateStudentListFilters() {
    document.getElementById('slc').innerHTML = buildClassOptions(true);
  }

  // ─── DASHBOARD ───────────────────────────────────────────────────────────────
  function initDashboard() {
    const firstName = currentUser.name.split(' ')[0];
    document.getElementById('dashsub').textContent = 'Welcome back, ' + firstName + '! Here\'s your day at a glance.';
    document.getElementById('todaylbl').textContent =
      new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    renderTodaySchedule(todayISO());
    renderDefaultersMini();
    renderAttendanceChart();
    renderCalendar();
  }
  var initDash = initDashboard;

  function renderTodaySchedule(dateISO) {
    const dayOfWeek   = new Date(dateISO + 'T00:00:00').getDay();
    const dayName     = DAY_NAMES[dayOfWeek];
    const timetable   = DB.get('timetable')
      .filter(function(t) { return t.teacherId === currentUser._id && t.day === dayName; })
      .sort(function(a, b) { return a.start.localeCompare(b.start); });

    const attendance  = DB.get('attendance');
    const isToday     = dateISO === todayISO();

    const dateLabelEl = document.getElementById('todaylbl');
    if (dateLabelEl) {
      dateLabelEl.textContent = new Date(dateISO + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    }

    const containerEl = document.getElementById('todaysched');
    if (!timetable.length) {
      containerEl.innerHTML = '<div class="est"><span class="ei">&#128205;</span><p style="font-size:12px;">No classes on this day.</p></div>';
      return;
    }

    containerEl.innerHTML = timetable.map(function(slot) {
      const alreadyMarked = attendance.some(function(a) {
        return a.classId === slot.classId && a.subjectId === slot.subjectId && a.date === dateISO;
      });

      let actionHtml;
      if (alreadyMarked) {
        actionHtml = '<div class="donetag">&#9989; Done</div>';
      } else if (isToday) {
        actionHtml = '<button class="attbtn" onclick="navigateToAttendance(\'' + slot.classId + '\',\'' + slot.subjectId + '\')">Take Att.</button>';
      } else {
        actionHtml = '<div style="font-size:10px;color:var(--tdi);">–</div>';
      }

      const cardClass = 'scard ' + (isToday && !alreadyMarked ? 'uc' : alreadyMarked ? 'dn' : '');
      return '<div class="' + cardClass + '">'
        + '<div class="stb"><div class="t">' + slot.start + '</div><span class="d">–' + slot.end + '</span></div>'
        + '<div class="sinfo"><div class="scls">' + slot.className + '</div><div class="ssub">' + slot.subjectName + '</div></div>'
        + actionHtml
        + '</div>';
    }).join('');
  }

  // Navigate to the attendance page with a specific class/subject pre-selected
  function navigateToAttendance(classId, subjectId) {
    nav('att');
    setTimeout(function() {
      const classEl = document.getElementById('attcls');
      if (classEl) { classEl.value = classId; loadSubjectsForClass(); }
      setTimeout(function() {
        const subjectEl = document.getElementById('attsub');
        if (subjectEl) subjectEl.value = subjectId;
      }, 150);
    }, 200);
  }
  var navAtt = navigateToAttendance;

  function renderDefaultersMini() {
    const allAttendance = DB.get('attendance');
    const allStudents   = DB.get('students');
    const defaulterList = [];

    getMyAssignments().forEach(function(assignment) {
      allStudents.filter(function(s) { return s.classId === assignment.classId; }).forEach(function(student) {
        const stuAtt = allAttendance.filter(function(a) {
          return a.studentId === student._id && a.subjectId === assignment.subjectId && a.teacherId === currentUser._id;
        });
        if (!stuAtt.length) return;
        const pct = Math.round(stuAtt.filter(function(a) { return a.status === 'present'; }).length / stuAtt.length * 100);
        if (pct < 75) defaulterList.push(Object.assign({}, student, { pct: pct, subjectName: assignment.subjectName }));
      });
    });

    document.getElementById('defcnt').textContent = defaulterList.length;
    const containerEl = document.getElementById('defmini');

    if (!defaulterList.length) {
      containerEl.innerHTML = '<div class="est"><span class="ei">&#127881;</span><p style="font-size:12px;">No defaulters!</p></div>';
      return;
    }

    containerEl.innerHTML = defaulterList.slice(0, 5).map(function(d) {
      return '<div class="defrow">'
        + '<div class="defav">' + d.name[0] + '</div>'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:11.5px;font-weight:700;color:var(--td);">' + d.name + '</div>'
        + '<div style="font-size:10px;color:var(--tdi);">' + d.regNo + ' · ' + d.subjectName + '</div>'
        + '</div>'
        + '<div style="font-size:13px;font-weight:800;color:#dc2626;">' + d.pct + '%</div>'
        + '</div>';
    }).join('');
  }

  // ─── ATTENDANCE CHART ────────────────────────────────────────────────────────
  function setRange(rangeType) {
    // Remove active class from all range pills
    ['rpw','rplw','rpm'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('act');
    });

    const today = new Date();
    let fromDate, toDate = today.toISOString().split('T')[0];

    if (rangeType === 'week') {
      document.getElementById('rpw').classList.add('act');
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      fromDate = monday.toISOString().split('T')[0];
    } else if (rangeType === 'lweek') {
      document.getElementById('rplw').classList.add('act');
      const lastMon = new Date(today);
      lastMon.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
      fromDate = lastMon.toISOString().split('T')[0];
      const lastFri = new Date(lastMon);
      lastFri.setDate(lastMon.getDate() + 4);
      toDate   = lastFri.toISOString().split('T')[0];
    } else {
      // 'month'
      document.getElementById('rpm').classList.add('act');
      fromDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-01';
    }

    document.getElementById('ff').value = fromDate;
    document.getElementById('ft').value = toDate;
    renderAttendanceChart();
  }

  function renderAttendanceChart() {
    const classFilter   = document.getElementById('fc')  ? document.getElementById('fc').value  : '';
    const subjectFilter = document.getElementById('fs')  ? document.getElementById('fs').value  : '';
    const fromDate      = document.getElementById('ff')  ? document.getElementById('ff').value  : '';
    const toDate        = document.getElementById('ft')  ? document.getElementById('ft').value  : '';

    let attendance = DB.get('attendance').filter(function(a) { return a.teacherId === currentUser._id; });
    if (classFilter)   attendance = attendance.filter(function(a) { return a.classId   === classFilter; });
    if (subjectFilter) attendance = attendance.filter(function(a) { return a.subjectId === subjectFilter; });
    if (fromDate)      attendance = attendance.filter(function(a) { return a.date >= fromDate; });
    if (toDate)        attendance = attendance.filter(function(a) { return a.date <= toDate; });

    // Group by date
    const byDate = {};
    attendance.forEach(function(a) {
      if (!byDate[a.date]) byDate[a.date] = { present: 0, absent: 0 };
      byDate[a.date][a.status === 'present' ? 'present' : 'absent']++;
    });

    const sortedDates = Object.keys(byDate).sort().slice(-14);
    const chartEl     = document.getElementById('bchart');

    if (!sortedDates.length) {
      chartEl.innerHTML = '<div style="text-align:center;width:100%;color:var(--tdi);font-size:12px;align-self:center;">No data for selected filters.</div>';
      ['csv-p','csv-a'].forEach(function(id) { document.getElementById(id).textContent = '—'; });
      document.getElementById('csv-pct').textContent = '—%';
      return;
    }

    let totalPresent = 0, totalAbsent = 0;

    chartEl.innerHTML = sortedDates.map(function(date) {
      const counts  = byDate[date];
      const total   = counts.present + counts.absent;
      const pct     = total ? Math.round(counts.present / total * 100) : 0;
      totalPresent += counts.present;
      totalAbsent  += counts.absent;

      const barClass = pct >= 75 ? 'hi' : pct >= 50 ? 'mi' : 'lo';
      const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2);
      const isToday  = date === todayISO();

      return '<div class="bcol">'
        + '<div class="bout"><span class="bpct">' + pct + '%</span>'
        + '<div class="bpill ' + barClass + '" style="height:' + Math.max(6, pct) + '%;min-height:6px;" title="' + date + ': ' + counts.present + 'P/' + counts.absent + 'A"></div>'
        + '</div>'
        + '<div class="bday ' + (isToday ? 'td' : '') + '">' + dayLabel + '</div>'
        + '</div>';
    }).join('');

    const grandTotal = totalPresent + totalAbsent;
    document.getElementById('csv-p').textContent   = totalPresent;
    document.getElementById('csv-a').textContent   = totalAbsent;
    document.getElementById('csv-pct').textContent = (grandTotal ? Math.round(totalPresent / grandTotal * 100) : 0) + '%';
  }
  var renderChart = renderAttendanceChart;

  // ─── CALENDAR ────────────────────────────────────────────────────────────────
  let calendarYear  = new Date().getFullYear();
  let calendarMonth = new Date().getMonth();
  let selectedCalDate = todayISO();

  function initCalendar() {
    calendarYear  = new Date().getFullYear();
    calendarMonth = new Date().getMonth();
    renderCalendar();
  }
  var initCal = initCalendar;

  function calendarNavigate(direction) {
    calendarMonth += direction;
    if (calendarMonth > 11) { calendarMonth = 0;  calendarYear++; }
    else if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendar();
  }
  var calNav = calendarNavigate;

  function renderCalendar() {
    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
    document.getElementById('calmth').textContent = monthNames[calendarMonth] + ' ' + calendarYear;

    const myTimetable = DB.get('timetable').filter(function(t) { return t.teacherId === currentUser._id; });
    const firstDayOfMonth  = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth      = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const todayDateISO     = todayISO();

    // Build header row
    let calHTML = ['Mo','Tu','We','Th','Fr','Sa','Su'].map(function(d) {
      return '<div class="caldow">' + d + '</div>';
    }).join('');

    // Empty cells before first day
    for (let i = 0; i < (firstDayOfMonth + 6) % 7; i++) {
      calHTML += '<div class="cday emp"></div>';
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const isoDate  = calendarYear + '-' + String(calendarMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const dayOfWk  = new Date(isoDate + 'T00:00:00').getDay();
      const isWeekend = dayOfWk === 0 || dayOfWk === 6;
      const hasClass  = !isWeekend && myTimetable.some(function(t) { return t.day === DAY_NAMES[dayOfWk]; });
      const isToday   = isoDate === todayDateISO;
      const isSelected = isoDate === selectedCalDate && !isToday;

      const classes = ['cday',
        isToday    ? 'today'   : '',
        isSelected ? 'sel'     : '',
        hasClass   ? 'hc'      : '',
        isWeekend  ? 'wknd'    : ''
      ].filter(Boolean).join(' ');

      calHTML += '<div class="' + classes + '" onclick="selectCalendarDate(\'' + isoDate + '\')">' + day + '</div>';
    }

    document.getElementById('calgrid').innerHTML = calHTML;
  }
  var renderCal = renderCalendar;

  function selectCalendarDate(isoDate) {
    selectedCalDate = isoDate;
    renderCalendar();
    renderTodaySchedule(isoDate);
  }
  var selCal = selectCalendarDate;

  // ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
  var _currentReviewLeaveId = null;
  var _currentReviewNotifId = null;

  function syncTeacherNotifications() {
    var tok = getToken();
    if (!tok) return Promise.resolve([]);
    return fetch('/api/notifications', { headers: { 'Authorization': 'Bearer ' + tok } })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(data) {
        var rows = Array.isArray(data) ? data : [];
        DB.set('teacher-notifications', rows);
        renderNotifications();
        return rows;
      }).catch(function() { return []; });
  }

  function renderNotifications() {
    var allNotifs = DB.get('teacher-notifications');
    const unreadCount = allNotifs.filter(function(n) { return !n.read; }).length;
    var nbadge = document.getElementById('nbadge');
    if (nbadge) nbadge.textContent = unreadCount;

    var unreadLeaveCount = allNotifs.filter(function(n) {
      return !n.read && (n.type === 'leave-request' || !!n.leaveRequestId);
    }).length;
    var snBadge = document.getElementById('sn-leave-badge');
    if (snBadge) {
      snBadge.textContent = unreadLeaveCount;
      snBadge.style.display = unreadLeaveCount > 0 ? 'inline-block' : 'none';
    }

    const listEl = document.getElementById('ndlist');
    if (!listEl) return;
    if (!allNotifs.length) {
      listEl.innerHTML = '<div style="padding:28px;text-align:center;color:var(--tdi);font-size:12px;">No notifications.</div>';
      return;
    }

    listEl.innerHTML = allNotifs.slice().reverse().map(function(n) {
      const isLeaveReq = n.type === 'leave-request' || !!n.leaveRequestId;
      const isAlert    = n.type === 'attendance-alert' || n.type === 'alert';
      const isAdminMsg = n.from === 'Administrator';
      const iconCode   = isLeaveReq ? '&#128221;' : (isAlert ? '&#9888;' : (isAdminMsg ? '&#128276;' : '&#8505;'));
      const iconBg     = isLeaveReq ? 'background:rgba(16,185,129,.14);color:#059669;'
                       : (isAlert ? 'background:rgba(245,158,11,.12);color:#92400e;'
                       : isAdminMsg ? 'background:rgba(59,130,246,.1);color:#1d4ed8;'
                       : 'background:var(--gLt);color:var(--gD);');
      const priorityBadge = n.priority && n.priority !== 'Normal'
        ? '<span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:5px;">' + n.priority + '</span>'
        : '';
      const clickAction = isLeaveReq
        ? 'onclick="openLeaveReviewModal(\'' + (n.leaveRequestId || '') + '\',\'' + n._id + '\')"'
        : 'onclick="markNotificationRead(\'' + n._id + '\')"';

      return '<div class="ndi ' + (n.read ? '' : 'unread') + '" ' + clickAction + ' style="cursor:pointer;">'
        + '<div class="ndic" style="' + iconBg + '">' + iconCode + '</div>'
        + '<div style="flex:1;">'
        + '<div style="font-size:12px;font-weight:700;color:var(--td);display:flex;align-items:center;">' + n.from + priorityBadge + '</div>'
        + '<div style="font-size:11px;color:var(--tmu);margin-top:2px;line-height:1.4;">' + n.message + '</div>'
        + '<div style="font-size:10px;color:var(--tdi);margin-top:3px;">' + timeAgo(n.time || n.createdAt) + (isLeaveReq ? ' &bull; <span style="color:var(--gD);font-weight:700;">Click to Review</span>' : '') + '</div>'
        + '</div></div>';
    }).join('');
  }

  function openLeaveReviewModal(leaveRequestId, notifId) {
    if (!leaveRequestId) return;
    _currentReviewLeaveId = leaveRequestId;
    _currentReviewNotifId = notifId;

    document.getElementById('lr-student-info').textContent = 'Loading student details…';
    document.getElementById('lr-stat-pct').textContent = '—%';
    document.getElementById('lr-stat-classes').textContent = '— / —';
    document.getElementById('lr-stat-past-leaves').textContent = '—';
    document.getElementById('lr-dates-display').textContent = '📅 Date: —';
    document.getElementById('lr-reason-display').textContent = 'Loading…';
    document.getElementById('lr-remarks').value = '';

    openModal('m-leave-review');

    var tok = getToken();
    fetch('/api/leave/detail/' + encodeURIComponent(leaveRequestId), {
      headers: { 'Authorization': 'Bearer ' + tok }
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error || !d.leaveRequest) {
        showToast(d.error || 'Failed to load leave details', 'warn');
        return;
      }
      var req = d.leaveRequest;
      var stats = d.studentStats || {};

      document.getElementById('lr-student-info').textContent = req.studentName + ' (' + req.studentRegNo + ') — ' + req.className;
      
      var pct = stats.overallPercentage !== undefined ? stats.overallPercentage : 100;
      var pctEl = document.getElementById('lr-stat-pct');
      pctEl.textContent = pct + '%';
      pctEl.style.color = pct >= 75 ? 'var(--gD)' : '#dc2626';

      document.getElementById('lr-stat-classes').textContent = (stats.attendedClasses || 0) + ' / ' + (stats.totalClasses || 0);
      
      var pastTotal = (stats.pastLeaveDays || 0) + (stats.pastPermissionDays || 0);
      document.getElementById('lr-stat-past-leaves').textContent = pastTotal + (pastTotal === 1 ? ' Day' : ' Days');

      document.getElementById('lr-category-badge').textContent = req.category === 'Permission' ? ('⏱️ Permission (' + (req.slot || 'Half Day') + ')') : ('🌴 ' + req.leaveType);
      document.getElementById('lr-days-badge').textContent = (req.daysCount || (req.category === 'Permission' ? 0.5 : 1)) + ' Day' + (req.daysCount > 1 ? 's' : '');

      var dateDisplay = req.fromDate === req.toDate ? formatDateLong(req.fromDate) : (formatDateShort(req.fromDate) + ' – ' + formatDateLong(req.toDate));
      document.getElementById('lr-dates-display').textContent = '📅 Date: ' + dateDisplay;
      document.getElementById('lr-reason-display').textContent = '"' + req.reason + '"';

      if (notifId) {
        markNotificationRead(notifId);
      }
    })
    .catch(function() {
      if (typeof dbToast === 'function') dbToast('Error loading leave details', 'error');
    });
  }
  window.openLeaveReviewModal = openLeaveReviewModal;

  function submitLeaveAction(action) {
    if (!_currentReviewLeaveId) return;
    var remarks = document.getElementById('lr-remarks').value;
    var tok = getToken();

    if (typeof dbToast === 'function') dbToast('Submitting ' + action + '…', 'saving');
    fetch('/api/leave/review/' + encodeURIComponent(_currentReviewLeaveId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
      body: JSON.stringify({ action: action, remarks: remarks })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.error) {
        if (typeof dbToast === 'function') dbToast(res.error, 'error');
        return;
      }
      closeModal('m-leave-review');
      if (typeof dbToast === 'function') {
        dbToast('🎉 Leave request ' + action + ' successfully!', 'success');
      }
      syncTeacherNotifications();
      if (document.getElementById('pg-leaves') && document.getElementById('pg-leaves').classList.contains('act')) {
        loadTeacherLeaveHistory();
      }
    })
    .catch(function() {
      if (typeof dbToast === 'function') dbToast('Failed to update leave request', 'error');
    });
  }
  window.submitLeaveAction = submitLeaveAction;

  // ─── TEACHER LEAVE & PERMISSION HISTORY ──────────────────────────────────────
  var _teacherLeaveData = { requests: [], stats: {} };

  function loadTeacherLeaveHistory() {
    var tok = getToken();
    if (!tok) return;

    var tbody = document.getElementById('lh-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--tdi);">Loading leave records…</td></tr>';

    fetch('/api/leave/advisor-requests', {
      headers: { 'Authorization': 'Bearer ' + tok }
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) {
        if (typeof dbToast === 'function') dbToast(d.error, 'error');
        return;
      }
      _teacherLeaveData = {
        requests: Array.isArray(d.requests) ? d.requests : (Array.isArray(d) ? d : []),
        stats: d.stats || {}
      };

      // Update KPI stats
      var stats = _teacherLeaveData.stats;
      var total = stats.total !== undefined ? stats.total : _teacherLeaveData.requests.length;
      var approved = stats.approved !== undefined ? stats.approved : _teacherLeaveData.requests.filter(function(r){ return r.status === 'Approved'; }).length;
      var rejected = stats.rejected !== undefined ? stats.rejected : _teacherLeaveData.requests.filter(function(r){ return r.status === 'Rejected'; }).length;
      var pending = stats.pending !== undefined ? stats.pending : _teacherLeaveData.requests.filter(function(r){ return r.status === 'Pending'; }).length;
      var onduty = stats.onDutyCount !== undefined ? stats.onDutyCount : _teacherLeaveData.requests.filter(function(r){ return r.category === 'Permission' || (r.slot && r.slot !== 'Full Day'); }).length;

      var stTotal = document.getElementById('lh-stat-total'); if (stTotal) stTotal.textContent = total;
      var stAppr  = document.getElementById('lh-stat-approved'); if (stAppr) stAppr.textContent = approved;
      var stRej   = document.getElementById('lh-stat-rejected'); if (stRej) stRej.textContent = rejected;
      var stPend  = document.getElementById('lh-stat-pending'); if (stPend) stPend.textContent = pending;
      var stOd    = document.getElementById('lh-stat-onduty'); if (stOd) stOd.textContent = onduty;

      // Update sidebar badge
      var sbBadge = document.getElementById('sn-leave-badge');
      if (sbBadge) {
        sbBadge.textContent = pending;
        sbBadge.style.display = pending > 0 ? 'inline-block' : 'none';
      }

      filterTeacherLeaveTable();
    })
    .catch(function(err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:#ef4444;">Failed to load leave history.</td></tr>';
      if (typeof dbToast === 'function') dbToast('Error loading leave history', 'error');
    });
  }
  window.loadTeacherLeaveHistory = loadTeacherLeaveHistory;

  function filterTeacherLeaveTable() {
    var list = _teacherLeaveData.requests || [];
    var from = document.getElementById('lh-filter-from') ? document.getElementById('lh-filter-from').value : '';
    var to = document.getElementById('lh-filter-to') ? document.getElementById('lh-filter-to').value : '';
    var cat = document.getElementById('lh-filter-cat') ? document.getElementById('lh-filter-cat').value : '';
    var status = document.getElementById('lh-filter-status') ? document.getElementById('lh-filter-status').value : '';
    var search = document.getElementById('lh-filter-search') ? document.getElementById('lh-filter-search').value.toLowerCase().trim() : '';

    var filtered = list.filter(function(r) {
      if (from && r.toDate < from) return false;
      if (to && r.fromDate > to) return false;
      if (cat && r.category !== cat) return false;
      if (status && r.status !== status) return false;
      if (search) {
        var matchName = (r.studentName || '').toLowerCase().includes(search);
        var matchReg  = (r.studentRegNo || '').toLowerCase().includes(search);
        var matchCls  = (r.className || '').toLowerCase().includes(search);
        if (!matchName && !matchReg && !matchCls) return false;
      }
      return true;
    });

    renderTeacherLeaveTable(filtered);
  }
  window.filterTeacherLeaveTable = filterTeacherLeaveTable;

  function resetTeacherLeaveFilters() {
    if (document.getElementById('lh-filter-from')) document.getElementById('lh-filter-from').value = '';
    if (document.getElementById('lh-filter-to')) document.getElementById('lh-filter-to').value = '';
    if (document.getElementById('lh-filter-cat')) document.getElementById('lh-filter-cat').value = '';
    if (document.getElementById('lh-filter-status')) document.getElementById('lh-filter-status').value = '';
    if (document.getElementById('lh-filter-search')) document.getElementById('lh-filter-search').value = '';
    filterTeacherLeaveTable();
  }
  window.resetTeacherLeaveFilters = resetTeacherLeaveFilters;

  function renderTeacherLeaveTable(list) {
    var tbody = document.getElementById('lh-table-body');
    if (!tbody) return;

    if (!list || !list.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--tdi);">No leave or permission records match the selected filters.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(function(r) {
      var dateDisplay = r.fromDate === r.toDate ? formatDateShort(r.fromDate) : (formatDateShort(r.fromDate) + ' – ' + formatDateShort(r.toDate));
      var statusBg = r.status === 'Approved' ? '#dcfce7' : r.status === 'Rejected' ? '#fee2e2' : r.status === 'Cancelled' ? '#f3f4f6' : '#fef3c7';
      var statusColor = r.status === 'Approved' ? '#166534' : r.status === 'Rejected' ? '#991b1b' : r.status === 'Cancelled' ? '#4b5563' : '#92400e';
      var statusBadge = '<span style="background:' + statusBg + ';color:' + statusColor + ';font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:8px;">' + r.status + '</span>';
      
      var isPending = r.status === 'Pending';
      var actionHtml = isPending
        ? '<button class="btn-form-pri bsm" onclick="openLeaveReviewModal(\'' + r._id + '\')" style="padding:4px 10px;font-size:11px;background:#16a34a;">Review</button>'
        : (r.reviewRemarks ? ('<span style="font-size:11px;color:var(--tmu);">💬 ' + r.reviewRemarks + '</span>') : (r.reviewedBy ? ('<span style="font-size:10.5px;color:var(--tdi);">By ' + r.reviewedBy + '</span>') : '—'));

      var catBadge = r.category === 'Permission'
        ? '<span style="background:#ede9fe;color:#6d28d9;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;">⏱️ Permission</span>'
        : '<span style="background:#f0fdf4;color:#15803d;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;">🌴 ' + r.leaveType + '</span>';

      return '<tr>'
        + '<td style="font-size:11px;color:var(--tdi);white-space:nowrap;">' + formatDateShort(r.createdAt) + '</td>'
        + '<td><strong>' + r.studentName + '</strong><br><span style="font-size:10.5px;color:var(--tmu);">' + r.studentRegNo + '</span></td>'
        + '<td>' + r.className + '</td>'
        + '<td>' + catBadge + '</td>'
        + '<td>' + dateDisplay + (r.slot && r.slot !== 'Full Day' ? (' <span style="font-size:10px;background:var(--gP);padding:1px 5px;border-radius:4px;font-weight:600;">' + r.slot + '</span>') : '') + '</td>'
        + '<td><span style="font-weight:700;">' + (r.daysCount || (r.category === 'Permission' ? 0.5 : 1)) + '</span></td>'
        + '<td style="max-width:180px;white-space:normal;font-size:11.5px;color:var(--td);line-height:1.4;">' + r.reason + '</td>'
        + '<td>' + statusBadge + '</td>'
        + '<td>' + actionHtml + '</td>'
        + '</tr>';
    }).join('');
  }

  function markNotificationRead(id) {
    var tok = getToken();
    fetch('/api/notifications/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
      body: JSON.stringify({ read: true })
    }).catch(function() {});
    DB.update('teacher-notifications', id, { read: true });
    renderNotifications();
  }
  var markNR = markNotificationRead;

  function clearAllNotifications(event) {
    if (event) event.stopPropagation();
    DB.get('teacher-notifications').forEach(function(n) {
      markNotificationRead(n._id);
    });
    renderNotifications();
  }
  var clearNotifs = clearAllNotifications;

  function toggleNotificationDropdown() {
    document.getElementById('ndrop').classList.toggle('open');
    syncTeacherNotifications();
  }
  var togNotif = toggleNotificationDropdown;

  // Close dropdown on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#ndrop') && !e.target.closest('.tb-icon')) {
      document.getElementById('ndrop').classList.remove('open');
    }
  });

  // ─── MY SCHEDULE PAGE ────────────────────────────────────────────────────────
  let scheduleWeekOffset = 0;
  let dayOffset = 0;
  let currentSchedTab = 'week';

  // Fix 9: Tab switching for Week / Day / My Timetable
  function switchSchedTab(tab) {
    currentSchedTab = tab;
    ['week','day','tt'].forEach(function(t) {
      document.getElementById('stab-' + t).classList.toggle('act', t === tab);
      document.getElementById('sched-' + t + '-view').style.display = t === tab ? '' : 'none';
    });
    // Week nav (prev/next week) only shown on week tab
    var navCtrl = document.getElementById('sched-nav-controls');
    if (navCtrl) navCtrl.style.display = tab === 'week' ? 'flex' : 'none';
    if (tab === 'week')     renderSchedulePage();
    else if (tab === 'day') renderDayView();
    else                    renderTimetableGrid();
  }

  function scheduleNavigate(direction) {
    scheduleWeekOffset += direction * 7;
    renderSchedulePage();
  }
  var schedNav = scheduleNavigate;

  // Fix 9: Day View navigation
  function dayNavStep(dir) {
    dayOffset += dir;
    renderDayView();
  }

  // Fix 9: Render single-day schedule
  function renderDayView() {
    var today    = new Date();
    var target   = new Date(today);
    target.setDate(today.getDate() + dayOffset);
    var dateISO  = target.toISOString().split('T')[0];
    var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var dayShort = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var dayName  = dayShort[target.getDay()];
    var isToday  = dateISO === todayISO();

    document.getElementById('daylbl').textContent =
      dayNames[target.getDay()] + ', ' + target.toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'});

    var myTimetable  = DB.get('timetable').filter(function(t) { return t.teacherId === currentUser._id && t.day === dayName; });
    var allAttendance = DB.get('attendance');
    var cont = document.getElementById('dayschedcont');

    if (target.getDay() === 0 || target.getDay() === 6) {
      cont.innerHTML = '<div class="day-empty">&#127774; Weekend — no classes scheduled.</div>';
      return;
    }
    if (!myTimetable.length) {
      cont.innerHTML = '<div class="day-empty">&#128197; No classes scheduled for this day.'
        + (isToday ? '<br><br><button class="btnp bsm" onclick="openAddSlotForDay(\'' + dayName + '\')">+ Add Slot</button>' : '')
        + '</div>';
      return;
    }

    var sorted = myTimetable.slice().sort(function(a,b){ return a.start.localeCompare(b.start); });
    cont.innerHTML = sorted.map(function(slot) {
      var marked = allAttendance.some(function(a) {
        return a.classId === slot.classId && a.subjectId === slot.subjectId && a.date === dateISO && a.teacherId === currentUser._id;
      });
      var attBtn = isToday && !marked
        ? '<button class="attbtn" style="margin-left:auto;" onclick="navigateToAttendance(\'' + slot.classId + '\',\'' + slot.subjectId + '\')">&#9989; Take Attendance</button>'
        : marked ? '<span class="donetag" style="margin-left:auto;">&#9989; Marked</span>' : '';

      return '<div class="day-slot-card' + (isToday ? ' today-slot' : '') + '">'
        + '<div class="day-time-col">' + slot.start + '<br><span style="color:var(--tdi);font-weight:400;">to</span><br>' + slot.end + '</div>'
        + '<div style="flex:1;">'
        + '<div style="font-size:14px;font-weight:700;color:var(--td);margin-bottom:3px;">' + slot.subjectName + '</div>'
        + '<div style="font-size:12px;color:var(--tmu);">&#127979; ' + slot.className + '</div>'
        + '</div>'
        + attBtn
        + '<div style="display:flex;flex-direction:column;gap:5px;margin-left:8px;">'
        + '<button class="btno bsm" onclick="openEditSlot(\'' + slot._id + '\')">&#9999;</button>'
        + '<button class="btno bsm" style="color:#dc2626;" onclick="deleteSlot(\'' + slot._id + '\')">&#128465;</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  // Fix 9: My Timetable — editable weekly grid stored in DB
  function renderTimetableGrid() {
    var days      = ['Mon','Tue','Wed','Thu','Fri'];
    var dayFull   = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    var timetable = DB.get('timetable').filter(function(t) { return t.teacherId === currentUser._id; });

    if (!timetable.length) {
      document.getElementById('tt-grid').innerHTML =
        '<div class="day-empty">&#128203; No timetable slots yet.<br><br>'
        + '<button class="btnp bsm" onclick="openAddSlot()">+ Add Your First Slot</button></div>';
      return;
    }

    // Build table
    var rows = '';
    days.forEach(function(day, i) {
      var slots = timetable.filter(function(t){ return t.day === day; })
                           .sort(function(a,b){ return a.start.localeCompare(b.start); });
      var pillsHtml = slots.length
        ? slots.map(function(s) {
            return '<span class="tt-slot-pill" title="' + s.start + '–' + s.end + '">'
              + s.start + ' ' + s.subjectName + ' <span style="opacity:.6;">(' + s.className + ')</span>'
              + '</span>';
          }).join('')
        : '<span style="color:var(--tdi);font-size:11px;">—</span>';

      rows += '<tr>'
        + '<td style="font-weight:700;color:var(--td);white-space:nowrap;">' + dayFull[i] + '</td>'
        + '<td>' + pillsHtml + '</td>'
        + '<td style="white-space:nowrap;">'
        + '<button class="btno bsm" style="font-size:10px;" onclick="openAddSlotForDay(\'' + day + '\')">+ Add</button>'
        + '</td>'
        + '</tr>';
    });

    document.getElementById('tt-grid').innerHTML =
      '<table class="tt-table">'
      + '<thead><tr><th style="width:110px;">Day</th><th>Classes</th><th style="width:70px;">Edit</th></tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table>'
      + '<div style="margin-top:12px;font-size:11px;color:var(--tdi);">&#128161; Click + Add on any day to add or edit slots. Changes are saved automatically.</div>';
  }

  function renderSchedulePage() {
    const weekDayNames  = ['Mon','Tue','Wed','Thu','Fri'];
    const weekDayFull   = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    const myTimetable   = DB.get('timetable').filter(function(t) { return t.teacherId === currentUser._id; });
    const allAttendance = DB.get('attendance');

    // Calculate the Mon–Fri dates for this week (with offset)
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + scheduleWeekOffset);
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() - ((baseDate.getDay() + 6) % 7));

    const weekDates = weekDayNames.map(function(_, i) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split('T')[0];
    });

    document.getElementById('weeklbl').textContent = formatDateShort(weekDates[0]) + ' – ' + formatDateShort(weekDates[4]);

    let html = '';

    weekDayNames.forEach(function(day, dayIndex) {
      const dateISO = weekDates[dayIndex];
      const isToday = dateISO === todayISO();
      const slots   = myTimetable.filter(function(t) { return t.day === day; })
                        .sort(function(a, b) { return a.start.localeCompare(b.start); });

      html += '<div class="wdblk' + (isToday ? ' today-col' : '') + '">';
      html += '<div class="wdhd" style="padding:10px 12px;flex-wrap:wrap;gap:4px;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;">';
      html += '<span class="wdnm" style="font-size:12.5px;">' + weekDayFull[dayIndex] + '</span>';
      if (isToday) html += '<span class="wdtd">TODAY</span>';
      html += '</div>';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:2px;">';
      html += '<span class="wddt">' + formatDateShort(dateISO) + '</span>';
      html += '<button class="btno bsm" style="font-size:10px;padding:2px 8px!important;border-radius:8px!important;" onclick="openAddSlotForDay(\'' + day + '\')">+ Add</button>';
      html += '</div></div>';

      html += '<div class="wdslots" style="padding:8px 10px;gap:6px;">';
      if (!slots.length) {
        html += '<div style="text-align:center;padding:14px 0;color:var(--tdi);font-size:11px;cursor:pointer;" onclick="openAddSlotForDay(\'' + day + '\')">No classes</div>';
      } else {
        slots.forEach(function(slot) {
          const alreadyMarked = allAttendance.some(function(a) {
            return a.classId === slot.classId && a.subjectId === slot.subjectId && a.date === dateISO && a.teacherId === currentUser._id;
          });

          html += '<div class="slotc" style="flex-direction:column;align-items:stretch;gap:5px;padding:9px 10px;">';
          html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
          html += '<span class="slott" style="min-width:unset;font-size:10px;padding:2px 7px;">' + slot.start + '–' + slot.end + '</span>';

          if (alreadyMarked) {
            html += '<span class="donetag" style="font-size:9px;padding:2px 6px;">&#9989;</span>';
          } else if (isToday) {
            html += '<button class="attbtn" style="font-size:9.5px;padding:2px 8px;" onclick="navigateToAttendance(\'' + slot.classId + '\',\'' + slot.subjectId + '\')">Att.</button>';
          }
          html += '</div>';

          html += '<div><div class="slotcl" style="font-size:11.5px;">' + slot.className + '</div>';
          html += '<div class="slotsb" style="font-size:10.5px;">' + slot.subjectName + '</div></div>';
          html += '<div style="display:flex;gap:4px;">';
          html += '<button class="btno bsm" style="font-size:10px;padding:2px 6px!important;flex:1;" onclick="openEditSlot(\'' + slot._id + '\')">&#9999; Edit</button>';
          html += '<button class="btno bsm" style="font-size:10px;padding:2px 6px!important;color:#dc2626;border-color:rgba(239,68,68,.3);" onclick="deleteSlot(\'' + slot._id + '\')">&#128465;</button>';
          html += '</div></div>';
        });
      }
      html += '</div></div>';
    });

    document.getElementById('schedbyday').innerHTML = html;
  }

  function openAddSlot() {
    document.getElementById('schedeid').value  = '';
    document.getElementById('mschedtit').innerHTML = '&#10133; Add Schedule Slot';
    document.getElementById('schedday').value  = 'Mon';
    document.getElementById('schedst').value   = '08:00';
    document.getElementById('schedet').value   = '09:00';
    document.getElementById('schedcls').innerHTML = buildClassOptions(false);
    document.getElementById('schedsub').innerHTML = '<option value="">— Select —</option>';
    openModal('msched');
  }

  function openAddSlotForDay(day) {
    openAddSlot();
    document.getElementById('schedday').value = day;
  }
  var openAddSlotDay = openAddSlotForDay;

  function openEditSlot(slotId) {
    const slot = DB.get('timetable').find(function(t) { return t._id === slotId; });
    if (!slot) return;
    document.getElementById('schedeid').value  = slotId;
    document.getElementById('mschedtit').innerHTML = '&#9999; Edit Schedule Slot';
    document.getElementById('schedday').value  = slot.day;
    document.getElementById('schedst').value   = slot.start;
    document.getElementById('schedet').value   = slot.end;
    document.getElementById('schedcls').innerHTML = buildClassOptions(false);
    document.getElementById('schedsub').innerHTML = '<option value="">— Select —</option>';
    openModal('msched');
    setTimeout(function() {
      document.getElementById('schedcls').value = slot.classId;
      populateScheduleSubjects();
      setTimeout(function() { document.getElementById('schedsub').value = slot.subjectId; }, 100);
    }, 50);
  }

  function populateScheduleSubjects() {
    const classId = document.getElementById('schedcls').value;
    const relatedAssignments = getMyAssignments().filter(function(a) { return a.classId === classId; });
    document.getElementById('schedsub').innerHTML = '<option value="">— Select —</option>'
      + relatedAssignments.map(function(a) {
          return '<option value="' + a.subjectId + '">' + a.subjectName + '</option>';
        }).join('');
  }
  var populateSchedSubs = populateScheduleSubjects;

  function saveScheduleSlot() {
    const classId   = document.getElementById('schedcls').value;
    const subjectId = document.getElementById('schedsub').value;
    const day       = document.getElementById('schedday').value;
    const startTime = document.getElementById('schedst').value;
    const endTime   = document.getElementById('schedet').value;
    const editId    = document.getElementById('schedeid').value;

    if (!classId || !subjectId || !day || !startTime || !endTime) {
      showToast('Please fill all fields', 'warn'); return;
    }
    if (startTime >= endTime) {
      showToast('End time must be after start time', 'warn'); return;
    }

    const assignment = getMyAssignments().find(function(a) { return a.classId === classId && a.subjectId === subjectId; });
    if (!assignment) { showToast('Assignment not found', 'warn'); return; }

    const slotData = {
      classId: classId, className: assignment.className,
      subjectId: subjectId, subjectName: assignment.subjectName,
      teacherId: currentUser._id, teacherName: currentUser.name,
      day: day, start: startTime, end: endTime
    };

    if (editId) {
      DB.update('timetable', editId, slotData);
      showToast('&#9989; Slot updated!');
    } else {
      DB.insert('timetable', slotData);
      showToast('&#9989; Slot added!');
    }
    closeModal('msched');
    renderSchedulePage();
  }
  var saveSlot = saveScheduleSlot;

  function deleteSlot(slotId) {
    if (!confirm('Delete this slot?')) return;
    DB.delete('timetable', slotId);
    showToast('Slot deleted', 'warn');
    renderSchedulePage();
  }
  var delSlot = deleteSlot;

  // ─── TAKE ATTENDANCE ────────────────────────────────────────────────────────
  let attendanceStudents = [];

  function initAttendancePage() {
    document.getElementById('attcls').innerHTML  = buildClassOptions(false);
    document.getElementById('attsub').innerHTML  = '<option value="">— Select —</option>';
    document.getElementById('attsheet').style.display = 'none';
    if (!document.getElementById('attdate').value) {
      document.getElementById('attdate').value = todayISO();
    }
  }
  var initAttPage = initAttendancePage;

  function loadSubjectsForClass() {
    const classId = document.getElementById('attcls').value;
    const relatedAssignments = getMyAssignments().filter(function(a) { return a.classId === classId; });
    document.getElementById('attsub').innerHTML = '<option value="">— Select —</option>'
      + relatedAssignments.map(function(a) {
          return '<option value="' + a.subjectId + '">' + a.subjectName + '</option>';
        }).join('');
  }
  var attLoadSubs = loadSubjectsForClass;

  function loadAttendanceSheet() {
    showToast("Loading…", 'saving');
    var classId   = document.getElementById('attcls').value;
    var subjectId = document.getElementById('attsub').value;
    var date      = document.getElementById('attdate').value;
    var period    = document.getElementById('attperiod') ? document.getElementById('attperiod').value : '1';
    if (!classId || !subjectId || !date) { showToast('Select class, subject and date', 'warn'); return; }

    var assignment = getMyAssignments().find(function(a) {
      return String(a.classId) === String(classId) && String(a.subjectId) === String(subjectId);
    });
    if (!assignment) {
      var clsEl = document.getElementById('attcls');
      var subEl = document.getElementById('attsub');
      assignment = {
        classId: classId,
        className: (clsEl && clsEl.options[clsEl.selectedIndex]) ? clsEl.options[clsEl.selectedIndex].text : 'Class',
        subjectId: subjectId,
        subjectName: (subEl && subEl.options[subEl.selectedIndex]) ? subEl.options[subEl.selectedIndex].text : 'Subject'
      };
    }

    var tok = getToken();
    if (!tok) { showToast('Not authenticated', 'warn'); return; }

    // Fetch students for the class, existing records for this session,
    // and approved leaves for this date in parallel from the DB server.
    Promise.all([
      fetch('/api/students?classId=' + encodeURIComponent(classId) + '&limit=500', {
        headers: { 'Authorization': 'Bearer ' + tok }
      }).then(function(r) { return r.ok ? r.json() : []; })
        .then(function(d) {
          if (Array.isArray(d)) return d;
          if (d && Array.isArray(d.data)) return d.data;
          if (d && Array.isArray(d.students)) return d.students;
          return [];
        })
        .catch(function() { return []; }),

      fetch('/api/attendance?classId=' + encodeURIComponent(classId)
          + '&date=' + encodeURIComponent(date)
          + '&subjectId=' + encodeURIComponent(subjectId), {
        headers: { 'Authorization': 'Bearer ' + tok }
      }).then(function(r) { return r.ok ? r.json() : []; })
        .then(function(d) {
          if (Array.isArray(d)) return d;
          if (d && Array.isArray(d.data)) return d.data;
          return [];
        })
        .catch(function() { return []; }),

      fetch('/api/leave/approved-for-date?classId=' + encodeURIComponent(classId)
          + '&date=' + encodeURIComponent(date), {
        headers: { 'Authorization': 'Bearer ' + tok }
      }).then(function(r) { return r.ok ? r.json() : []; })
        .then(function(d) {
          if (Array.isArray(d)) return d;
          if (d && Array.isArray(d.data)) return d.data;
          return [];
        })
        .catch(function() { return []; })
    ]).then(function(results) {
      var classStudents  = results[0] || [];
      var sessionRecords = (results[1] || []).filter(function(a) {
        return String(a.subjectId) === String(subjectId);
      });
      var approvedLeaves = results[2] || [];
      var periodNum = Number(period) || 1;

      if (!classStudents.length) {
        showToast('No students found in this class', 'warn');
        return;
      }

      // Also update local student cache so other functions (student list, reports)
      // pick up fresh data without an extra round-trip.
      (function mergeIntoCache() {
        var existing = DB.get('students') || [];
        var seen = Object.create(null);
        existing.forEach(function(s) { seen[String(s._id)] = true; });
        var merged = existing.concat(classStudents.filter(function(s) { return !seen[String(s._id)]; }));
        DB.set('students', merged);
      })();

      attendanceStudents = classStudents.map(function(student) {
        var rec = sessionRecords.find(function(a) {
          return String(a.studentId) === String(student._id) ||
                 (student.trackId && a.studentTrackId === student.trackId);
        });

        var matchingLeave = approvedLeaves.find(function(l) {
          var matchId = String(l.studentId) === String(student._id) ||
                        (student.trackId && l.studentTrackId === student.trackId) ||
                        (student.regNo && l.studentRegNo === student.regNo);
          if (!matchId) return false;
          if (l.category === 'Leave' || !l.slot || l.slot === 'Full Day') return true;
          if (l.slot === 'FN' && periodNum <= 4) return true;
          if (l.slot === 'AN' && periodNum >= 5) return true;
          if (Array.isArray(l.periods) && l.periods.includes(periodNum)) return true;
          return false;
        });

        var defaultPref = (currentUser && currentUser.preferences && currentUser.preferences.defaultAttendanceStatus)
          ? currentUser.preferences.defaultAttendanceStatus.toLowerCase()
          : 'present';
        var initialStatus = defaultPref === 'unmarked' ? 'unmarked' : (defaultPref === 'absent' ? 'absent' : 'present');
        if (matchingLeave) {
          initialStatus = 'absent';
        }
        if (rec) {
          initialStatus = rec.status;
        }

        return Object.assign({}, student, {
          status:     initialStatus,
          existingId: rec ? rec._id : null,
          onLeave:    !!matchingLeave,
          leaveBadge: matchingLeave ? ('✈️ On Leave' + (matchingLeave.slot && matchingLeave.slot !== 'Full Day' ? ' (' + matchingLeave.slot + ')' : '')) : ''
        });
      });

      document.getElementById('ainfc').textContent = assignment.className || '—';
      document.getElementById('ainfs').textContent = assignment.subjectName || '—';
      document.getElementById('ainfd').textContent = formatDateLong(date);
      var ainfp = document.getElementById('ainfp');
      if (ainfp) ainfp.textContent = 'Period ' + period;
      document.getElementById('ainft').textContent = classStudents.length;

      document.getElementById('attsheet').style.display = 'block';
      renderAttendanceSheet();
      showToast('Loaded ' + classStudents.length + ' students', 'success');
    }).catch(function(err) {
      console.error('Error in loadAttendanceSheet:', err);
      showToast('Error loading attendance sheet', 'warn');
    });
  }
  var loadAttSheet = loadAttendanceSheet;

  function renderAttendanceSheet() {
    document.getElementById('atttbody').innerHTML = attendanceStudents.map(function(student, index) {
      const isPresent = student.status === 'present';
      const leaveBadgeHtml = student.onLeave
        ? '<span style="background:rgba(239,68,68,0.12);color:#dc2626;border:1px solid rgba(239,68,68,0.28);font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:7px;display:inline-flex;align-items:center;" title="Approved Leave">' + (student.leaveBadge || '✈️ On Leave') + '</span>'
        : '';
      return '<tr class="' + (isPresent ? 'pr' : 'ab') + '" id="student-row-' + index + '">'
        + '<td style="font-weight:700;color:var(--tdi);">' + (index + 1) + '</td>'
        + '<td style="font-weight:600;color:var(--tmu);">' + student.regNo + '</td>'
        + '<td style="font-weight:600;">' + student.name + leaveBadgeHtml + '</td>'
        + '<td><div class="attog">'
        + '<button class="abp ' + (isPresent ? 'act' : '') + '" onclick="setAttendanceStatus(' + index + ',\'present\')">P</button>'
        + '<button class="aba ' + (!isPresent ? 'act' : '') + '" onclick="setAttendanceStatus(' + index + ',\'absent\')">A</button>'
        + '</div></td>'
        + '</tr>';
    }).join('');
    updateAttendanceSummary();
  }

  function setAttendanceStatus(index, status) {
    attendanceStudents[index].status = status;
    const row = document.getElementById('student-row-' + index);
    row.className = status === 'present' ? 'pr' : 'ab';
    row.querySelectorAll('.abp,.aba').forEach(function(btn) { btn.classList.remove('act'); });
    const targetBtn = row.querySelector(status === 'present' ? '.abp' : '.aba');
    if (targetBtn) targetBtn.classList.add('act');
    updateAttendanceSummary();
  }
  var setS = setAttendanceStatus;

  function markAllStudents(status) {
    attendanceStudents.forEach(function(_, index) { attendanceStudents[index].status = status; });
    renderAttendanceSheet();
  }
  var markAll = markAllStudents;

  function updateAttendanceSummary() {
    const presentCount = attendanceStudents.filter(function(s) { return s.status === 'present'; }).length;
    document.getElementById('stotal').textContent = attendanceStudents.length;
    document.getElementById('spres').textContent  = presentCount;
    document.getElementById('sabs').textContent   = attendanceStudents.length - presentCount;
  }
  var updSum = updateAttendanceSummary;

  let activeLiveSessionId = null;
  let liveSessionPollTimer = null;

  function startLiveSession() {
    const classId   = document.getElementById('attcls').value;
    const subjectId = document.getElementById('attsub').value;
    const date      = document.getElementById('attdate').value;

    if (!classId || !subjectId || !date) { showToast('Select class, subject and date', 'warn'); return; }

    fetch('/api/live-session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ classId: classId, subjectId: subjectId, date: date })
    })
    .then(function(res){ return res.json(); })
    .then(function(data) {
      if(data.error) { showToast(data.error, 'warn'); return; }
      activeLiveSessionId = data._id;
      document.getElementById('live-session-controls').innerHTML =
        '<div style="background:#fff;border:2px dashed #16a34a;border-radius:8px;padding:4px 12px;font-size:22px;font-weight:800;color:#166534;letter-spacing:4px;margin-right:12px;">' + data.passcode + '</div>' + 
        '<button class="btn-pri" onclick="endLiveSession()" style="background:#dc2626;box-shadow:none;">End Session</button>';
      
      if(liveSessionPollTimer) clearInterval(liveSessionPollTimer);
      liveSessionPollTimer = setInterval(pollLiveSession, 3000);
      showToast('Live session started! Ask students to enter the passcode.', 'info');
    })
    .catch(function(e){ showToast('Error starting live session', 'warn'); });
  }
  window.startLiveSession = startLiveSession;

  function pollLiveSession() {
    if (!activeLiveSessionId) return;
    fetch('/api/live-session/status/' + activeLiveSessionId, {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
    .then(function(res){ return res.json(); })
    .then(function(data) {
      if(!data || data.error) return;
      if(!data.active) { endLiveSession(true); return; }
      
      data.markedStudents.forEach(function(s) {
        const idx = attendanceStudents.findIndex(function(st) { return String(st.regNo) === String(s.regNo) || String(st._id) === String(s.studentId); });
        if(idx !== -1 && attendanceStudents[idx].status !== 'present') {
          setAttendanceStatus(idx, 'present');
          showToast(s.regNo + ' self-marked present', 'info');
        }
      });
    })
    .catch(function(e) {});
  }

  function endLiveSession(autoEnded) {
    if(liveSessionPollTimer) clearInterval(liveSessionPollTimer);
    liveSessionPollTimer = null;

    if (!autoEnded && activeLiveSessionId) {
      fetch('/api/live-session/end/' + activeLiveSessionId, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() }
      }).catch(function(e){});
    }

    activeLiveSessionId = null;
    document.getElementById('live-session-controls').innerHTML =
      '<button class="btn-pri" onclick="startLiveSession()" style="background:#16a34a;box-shadow:none;">Start Live Session</button>';
    if(!autoEnded) { showToast('Live session ended manually.', 'info'); }
    else { showToast('Live session expired.', 'warn'); }
  }
  window.endLiveSession = endLiveSession;

  function submitAttendance() {
    if (!attendanceStudents.length) { showToast('No students loaded', 'warn'); return; }

    var classId     = document.getElementById('attcls').value;
    var subjectId   = document.getElementById('attsub').value;
    var date        = document.getElementById('attdate').value;
    var periodEl    = document.getElementById('attperiod');
    var periodNumber = periodEl ? Number(periodEl.value) || 1 : 1;
    var assignment  = getMyAssignments().find(function(a) { return a.classId === classId && a.subjectId === subjectId; });
    var tok         = getToken();

    if (!tok) { showToast('Not authenticated', 'warn'); return; }
    if (!assignment) { showToast('Assignment not found', 'warn'); return; }

    showToast('Saving attendance…');

    // Single batch POST — server stores everything in ClassAttendance + StudentAttendance
    var payload = {
      classId:      classId,
      subjectId:    subjectId,
      date:         date,
      periodNumber: periodNumber,
      records: attendanceStudents.map(function(student) {
        return {
          studentId:     String(student._id),
          studentTrackId: student.trackId || String(student._id),
          status:        student.status   // 'present' or 'absent' — server normalises to P/AB
        };
      })
    };

    fetch('/api/attendance', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
      body:    JSON.stringify(payload)
    })
    .then(function(r) {
      if (!r.ok) {
        return r.json().then(function(errJson) {
          return Promise.reject(errJson);
        }).catch(function() {
          return Promise.reject({ error: 'Server error saving attendance' });
        });
      }
      return r.json();
    })
    .then(function() {
      return syncMyAttendance();
    }).then(function() {
      dbToast('&#9989; Attendance saved!', 'success');
      renderAttendanceSheet();
    }).catch(function(err) {
      var msg = (err && err.error) ? ('❌ ' + err.error) : 'Error saving attendance — please retry';
      showToast(msg, 'warn');
    });
  }
  var submitAtt = submitAttendance;

  // ─── REPORTS ────────────────────────────────────────────────────────────────
  function renderAttendanceRecord() {
    var classFilter   = document.getElementById('rfc') ? document.getElementById('rfc').value : '';
    var subjectFilter = document.getElementById('rfs') ? document.getElementById('rfs').value : '';
    var fromDate      = document.getElementById('rff') ? document.getElementById('rff').value : '';
    var toDate        = document.getElementById('rft') ? document.getElementById('rft').value : '';

    var tbody = document.getElementById('attrec');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--tdi);">Loading…</td></tr>';

    fetchAttendanceForReport(classFilter, subjectFilter, fromDate, toDate)
      .then(function(attendance) {
        // subjectId is not a route param — filter client-side
        if (subjectFilter) {
          attendance = attendance.filter(function(a) { return String(a.subjectId) === String(subjectFilter); });
        }

        // Aggregate per student + subject
        var grouped = {};
        attendance.forEach(function(a) {
          var key = String(a.studentId) + '|' + String(a.subjectId);
          if (!grouped[key]) grouped[key] = {
            studentName: a.studentName, regNo: '',
            className: a.className,   subjectName: a.subjectName,
            present: 0, total: 0,     studentId: a.studentId
          };
          grouped[key].total++;
          if (a.status === 'present') grouped[key].present++;
        });

        // Enrich reg numbers from student cache (populated by syncMyStudents)
        var allStudents = DB.get('students');
        Object.values(grouped).forEach(function(record) {
          if (!record.regNo) {
            var stu = allStudents.find(function(s) { return String(s._id) === String(record.studentId); });
            if (stu) record.regNo = stu.regNo || '';
          }
        });

        var rows = Object.values(grouped).sort(function(a, b) { return a.studentName.localeCompare(b.studentName); });

        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--tdi);">No records found.</td></tr>';
          return;
        }

        tbody.innerHTML = rows.map(function(record, index) {
          var minA     = window._pubSettings && window._pubSettings.academic ? (window._pubSettings.academic.minAttendance || 75) : 75;
          var lowA     = window._pubSettings && window._pubSettings.academic ? (window._pubSettings.academic.lowAttendanceThreshold || 65) : 65;
          var pct      = record.total ? Math.round(record.present / record.total * 100) : 0;
          var pctClass = pct >= minA ? 'ph' : pct >= lowA ? 'pm' : 'pl';
          return '<tr>'
            + '<td>' + (index + 1) + '</td>'
            + '<td style="font-weight:600;">' + record.studentName + '</td>'
            + '<td style="color:var(--tmu);">' + (record.regNo || '—') + '</td>'
            + '<td>' + record.className + '</td>'
            + '<td>' + record.subjectName + '</td>'
            + '<td>' + record.total + '</td>'
            + '<td style="color:var(--gK);font-weight:600;">' + record.present + '</td>'
            + '<td><span class="pb ' + pctClass + '">' + pct + '%</span></td>'
            + '</tr>';
        }).join('');
      });
  }
  // Alias — HTML filter dropdowns call renderAttRec() via onchange
  var renderAttRec = renderAttendanceRecord;

  function exportAttendanceCSV() {
    const tableEl = document.getElementById('attrec');
    const rows    = [['#','Student Name','Reg No','Class','Subject','Total Hours','Present Hours','Attendance %']];
    tableEl.querySelectorAll('tr').forEach(function(tr) {
      const cells = Array.from(tr.querySelectorAll('td')).map(function(td) { return td.textContent.trim(); });
      if (cells.length) rows.push(cells);
    });
    downloadCSV(rows, 'Attendance_Record');
    showToast('&#8659; Downloaded!');
  }
  var exportAttCSV = exportAttendanceCSV;

  function renderDefaultersList() {
    const classFilter   = document.getElementById('dfc') ? document.getElementById('dfc').value : '';
    const subjectFilter = document.getElementById('dfs') ? document.getElementById('dfs').value : '';
    const defaultTh     = window._pubSettings && window._pubSettings.academic ? (window._pubSettings.academic.minAttendance || 75) : 75;
    const threshold     = parseInt(document.getElementById('dfth') ? (document.getElementById('dfth').value || defaultTh) : defaultTh);

    const allAttendance = DB.get('attendance').filter(function(a) {
      return a.teacherId === currentUser._id
          && (!classFilter   || a.classId   === classFilter)
          && (!subjectFilter || a.subjectId === subjectFilter);
    });

    const defaulterRows = [];
    getMyAssignments()
      .filter(function(a) {
        return (!classFilter   || a.classId   === classFilter)
            && (!subjectFilter || a.subjectId === subjectFilter);
      })
      .forEach(function(assignment) {
        DB.get('students').filter(function(s) { return s.classId === assignment.classId; }).forEach(function(student) {
          const stuAtt = allAttendance.filter(function(a) { return a.studentId === student._id && a.subjectId === assignment.subjectId; });
          if (!stuAtt.length) return;
          const pct = Math.round(stuAtt.filter(function(a) { return a.status === 'present'; }).length / stuAtt.length * 100);
          if (pct < threshold) {
            defaulterRows.push(Object.assign({}, student, {
              pct: pct,
              present: stuAtt.filter(function(a) { return a.status === 'present'; }).length,
              total: stuAtt.length,
              subjectName: assignment.subjectName,
              className: assignment.className
            }));
          }
        });
      });

    defaulterRows.sort(function(a, b) { return a.pct - b.pct; });
    const tbody = document.getElementById('deftbody');

    if (!defaulterRows.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--tdi);">No defaulters &#127881;</td></tr>';
      return;
    }

    tbody.innerHTML = defaulterRows.map(function(row, index) {
      return '<tr>'
        + '<td>' + (index + 1) + '</td>'
        + '<td style="font-weight:600;">' + row.name + '</td>'
        + '<td>' + row.regNo + '</td>'
        + '<td>' + row.className + '</td>'
        + '<td>' + row.subjectName + '</td>'
        + '<td style="color:var(--gK);font-weight:600;">' + row.present + '</td>'
        + '<td>' + row.total + '</td>'
        + '<td><span class="pb ' + (row.pct < 50 ? 'pl' : 'pm') + '">' + row.pct + '%</span></td>'
        + '</tr>';
    }).join('');
  }
  var renderDefs = renderDefaultersList;

  function exportDefaultersCSV() {
    const tableEl = document.getElementById('deftbody');
    const rows    = [['#','Name','Reg No','Class','Subject','Present','Total','%']];
    tableEl.querySelectorAll('tr').forEach(function(tr) {
      const cells = Array.from(tr.querySelectorAll('td')).map(function(td) { return td.textContent.trim(); });
      if (cells.length) rows.push(cells);
    });
    downloadCSV(rows, 'Defaulters_List');
    showToast('&#8659; Downloaded!');
  }
  var exportDefCSV = exportDefaultersCSV;

  function renderStudentList() {
    const classFilter  = document.getElementById('slc') ? document.getElementById('slc').value : '';
    const searchQuery  = (document.getElementById('slq') ? document.getElementById('slq').value : '').toLowerCase();

    const myClassIds  = classFilter ? [classFilter] : getMyClasses().map(function(c) { return c.id; });
    let students = DB.get('students').filter(function(s) { return myClassIds.includes(s.classId); });
    if (searchQuery) students = students.filter(function(s) {
      return s.name.toLowerCase().includes(searchQuery) || s.regNo.toLowerCase().includes(searchQuery);
    });

    const tbody = document.getElementById('stutbody');
    if (!students.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--tdi);">No students found.</td></tr>';
      return;
    }
    tbody.innerHTML = students.map(function(student, index) {
      return '<tr>'
        + '<td>' + (index + 1) + '</td>'
        + '<td style="font-weight:600;">' + student.name + '</td>'
        + '<td>' + student.regNo + '</td>'
        + '<td>' + (student.className || '—') + '</td>'
        + '<td>' + (student.section || 'A') + '</td>'
        + '<td style="color:var(--tmu);">' + (student.deptName || '—') + '</td>'
        + '</tr>';
    }).join('');
  }
  var renderStuList = renderStudentList;

  function exportStudentCSV() {
    const tableEl = document.getElementById('stutbody');
    const rows    = [['#','Name','Reg No','Class','Section','Department']];
    tableEl.querySelectorAll('tr').forEach(function(tr) {
      const cells = Array.from(tr.querySelectorAll('td')).map(function(td) { return td.textContent.trim(); });
      if (cells.length) rows.push(cells);
    });
    downloadCSV(rows, 'Student_List');
    showToast('&#8659; Downloaded!');
  }
  var exportStuCSV = exportStudentCSV;

  // ─── GRIEVANCES ──────────────────────────────────────────────────────────────
  function renderGrievances() {
    const myGrievances = DB.get('teacher-grievances').filter(function(g) { return g.teacherId === currentUser._id; });
    const containerEl  = document.getElementById('grievlist');

    if (!myGrievances.length) {
      containerEl.innerHTML = '<div class="est"><span class="ei">&#128205;</span><p style="font-size:12px;">No grievances raised yet.</p></div>';
      return;
    }

    containerEl.innerHTML = myGrievances.slice().reverse().map(function(grievance) {
      const isResolved  = grievance.status === 'Resolved';
      const isCancelled = grievance.status === 'Cancelled';
      const isPending   = !isResolved && !isCancelled;
      const iconCode    = isResolved ? '&#9989;' : isCancelled ? '&#10060;' : '&#128225;';
      const icClass     = isResolved ? 'res' : 'pend';
      const pillClass   = isResolved ? 'sres' : 'spend';
      const pillStyle   = isCancelled ? 'style="background:#fef2f2;color:#dc2626;border-color:rgba(239,68,68,.3);"' : '';

      let statusNote = '';
      if (isResolved) {
        statusNote = '<div style="margin-top:6px;font-size:10.5px;color:var(--gD);background:var(--gLt);padding:4px 10px;border-radius:6px;display:inline-flex;align-items:center;gap:5px;">'
          + '&#9989; Resolved by Admin'
          + (grievance.resolvedAt ? ' &nbsp;·&nbsp; ' + new Date(grievance.resolvedAt).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}) : '')
          + '</div>';
      } else if (isCancelled) {
        statusNote = '<div style="margin-top:6px;font-size:10.5px;color:#dc2626;background:#fef2f2;padding:4px 10px;border-radius:6px;display:inline-flex;align-items:center;gap:5px;">'
          + '&#10060; Declined by Admin'
          + '</div>';
      } else {
        statusNote = '<div style="margin-top:6px;font-size:10.5px;color:#92400e;background:#fef3c7;padding:4px 10px;border-radius:6px;display:inline-flex;align-items:center;gap:5px;">'
          + '&#8987; Awaiting admin response'
          + '</div>';
      }

      return '<div class="gcard">'
        + '<div class="gic ' + icClass + '">' + iconCode + '</div>'
        + '<div style="flex:1;">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">'
        + '<div style="font-size:13px;font-weight:700;color:var(--td);">' + grievance.subject + '</div>'
        + '<span class="spill ' + pillClass + '" ' + pillStyle + '>' + grievance.status + '</span>'
        + '<span class="bge">' + grievance.category + '</span>'
        + '</div>'
        + '<div style="font-size:11.5px;color:var(--tmu);line-height:1.5;">' + grievance.detail + '</div>'
        + '<div style="font-size:10px;color:var(--tdi);margin-top:5px;">' + formatDateLong(grievance.createdAt.split('T')[0]) + ' · Sent to Admin</div>'
        + statusNote
        + '</div></div>';
    }).join('');
  }
  var renderGrievs = renderGrievances;

  function submitGrievance() {
    const subject    = (document.getElementById('gsubj')   ? document.getElementById('gsubj').value   : '').trim();
    const category   = document.getElementById('gcat')     ? document.getElementById('gcat').value    : 'Other';
    const detail     = (document.getElementById('gdetail') ? document.getElementById('gdetail').value : '').trim();

    if (!subject || !detail) { showToast('Please fill all fields', 'warn'); return; }

    const newGrievance = DB.insert('teacher-grievances', {
      teacherId: currentUser._id, teacherName: currentUser.name,
      subject: subject, category: category, detail: detail,
      status: 'Pending', createdAt: new Date().toISOString()
    });

    // Notify admin
    DB.insert('notifications', {
      type: 'request', from: currentUser.name, fromRole: 'Teacher',
      message: '[Grievance] ' + subject + ' — ' + detail.slice(0, 100) + (detail.length > 100 ? '…' : ''),
      time: new Date().toISOString(), read: false, priority: 'Normal',
      category: category, grievanceId: newGrievance._id
    });

    document.getElementById('gsubj').value   = '';
    document.getElementById('gdetail').value = '';
    closeModal('mgriev');
    showToast('&#128225; Grievance submitted to admin!');
    renderGrievances();
  }
  var submitGriev = submitGrievance;

  // ─── PROFILE PAGE ────────────────────────────────────────────────────────────
  function initProfilePage() {
    document.getElementById('profav').textContent    = currentUser.name[0];
    document.getElementById('profname').textContent  = currentUser.name;
    document.getElementById('pdrdesig').textContent  = currentUser.desig  || 'Assistant Professor';
    document.getElementById('pdremp').textContent    = currentUser.empId  || '—';
    document.getElementById('pdrdept').textContent   = currentUser.dept   || '—';
    document.getElementById('pdrusr').textContent    = currentUser.username || '—';

    if (document.getElementById('pdremail')) document.getElementById('pdremail').textContent = currentUser.email || '—';
    if (document.getElementById('pdrphone')) document.getElementById('pdrphone').textContent = currentUser.phone || '—';
    if (document.getElementById('pdrqual')) document.getElementById('pdrqual').textContent = currentUser.qualifications || '—';
    if (document.getElementById('pdrexp')) document.getElementById('pdrexp').textContent = currentUser.experience || '—';
    if (document.getElementById('pdrdoj')) document.getElementById('pdrdoj').textContent = currentUser.joiningDate || '—';

    if (document.getElementById('prof-hod-tag')) {
      document.getElementById('prof-hod-tag').style.display = currentUser.isHOD ? 'inline-block' : 'none';
    }

    if (document.getElementById('pdrhod')) document.getElementById('pdrhod').innerHTML = currentUser.isHOD ? '<span class="field-badge fb-yes">⭐ '+ (currentUser.HoddeptName || 'Yes') +'</span>' : '<span class="field-badge fb-no">No</span>';
    if (document.getElementById('pdrclassadv')) document.getElementById('pdrclassadv').innerHTML = currentUser.isClassAdvisor ? '<span class="field-badge fb-yes">⭐ ' + (currentUser.advisorClassName || 'Yes') + '</span>' : '<span class="field-badge fb-no">No</span>';
    if (document.getElementById('pdrttcoord')) document.getElementById('pdrttcoord').innerHTML = currentUser.isTimeTableCoordinator ? '<span class="field-badge fb-yes">⭐ ' + (currentUser.TTdeptName || 'Yes') + '</span>' : '<span class="field-badge fb-no">No</span>';
    if (document.getElementById('pdradmin')) document.getElementById('pdradmin').innerHTML = currentUser.isAdmin ? '<span class="field-badge fb-yes">⭐ Yes</span>' : '<span class="field-badge fb-no">No</span>';

    const assignedClasses = Array.from(new Set(getMyAssignments().map(function(a) { return a.className; })));
    document.getElementById('pdrcls').textContent = assignedClasses.length ? assignedClasses.join(', ') : 'None assigned';

    // Populate Attendance Preference
    var prefStatusEl = document.getElementById('prof-def-att-status');
    if (prefStatusEl) {
      prefStatusEl.value = (currentUser.preferences && currentUser.preferences.defaultAttendanceStatus) || 'Present';
    }

    ['pwcur','pwnew','pwconf'].forEach(function(id) { document.getElementById(id).value = ''; });
    document.getElementById('pwerr').style.display = 'none';
  }
  var initProfile = initProfilePage;

  function saveTeacherPreferences() {
    var prefStatusEl = document.getElementById('prof-def-att-status');
    var status = prefStatusEl ? prefStatusEl.value : 'Present';
    var tok = getToken();
    if (!tok) return;

    fetch('/api/profile/me', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tok
      },
      body: JSON.stringify({ defaultAttendanceStatus: status })
    })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (res && res.error) {
          showToast('❌ ' + res.error, 'error');
          return;
        }
        if (!currentUser.preferences) currentUser.preferences = {};
        currentUser.preferences.defaultAttendanceStatus = status;
        sessionStorage.setItem('eams_user', JSON.stringify(currentUser));
        showToast('✅ Preferences saved!', 'success');
      })
      .catch(function(err) {
        showToast('❌ Network error', 'error');
      });
  }

  function changePassword() {
    const currentPw  = document.getElementById('pwcur').value.trim();
    const newPw      = document.getElementById('pwnew').value.trim();
    const confirmPw  = document.getElementById('pwconf').value.trim();
    const errorEl    = document.getElementById('pwerr');

    errorEl.style.display = 'none';

    if (!currentPw || !newPw || !confirmPw) {
      errorEl.textContent = 'Please fill all password fields.';
      errorEl.style.display = 'block'; return;
    }
    if (currentPw !== currentUser.password) {
      errorEl.textContent = 'Current password is incorrect.';
      errorEl.style.display = 'block'; return;
    }
    if (newPw.length < 6) {
      errorEl.textContent = 'New password must be at least 6 characters.';
      errorEl.style.display = 'block'; return;
    }
    if (newPw !== confirmPw) {
      errorEl.textContent = 'Passwords do not match.';
      errorEl.style.display = 'block'; return;
    }

    DB.update('users', currentUser._id, { password: newPw });
    currentUser = Object.assign({}, currentUser, { password: newPw });
    ['pwcur','pwnew','pwconf'].forEach(function(id) { document.getElementById(id).value = ''; });
    showToast('&#128274; Password updated successfully!');
  }
  var changePw = changePassword;

  // ─── MODAL HELPERS ───────────────────────────────────────────────────────────
  

  

  // Close modal on backdrop click
  document.querySelectorAll('.modal-bg').forEach(function(bg) {
    bg.addEventListener('click', function(e) {
      if (e.target === bg) bg.classList.remove('open');
    });
  });

  // ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────
  
  var showT = showToast;

  function downloadCSV(rows, filename) {
    const csvContent = rows.map(function(row) {
      return row.map(function(cell) {
        return '"' + String(cell || '').replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = filename + '_' + todayISO() + '.csv';
    link.click();
  }
  var dlCSV = downloadCSV;

  // ─── BOOT ────────────────────────────────────────────────────────────────────
  ensureDB();

  (function checkAuthAndBoot() {
    const storedUser = sessionStorage.getItem('eams_user');
    if (!storedUser) { window.location.href = 'index.html'; return; }
    try {
      currentUser = JSON.parse(storedUser);
    } catch (e) {
      window.location.href = 'index.html'; return;
    }
    if (!currentUser || currentUser.role !== 'teacher') {
      window.location.href = 'index.html'; return;
    }
    bootApp();
  })();

// -- Change Password ----------------------------------
var _pwToken = getToken();

function showForcePwModal() {
  document.getElementById('forcePwModal').style.display = 'flex';
}
function openChangePwModal() {
  ['changePwCur','changePwNew','changePwConf'].forEach(function(id){ document.getElementById(id).value=''; });
  document.getElementById('changePwErr').style.display='none';
  document.getElementById('changePwOk').style.display='none';
  document.getElementById('changePwModal').style.display='flex';
}
function closeChangePwModal() {
  document.getElementById('changePwModal').style.display='none';
}
function submitForcePw() {
  var cur=document.getElementById('forcePwCur').value.trim();
  var nw=document.getElementById('forcePwNew').value.trim();
  var conf=document.getElementById('forcePwConf').value.trim();
  var err=document.getElementById('forcePwErr');
  err.style.display='none';
  if (!cur||!nw||!conf){err.textContent='Please fill all fields.';err.style.display='block';return;}
  if (nw.length<6){err.textContent='New password must be at least 6 characters.';err.style.display='block';return;}
  if (nw!==conf){err.textContent='Passwords do not match.';err.style.display='block';return;}
  fetch('/api/auth/change-password',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_pwToken},
    body:JSON.stringify({currentPassword:cur,newPassword:nw})
  }).then(function(r){return r.json();}).then(function(d){
    if(d.error){err.textContent=d.error;err.style.display='block';return;}
    sessionStorage.setItem('eams_mustChangePw','0');
    document.getElementById('forcePwModal').style.display='none';
    showToast('✅ Password changed successfully! Please remember your new password.');
  }).catch(function(){err.textContent='Server error. Try again.';err.style.display='block';});
}
function submitChangePw() {
  var cur=document.getElementById('changePwCur').value.trim();
  var nw=document.getElementById('changePwNew').value.trim();
  var conf=document.getElementById('changePwConf').value.trim();
  var err=document.getElementById('changePwErr');
  var ok=document.getElementById('changePwOk');
  err.style.display='none';ok.style.display='none';
  if (!cur||!nw||!conf){err.textContent='Please fill all fields.';err.style.display='block';return;}
  if (nw.length<6){err.textContent='New password must be at least 6 characters.';err.style.display='block';return;}
  if (nw!==conf){err.textContent='Passwords do not match.';err.style.display='block';return;}
  fetch('/api/auth/change-password',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_pwToken},
    body:JSON.stringify({currentPassword:cur,newPassword:nw})
  }).then(function(r){return r.json();}).then(function(d){
    if(d.error){err.textContent=d.error;err.style.display='block';return;}
    ok.textContent='✅ Password updated successfully!';ok.style.display='block';
    ['changePwCur','changePwNew','changePwConf'].forEach(function(id){document.getElementById(id).value='';});
    setTimeout(closeChangePwModal,1500);
  }).catch(function(){err.textContent='Server error. Try again.';err.style.display='block';});
}
function forwardToRepModal() {
  if (window._pubSettings && window._pubSettings.attendance && window._pubSettings.attendance.forwardToRep === false) {
    showToast('Delegation to Class Representative is locked by administrator.', 'warn');
    return;
  }
  showToast('👥 Forward to Class Representative: Class Rep delegation feature queued for verification.', 'info');
}

window.addEventListener('load', function(){
  if(sessionStorage.getItem('eams_mustChangePw')==='1'){ showForcePwModal(); }
  fetch('/api/settings/public')
    .then(function(r){ return r.json(); })
    .then(function(pub){
      window._pubSettings = pub;
      if (pub.institution) {
        var shortN = pub.institution.institutionShort || 'Sri Shakthi';
        document.title = 'EAMS – Teacher | ' + shortN;
        var brandEl = document.querySelector('.sb-brand');
        if (brandEl && pub.institution.institutionName) {
          brandEl.innerHTML = pub.institution.institutionName + '<small>Teacher Portal</small>';
        }
      }
      if (pub.models) {
        if (pub.models.modelLeave === false) {
          var el = document.getElementById('sn-leaves');
          if (el) el.style.display = 'none';
        }
        if (pub.models.modelGrievances === false) {
          var el = document.getElementById('sn-griev');
          if (el) el.style.display = 'none';
        }
        if (pub.models.modelExportSheet === false) {
          document.querySelectorAll('.btn-out').forEach(function(b){
            if (b.textContent && b.textContent.includes('Export CSV')) b.style.display = 'none';
          });
        }
      }
      if (pub.attendance) {
        if (pub.attendance.forwardToRep === false) {
          var fBtn = document.getElementById('btn-forward-rep');
          if (fBtn) fBtn.style.display = 'none';
        }
      }
    }).catch(function(e){ console.warn(e); });
});

// Security
document.addEventListener('contextmenu', function(e){ e.preventDefault(); });
document.addEventListener('keydown', function(e){
  if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&['I','J','C','K'].includes(e.key))||(e.ctrlKey&&e.key==='U')){ e.preventDefault(); return false; }
});

function hideMsgToast() { /* no-op - toast hidden by timer */ }