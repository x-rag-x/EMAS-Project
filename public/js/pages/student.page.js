// ══ AUTH ══════════════════════════════════════════════════════════════
var USER = checkAuth('student');
var TOKEN = getToken();

// Init topbar from cached user
if (USER) {
  var _initials = (USER.name || 'S').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
  document.getElementById('av-initials').textContent = _initials;
  document.getElementById('sb-av').textContent = _initials;
  document.getElementById('tb-name').textContent = USER.name || 'Student';
  document.getElementById('sb-name').textContent = USER.name || 'Student';
}

var toast = showToast;

// ══ API HELPER ════════════════════════════════════════════════════════
function api(url, opts, skipLogout) {
  opts = opts || {};
  opts.headers = Object.assign({ 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, opts.headers || {});
  return fetch(url, opts).then(function(r) {
    if (r.status === 401 && !skipLogout) { doLogout(); throw new Error('Session expired'); }
    if (r.status === 503) {
      return r.text().then(function(txt) {
        var d; try { d = JSON.parse(txt); } catch(e) { throw new Error('Server error (503)'); }
        if (d.maintenance) { sessionStorage.setItem('maint_data', JSON.stringify(d)); window.location.href = 'maintenance.html'; }
        throw new Error(d.error || 'Service unavailable');
      });
    }
    return r.text().then(function(txt) {
      if (!txt || !txt.trim()) return {};
      if (txt.trim().charAt(0) === '<') throw new Error('Server returned an unexpected response (HTTP ' + r.status + '). Check that the API server is running.');
      try { return JSON.parse(txt); } catch(e) { throw new Error('Invalid response from server.'); }
    });
  });
}

// ══ TOGGLE PW ════════════════════════════════════════════════════════
function togglePw(id, btn) {
  var inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

// ══ PASSWORD STRENGTH ════════════════════════════════════════════════
function updateStrength(val, barId) {
  var bar = document.getElementById(barId);
  if (!bar) return;
  var score = 0;
  if (val.length >= 6) score++;
  if (val.length >= 10) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  var pct = (score / 5) * 100;
  var color = score <= 1 ? '#ef4444' : score <= 3 ? '#f59e0b' : '#22c55e';
  bar.style.width = pct + '%';
  bar.style.background = color;
}

// ══ CHANGE PASSWORD ═══════════════════════════════════════════════════
function doChangePw() {
  var oldPw = document.getElementById('chpw-old').value;
  var newPw = document.getElementById('chpw-new').value;
  var cfm   = document.getElementById('chpw-confirm').value;
  var errEl = document.getElementById('chpw-err');
  errEl.style.display = 'none';
  if (!oldPw || !newPw || !cfm) { errEl.textContent = 'All fields required.'; errEl.style.display = 'block'; return; }
  if (newPw.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
  if (newPw !== cfm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
  if(oldPw === newPw) {errEl.textContent = 'Old and new password must not be same'; errEl.style.display = 'block'; return; }
  if(newPw.toUpperCase().includes('STUDENT')) {errEl.textContent = 'Password must not contain STUDENT'; errEl.style.display = 'block'; return; }

  api('/api/auth/change-password', { method:'POST', body:JSON.stringify({ currentPassword:oldPw, newPassword:newPw }) }, true)
  .then(function(d) {
    if (d.error) { errEl.textContent = d.error; errEl.style.display = 'block'; return; }
    sessionStorage.removeItem('eams_mustChangePw');
    closeModal('m-chpw');
    toast('Password updated successfully!');
    document.getElementById('chpw-old').value = '';
    document.getElementById('chpw-new').value = '';
    document.getElementById('chpw-confirm').value = '';
    var banner = document.querySelector('.must-change-banner');
    if (banner) banner.style.display = 'none';
  })
  .catch(function(e) { errEl.textContent = e.message; errEl.style.display = 'block'; });
}

// Same for inline profile change password
function doChangePwInline() {
  var oldPw = document.getElementById('prof-pw-old').value;
  var newPw = document.getElementById('prof-pw-new').value;
  var cfm   = document.getElementById('prof-pw-confirm').value;
  var errEl = document.getElementById('prof-pw-err');
  errEl.style.display = 'none';
  if (!oldPw || !newPw || !cfm) { errEl.textContent = 'All fields required.'; errEl.style.display = 'block'; return; }
  if (newPw.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
  if (newPw !== cfm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
  if(oldPw === newPw) {errEl.textContent = 'Old and new password must not be same'; errEl.style.display = 'block'; return; }
  if(newPw.toUpperCase().includes('STUDENT')) {errEl.textContent = 'Password must not contain STUDENT'; errEl.style.display = 'block'; return; }
  api('/api/auth/change-password', { method:'POST', body:JSON.stringify({ currentPassword:oldPw, newPassword:newPw }) }, true)
  .then(function(d) {
    if (d.error) { errEl.textContent = d.error; errEl.style.display = 'block'; return; }
    sessionStorage.removeItem('eams_mustChangePw');
    toast('Password updated successfully!');
    document.getElementById('prof-pw-old').value = '';
    document.getElementById('prof-pw-new').value = '';
    document.getElementById('prof-pw-confirm').value = '';
    var str = document.getElementById('prof-pw-strength');
    if (str) { str.style.width = '0%'; }
  })
  .catch(function(e) { errEl.textContent = e.message; errEl.style.display = 'block'; });
}

function openChangePw() { openModal('m-chpw'); }

// ══ SIDEBAR ══════════════════════════════════════════════════════════
function toggleSidebar() {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sb-overlay');
  sb.classList.toggle('sb-mobile-open');
  ov.classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('sb-mobile-open');
  document.getElementById('sb-overlay').classList.remove('show');
}

// ══ VIEW SWITCHING ════════════════════════════════════════════════════
var _currentView = 'dashboard';
function showView(name) {
  _currentView = name;
  document.querySelectorAll('.pg').forEach(function(v) { v.classList.remove('act'); });
  document.querySelectorAll('.sb-item').forEach(function(b) { b.classList.remove('active'); });
  var viewEl = document.getElementById('view-' + name);
  if (viewEl) viewEl.classList.add('act');
  var navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  // Update topbar label
  var labels = { dashboard: 'Dashboard', profile: 'My Profile', attendance: 'Attendance' };
  document.getElementById('tb-page-label').textContent = labels[name] || name;
  // If profile view opened and data ready, ensure rendered
  if (name === 'profile' && _data) {
    renderProfilePage(_data);
  }
  closeSidebar();
  window.scrollTo(0, 0);
}

// ══ UTILS ════════════════════════════════════════════════════════════
function pad2(n) { return String(n).padStart(2,'0'); }
function fmtDate(str) {
  if (!str) return '—';
  var d = new Date(str);
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateTime(str) {
  if (!str) return '—';
  var d = new Date(str);
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var h = d.getHours(), m = d.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ', ' + h + ':' + pad2(m) + ' ' + ampm;
}
function daysSince(str) {
  if (!str) return '—';
  var ms = Date.now() - new Date(str).getTime();
  var days = Math.floor(ms / 86400000);
  if (days === 0) return 'now';
  return days + ' day' + (days !== 1 ? 's' : '') + ' ago';
}

function getClass(pct, minReq) {
  if (pct >= minReq) return 'ok';
  if (pct >= minReq - 10) return 'warn';
  return 'danger';
}
function calcShortage(present, total, minReq) {
  if (total === 0) return 0;
  var pct = present / total;
  if (pct * 100 >= minReq) return 0;
  return Math.max(0, Math.ceil((minReq * total - 100 * present) / (100 - minReq)));
}
function buildGaugeSVG(pct, cls) {
  var r = 52, cx = 65, cy = 65;
  var circ = 2 * Math.PI * r;
  var fillColor = cls === 'ok' ? '#4caf50' : cls === 'warn' ? '#f59e0b' : '#ef4444';
  var dashLen = (pct / 100) * circ;
  return '<svg class="gauge-svg" width="130" height="130" viewBox="0 0 130 130">'
    + '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#e5e7eb" stroke-width="10"/>'
    + '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+fillColor+'" stroke-width="10"'
    + ' stroke-dasharray="'+dashLen+' '+circ+'" stroke-linecap="round"'
    + ' style="transition:stroke-dasharray .8s ease;"/></svg>';
}

// ══ DASHBOARD RENDER ═════════════════════════════════════════════════
var _data = null;

function renderPortal(d) {
  _data = d;
  var stu  = d.student;
  var att  = d.attendance;
  var usr  = d.user;
  var minR = att.minRequired;
  var oPct = att.overall;
  var oCls = getClass(oPct, minR);

  // Update sidebar
  var initials = stu.name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
  document.getElementById('av-initials').textContent = initials;
  document.getElementById('sb-av').textContent = initials;
  document.getElementById('tb-name').textContent = stu.name;
  document.getElementById('sb-name').textContent = stu.name;
  document.getElementById('sb-reg').textContent = stu.regNo || '—';

  var mustChange = sessionStorage.getItem('eams_mustChangePw') === '1';
  var html = '';
  if (mustChange) {
    html += '<div class="must-change-banner" style="background:#fff3cd;border:1.5px solid #f59e0b;border-radius:14px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px;">'
      + '<span style="font-size:20px;">🔐</span>'
      + '<div style="flex:1;"><div style="font-size:13px;font-weight:700;color:#92400e;">Password Change Required</div><div style="font-size:11.5px;color:#b45309;margin-top:2px;">Your default password must be changed before proceeding.</div></div>'
      + '<button onclick="openChangePw()" style="padding:8px 16px;border-radius:10px;background:#f59e0b;border:none;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:Poppins,sans-serif;">Change Now →</button>'
      + '</div>';
  }

  html += '<div id="live-session-container"></div>';

  // Hero
  var badgeClass = oCls === 'ok' ? 'badge-ok' : oCls === 'warn' ? 'badge-warn' : 'badge-danger';
  var badgeText  = oCls === 'ok' ? '✅ On Track' : oCls === 'warn' ? '⚠️ Below Threshold' : '🚨 Critical';
  html += '<div class="hero">'
    + '<div class="hero-av">'+initials+'</div>'
    + '<div class="hero-info">'
    + '<div class="hero-greeting">Welcome back,</div>'
    + '<div class="hero-name">'+stu.name+'</div>'
    + '<div style="font-size:11.5px;color:rgba(255,255,255,.7);margin-top:2px;">'+stu.regNo+' &nbsp;·&nbsp; '+(stu.deptName||'—')+'</div>'
    + '<div class="hero-pills">'
    + '<span class="hero-pill">🏫 '+(stu.className||'—')+'</span>'
    + '<span class="hero-pill">📅 '+(stu.academicYear||'—')+'</span>'
    + (stu.isClassRep?'<span class="hero-pill">⭐ Class Rep</span>':'')
    + '</div></div>'
    + '<div class="hero-right"><div class="hero-pct-wrap">'
    + '<div class="hero-pct">'+oPct+'%</div>'
    + '<div class="hero-pct-label">Overall Attendance</div>'
    + '<span class="hero-pct-badge '+badgeClass+'">'+badgeText+'</span>'
    + '</div></div></div>';

  // Stats
  var shortage = calcShortage(att.totalPresent, att.totalClasses, minR);
  html += '<div class="stats-row">'
    + '<div class="stat-card"><div class="sc-icon">📚</div><div class="sc-val">'+att.totalClasses+'</div><div class="sc-label">Total Classes</div><div class="sc-sub">Across all subjects</div></div>'
    + '<div class="stat-card"><div class="sc-icon">✅</div><div class="sc-val" style="color:var(--gK);">'+att.totalPresent+'</div><div class="sc-label">Present</div><div class="sc-sub">Classes attended</div></div>'
    + '<div class="stat-card"><div class="sc-icon">❌</div><div class="sc-val" style="color:#ef4444;">'+att.totalAbsent+'</div><div class="sc-label">Absent</div><div class="sc-sub">Classes missed</div></div>'
    + '<div class="stat-card"><div class="sc-icon">'+(shortage>0?'⚠️':'🎯')+'</div><div class="sc-val" style="color:'+(shortage>0?'#f59e0b':'var(--gK)')+';">'+(shortage>0?shortage:'—')+'</div><div class="sc-label">'+(shortage>0?'Classes Needed':'Requirement Met')+'</div><div class="sc-sub">To reach '+minR+'% threshold</div></div>'
    + '</div>';

  // Two-col: gauge + profile quick view
  var gaugeColor = oCls==='ok'?'var(--gK)':oCls==='warn'?'#b45309':'#dc2626';
  html += '<div class="two-col">';
  html += '<div class="card">'
    + '<div class="card-hd"><div class="card-title">📊 Attendance Overview</div></div>'
    + '<div class="card-body" style="display:flex;flex-direction:column;align-items:center;padding:20px;">'
    + '<div class="gauge-outer">'+buildGaugeSVG(oPct,oCls)
    + '<div class="gauge-center"><div class="gauge-pct-txt" style="color:'+gaugeColor+';">'+oPct+'%</div><div class="gauge-lbl-txt">Overall</div></div></div>'
    + '<div style="margin-top:18px;width:100%;display:flex;flex-direction:column;gap:8px;">'
    + gaugeRow('Present',att.totalPresent,att.totalClasses,'var(--gK)')
    + gaugeRow('Absent',att.totalAbsent,att.totalClasses,'#ef4444')
    + '<div style="padding:10px 0 0;border-top:1px solid var(--brl);text-align:center;font-size:11.5px;color:var(--tmu);">Minimum required: <b style="color:'+gaugeColor+';">'+minR+'%</b>'
    + (shortage>0?' &nbsp;·&nbsp; Need <b style="color:#dc2626;">'+shortage+'</b> more classes':' &nbsp;·&nbsp; <b style="color:var(--gK);">You are on track 🎉</b>')
    + '</div></div></div></div>';

  html += '<div class="card">'
    + '<div class="card-hd"><div class="card-title">👤 Student Profile</div>'
    + '<button onclick="showView(\'profile\')" style="font-size:11px;padding:4px 12px;border-radius:12px;border:1.5px solid var(--br);background:var(--gP);color:var(--tmu);cursor:pointer;font-family:Poppins,sans-serif;">View Full Profile →</button>'
    + '</div>'
    + '<div class="card-body"><div class="profile-grid">'
    + pRow('Register No.', stu.regNo)
    + pRow('Department', stu.deptName||'—')
    + pRow('Class', stu.className||'—')
    + pRow('Year', stu.year||'—')
    + pRow('Section', stu.section||'—')
    + pRow('Course', stu.courseType||'—')
    + pRow('Branch', stu.branch||'—')
    + pRow('Academic Year', stu.academicYear||'—')
    + pRow('Email', stu.email||usr.email||'—')
    + pRow('Blood Group', stu.bloodGroup||'—')
    + pRow('Last Login', usr.lastLogin ? fmtDate(usr.lastLogin) : 'First login')
    + pRow('Class Rep', stu.isClassRep?'Yes ⭐':'No')
    + '</div></div></div>';
  html += '</div>';

  // Subject table
  html += '<div class="card" style="margin-bottom:18px;">'
    + '<div class="card-hd"><div class="card-title">📖 Subject-wise Attendance</div>'
    + '<span style="font-size:11px;color:var(--tdi);">Click a subject row to see details</span>'
    + '</div>'
    + '<div style="overflow-x:auto;">'
    + '<table class="tbl"><thead><tr>'
    + '<th>Subject</th><th>Teacher</th><th>Present</th><th>Absent</th><th>Total</th><th style="min-width:140px;">Attendance</th><th>Status</th>'
    + '</tr></thead><tbody id="sub-tbody"></tbody></table></div></div>';

  html += '<div class="card">'
    + '<div class="card-hd"><div class="card-title">📅 Recent Attendance Log</div></div>'
    + '<div class="card-body">'
    + '<div class="tabs-row" id="sub-tabs"></div>'
    + '<div id="sub-cal"></div>'
    + '</div></div>';

  document.getElementById('main-content').innerHTML = html;
  renderSubjectTable(att.subjects, minR);
  renderSubjectTabs(att.subjects);
}

function gaugeRow(label, val, total, color) {
  var pct = total > 0 ? Math.round(val/total*100) : 0;
  return '<div style="display:flex;align-items:center;gap:8px;font-size:12px;">'
    + '<span style="width:10px;height:10px;border-radius:50%;background:'+color+';flex-shrink:0;display:inline-block;"></span>'
    + '<span style="color:var(--tmu);flex:1;">'+label+'</span>'
    + '<span style="font-weight:700;color:'+color+';">'+val+'</span>'
    + '<span style="color:var(--tdi);font-size:10px;">('+pct+'%)</span>'
    + '</div>';
}
function pRow(label, val) {
  return '<div class="prow"><div class="plabel">'+label+'</div><div class="pval">'+val+'</div></div>';
}

function renderSubjectTable(subjects, minR) {
  if (!subjects || !subjects.length) {
    document.getElementById('sub-tbody').innerHTML = '<tr><td colspan="7"><div class="empty-state"><span class="ei">📭</span><p>No attendance data found yet.</p></div></td></tr>';
    return;
  }
  var html = '';
  subjects.forEach(function(s, idx) {
    var cls = getClass(s.percentage, minR);
    var shortage = calcShortage(s.present, s.total, minR);
    var statusHtml = shortage > 0
      ? '<span class="shortage-badge">Need '+shortage+' more</span>'
      : '<span class="ok-badge">✅ On Track</span>';
    html += '<tr style="cursor:pointer;" onclick="toggleSubDetail('+idx+')">'
      + '<td class="b">📘 '+(s.subjectName||'—')+'</td>'
      + '<td>'+(s.teacherName||'—')+'</td>'
      + '<td style="color:var(--gK);font-weight:600;">'+s.present+'</td>'
      + '<td style="color:#ef4444;font-weight:600;">'+s.absent+'</td>'
      + '<td>'+s.total+'</td>'
      + '<td><div class="prog-wrap prog-'+cls+'"><div class="prog-bar"><div class="prog-fill" style="width:'+s.percentage+'%;"></div></div><div class="prog-pct">'+s.percentage+'%</div></div></td>'
      + '<td>'+statusHtml+'</td>'
      + '</tr>'
      + '<tr><td colspan="7" style="padding:0;"><div class="sub-detail-row" id="sub-detail-'+idx+'">'
      + renderDateChips(s.dates)
      + '</div></td></tr>';
  });
  document.getElementById('sub-tbody').innerHTML = html;
}

function renderDateChips(dates) {
  if (!dates || !dates.length) return '<div style="font-size:12px;color:var(--tdi);padding:4px;">No records yet.</div>';
  var chips = dates.slice().reverse().map(function(d) {
    return '<span class="att-chip '+d.status+'">'+d.date+' '+(d.status==='present'?'✅':'❌')+'</span>';
  }).join('');
  return '<div style="display:flex;flex-wrap:wrap;gap:2px;">'+chips+'</div>';
}

function toggleSubDetail(idx) {
  var el = document.getElementById('sub-detail-'+idx);
  if (!el) return;
  if (el.classList.contains('open')) { el.classList.remove('open'); }
  else { document.querySelectorAll('.sub-detail-row.open').forEach(function(e){e.classList.remove('open');}); el.classList.add('open'); }
}

function renderSubjectTabs(subjects) {
  if (!subjects || !subjects.length) {
    document.getElementById('sub-tabs').innerHTML = '';
    document.getElementById('sub-cal').innerHTML = '<div class="empty-state"><span class="ei">📭</span><p>No subjects found.</p></div>';
    return;
  }
  var tabsHtml = subjects.map(function(s, idx) {
    return '<button class="tab-btn'+(idx===0?' act':'')+'" onclick="switchSubjectCal('+idx+',this)">'+(s.subjectName||'Subject '+(idx+1))+'</button>';
  }).join('');
  document.getElementById('sub-tabs').innerHTML = tabsHtml;
  renderCalendar(subjects[0]);
}

function switchSubjectCal(idx, btn) {
  document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('act');});
  btn.classList.add('act');
  renderCalendar(_data.attendance.subjects[idx]);
}

function renderCalendar(subject) {
  var dates = subject ? subject.dates : [];
  var calEl = document.getElementById('sub-cal');
  if (!dates || !dates.length) {
    calEl.innerHTML = '<div class="empty-state"><span class="ei">📅</span><p>No attendance records for this subject yet.</p></div>';
    return;
  }
  var map = {};
  dates.forEach(function(d) { map[d.date] = d.status; });
  var today = new Date();
  var calStart = new Date(today);
  calStart.setDate(today.getDate() - today.getDay() - 28);
  var html = '<div style="font-size:12px;font-weight:600;color:var(--tmu);margin-bottom:10px;">Last 5 weeks — '+subject.subjectName+'</div>';
  html += '<div class="cal-grid">';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d) { html += '<div class="cal-day-hdr">'+d+'</div>'; });
  for (var i = 0; i < 35; i++) {
    var d = new Date(calStart); d.setDate(calStart.getDate()+i);
    var iso = d.toISOString().split('T')[0];
    var status = map[iso];
    var cls = 'empty';
    if (status === 'present') cls = 'present';
    else if (status === 'absent') cls = 'absent';
    var isToday = iso === new Date().toISOString().split('T')[0];
    html += '<div class="cal-day '+cls+(isToday?' today':'')+'" title="'+iso+(status?' — '+status:'')+'">'
      + (status?(status==='present'?'✅':'❌'):'<span style="opacity:.4;">'+d.getDate()+'</span>')
      + '</div>';
  }
  html += '</div>';
  html += '<div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap;">'
    + '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--tmu);"><div style="width:14px;height:14px;border-radius:4px;background:rgba(76,175,80,.15);"></div>Present</div>'
    + '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--tmu);"><div style="width:14px;height:14px;border-radius:4px;background:rgba(239,68,68,.1);"></div>Absent</div>'
    + '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--tmu);"><div style="width:14px;height:14px;border-radius:4px;background:#e5e7eb;"></div>No class</div>'
    + '</div>';
  calEl.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════
// MY PROFILE PAGE
// ══════════════════════════════════════════════════════════════════════
var _profileRendered = false;

function renderProfilePage(d) {
  // Prevent double-rendering with same data (still allow re-render after edits)
  var stu = d.student;
  var usr = d.user;
  var att = d.attendance;

  var initials = stu.name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();

  // Split name into parts
  var nameParts = stu.name.split(' ');
  var firstName  = stu.firstName  || nameParts[0] || '';
  var lastName   = stu.lastName   || nameParts.slice(1).join(' ') || '';

  var html = '';

  // ── PROFILE HERO
  html += '<div class="prof-hero">'
    + '<div class="prof-hero-av">'+initials+'</div>'
    + '<div class="prof-hero-info">'
    + '<div class="prof-hero-name">'+stu.name+'</div>'
    + '<div class="prof-hero-reg">'+stu.regNo+' &nbsp;·&nbsp; '+(stu.deptName||'—')+'</div>'
    + '<div class="prof-hero-tags">'
    + '<span class="prof-hero-tag">🏫 '+(stu.className||'—')+'</span>'
    + '<span class="prof-hero-tag">📅 '+(stu.academicYear||'—')+'</span>'
    + '<span class="prof-hero-tag">📖 '+(stu.courseType||'—')+'</span>'
    + (stu.isClassRep?'<span class="prof-hero-tag rep">⭐ Class Representative</span>':'')
    + '</div></div>'
    + '</div>';

  // ── SECTION 1: PROFILE INFO
  html += '<div class="prof-section" id="prof-info-section">'
    + '<div class="prof-section-hd">'
    + '<div class="prof-section-title">🪪 Profile Information</div>'
    + '<button class="btn-out" id="prof-edit-btn" onclick="toggleProfileEdit(true)" style="font-size:11.5px;padding:6px 14px;">✏️ Edit Profile</button>'
    + '</div>'
    + '<div class="prof-section-body">'

    // ─ Identity fields
    + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--tdi);margin-bottom:10px;">Identity</div>'
    + '<div class="fields-grid" style="margin-bottom:18px;">'
    + profField('Full Name', stu.name, 'prof-fullname', true)
    + profField('First Name', firstName, 'prof-firstname', true)
    + profField('Last Name', lastName, 'prof-lastname', true)
    + '</div>'

    // ─ Academic fields
    + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--tdi);margin-bottom:10px;">Academic Details</div>'
    + '<div class="fields-grid" style="margin-bottom:18px;">'
    + profFieldReadonly('Register No.', stu.regNo || '—')
    + profFieldReadonly('Class', stu.className || '—')
    + profFieldReadonly('Section', stu.section || '—')
    + profFieldReadonly('Branch', stu.branch || '—')
    + profFieldReadonly('Course', stu.courseType || '—')
    + profFieldReadonly('Department', stu.deptName || '—')
    + profField('Current Year', stu.year || '—', 'prof-year', true)
    + profFieldReadonly('Academic Year', stu.academicYear || '—')
    + '</div>'

    // ─ Contact & Account fields
    + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--tdi);margin-bottom:10px;">Contact &amp; Account</div>'
    + '<div class="fields-grid" style="margin-bottom:18px;">'
    + profField('Email', stu.email || usr.email || '—', 'prof-email', true)
    + profFieldReadonly('Username', usr.username || '—')
    + profFieldReadonly('Password', '••••••••')
    + '</div>'

    // ─ Status fields
    + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--tdi);margin-bottom:10px;">Status &amp; Roles</div>'
    + '<div class="fields-grid">'
    + profFieldBadge('Class Representative', stu.isClassRep ? 'Yes' : 'No', stu.isClassRep ? 'fb-yes' : 'fb-no', '⭐')
    + '</div>'

    // ─ Edit actions (hidden by default)
    + '<div class="edit-actions" id="prof-edit-actions" style="display:none;">'
    + '<button class="btn-pri" onclick="saveProfileEdit()" style="padding:9px 22px;">💾 Save Changes</button>'
    + '<button class="btn-out" onclick="toggleProfileEdit(false)">Cancel</button>'
    + '</div>'
    + '</div></div>';

  // ── SECTION 2: LOGIN ACTIVITY
  var firstAccess = getFirstAccessTime(usr);
  var firstDays   = daysSince(firstAccess);
  var currentTime = new Date().toISOString();
  var currentSub  = 'Session started: ' + fmtDateTime(sessionStorage.getItem('eams_session_start') || currentTime);

  html += '<div class="prof-section">'
    + '<div class="prof-section-hd">'
    + '<div class="prof-section-title">🔒 Login Activity</div>'
    + '</div>'
    + '<div class="prof-section-body">'
    + '<div class="activity-header">'
    + '<div class="act-stat"><div class="act-stat-label">First Access to Site</div>'
    + '<div class="act-stat-val">'+fmtDateTime(firstAccess)+'</div>'
    + '<div class="act-stat-sub">('+firstDays+')</div></div>'
    + '<div class="act-stat"><div class="act-stat-label">Current Time</div>'
    + '<div class="act-stat-val">'+fmtDateTime(currentTime)+'</div>'
    + '<div class="act-stat-sub">'+currentSub+'</div></div>'
    + '</div>'
    + '<div class="act-btns">'
    + '<button class="btn-out" onclick="openLoginActivity()" style="font-size:12px;padding:8px 16px;">📋 View Activity</button>'
    + '<button class="btn-warn" onclick="openModal(\'m-unknown\')" style="font-size:12px;padding:8px 16px;">⚠️ Unknown Login?</button>'
    + '<button class="btn-danger" onclick="logoutAllDevices()" style="font-size:12px;padding:8px 16px;">🔴 Logout from All Devices</button>'
    + '</div>'
    + '</div></div>';

  // ── SECTION 3: SESSION INFO
  var sessionStart = sessionStorage.getItem('eams_session_start') || new Date().toISOString();
  if (!sessionStorage.getItem('eams_session_start')) {
    sessionStorage.setItem('eams_session_start', sessionStart);
  }

  html += '<div class="prof-section">'
    + '<div class="prof-section-hd">'
    + '<div class="prof-section-title">📡 Current Session Info</div>'
    + '<span id="session-live-badge" style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;padding:3px 10px;border-radius:10px;background:rgba(76,175,80,.12);color:var(--gK);">'
    + '<span class="act-dot"></span> Active</span>'
    + '</div>'
    + '<div class="prof-section-body">'
    + '<div class="session-grid">'
    + '<div class="sess-item"><div class="sess-label">Session Duration</div><div class="sess-val live" id="session-timer">Calculating…</div><div class="sess-sub">Time since login</div></div>'
    + '<div class="sess-item"><div class="sess-label">Session Started</div><div class="sess-val">'+fmtDateTime(sessionStart)+'</div><div class="sess-sub">This session began at this time</div></div>'
    + '<div class="sess-item"><div class="sess-label">Device Type</div><div class="sess-val">'+getDeviceType()+'</div><div class="sess-sub">Browser: '+getBrowserName()+'</div></div>'
    + '<div class="sess-item"><div class="sess-label">Token Expiry</div><div class="sess-val" id="token-expiry">—</div><div class="sess-sub">Automatic session timeout</div></div>'
    + '</div>'
    + '</div></div>';

  // ── SECTION 4: CHANGE PASSWORD
  html += '<div class="prof-section">'
    + '<div class="prof-section-hd">'
    + '<div class="prof-section-title">🔐 Change Password</div>'
    + '</div>'
    + '<div class="prof-section-body">'
    + '<div id="prof-pw-err" class="err-msg"></div>'
    + '<div class="chpw-grid">'
    + '<div class="fg" style="margin-bottom:0;">'
    + '<label class="fl">Current Password</label>'
    + '<div class="pw-wrap"><input type="password" class="fc2" id="prof-pw-old" placeholder="Current password"><button type="button" class="pw-eye" onclick="togglePw(\'prof-pw-old\',this)">👁</button></div>'
    + '</div>'
    + '<div class="fg" style="margin-bottom:0;">'
    + '<label class="fl">New Password</label>'
    + '<div class="pw-wrap"><input type="password" class="fc2" id="prof-pw-new" placeholder="Min. 6 characters" oninput="updateStrength(this.value,\'prof-pw-strength\')"><button type="button" class="pw-eye" onclick="togglePw(\'prof-pw-new\',this)">👁</button></div>'
    + '<div class="strength-bar"><div class="strength-fill" id="prof-pw-strength" style="width:0%;"></div></div>'
    + '</div>'
    + '<div class="fg" style="margin-bottom:0;">'
    + '<label class="fl">Confirm New Password</label>'
    + '<div class="pw-wrap"><input type="password" class="fc2" id="prof-pw-confirm" placeholder="Repeat new password"><button type="button" class="pw-eye" onclick="togglePw(\'prof-pw-confirm\',this)">👁</button></div>'
    + '</div>'
    + '</div>'
    + '<div style="margin-top:16px;">'
    + '<button class="btn-pri" onclick="doChangePwInline()" style="padding:10px 28px;">Update Password</button>'
    + '</div>'
    + '</div></div>';

  document.getElementById('profile-content').innerHTML = html;

  // Start session timer
  startSessionTimer(sessionStart);
  // Parse token for expiry
  updateTokenExpiry();
}

// ── Profile field helpers ─────────────────────────────────────────
function profField(label, val, id, editable) {
  return '<div class="field-group">'
    + '<div class="field-label">'+label+'</div>'
    + '<div class="field-val" id="'+id+'-display">'+val+'</div>'
    + (editable?'<input type="text" class="fc2" id="'+id+'-input" value="'+val+'" style="display:none;">':'')
    + '</div>';
}
function profFieldReadonly(label, val) {
  return '<div class="field-group">'
    + '<div class="field-label">'+label+'</div>'
    + '<div class="field-val">'+val+'</div>'
    + '</div>';
}
function profFieldBadge(label, val, cls, icon) {
  return '<div class="field-group">'
    + '<div class="field-label">'+label+'</div>'
    + '<div><span class="field-badge '+cls+'">'+icon+' '+val+'</span></div>'
    + '</div>';
}

// ── Profile edit toggle ─────────────────────────────────────────
var _editableFields = ['prof-fullname','prof-firstname','prof-lastname','prof-year','prof-email'];
function toggleProfileEdit(on) {
  _editableFields.forEach(function(id) {
    var display = document.getElementById(id+'-display');
    var input   = document.getElementById(id+'-input');
    if (!display || !input) return;
    if (on) { display.style.display='none'; input.style.display='block'; }
    else     { display.style.display='block'; input.style.display='none'; }
  });
  var btn = document.getElementById('prof-edit-btn');
  var acts = document.getElementById('prof-edit-actions');
  if (btn) btn.style.display = on ? 'none' : 'inline-flex';
  if (acts) acts.style.display = on ? 'flex' : 'none';
}

function saveProfileEdit() {
  var email     = (document.getElementById('prof-email-input')||{}).value || '';
  var firstName = (document.getElementById('prof-firstname-input')||{}).value || '';
  var lastName  = (document.getElementById('prof-lastname-input')||{}).value || '';
  var year      = (document.getElementById('prof-year-input')||{}).value || '';

  if (!email || !email.includes('@')) {
    toast('Please enter a valid email address.', 'error'); return;
  }

  api('/api/profile/me', {
    method: 'PUT',
    body: JSON.stringify({ email: email, firstName: firstName, lastName: lastName, currentYear: year })
  })
  .then(function(d) {
    if (d.error) { toast(d.error, 'error'); return; }
    toast('Profile updated successfully!');
    // Update display values
    var fullName = (firstName + ' ' + lastName).trim();
    setFieldDisplay('prof-fullname', fullName);
    setFieldDisplay('prof-firstname', firstName);
    setFieldDisplay('prof-lastname', lastName);
    setFieldDisplay('prof-email', email);
    setFieldDisplay('prof-year', year);
    // Update topbar
    document.getElementById('tb-name').textContent = fullName;
    document.getElementById('sb-name').textContent = fullName;
    var initials = fullName.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
    document.getElementById('av-initials').textContent = initials;
    document.getElementById('sb-av').textContent = initials;
    document.getElementById('prof-hero-av') && (document.getElementById('prof-hero-av').textContent = initials);
    toggleProfileEdit(false);
  })
  .catch(function(e) { toast(e.message, 'error'); });
}

function setFieldDisplay(id, val) {
  var d = document.getElementById(id+'-display');
  var i = document.getElementById(id+'-input');
  if (d) d.textContent = val;
  if (i) i.value = val;
}

// ── Login activity helpers ─────────────────────────────────────────
var _loginActivities = null;

function openLoginActivity() {
  api('/api/auth/login-history').then(function(data) {
    if (data.error) { toast(data.error, 'error'); return; }
    _loginActivities = data.history || [];
    var tbody = document.getElementById('activity-tbody');
    var opts  = document.getElementById('unknown-session-select');
    var rows  = '';
    var selectOpts = '<option value="">Select a session…</option>';
    _loginActivities.slice().reverse().forEach(function(a, idx) {
      var typeCls = a.type==='web'?'lt-web':a.type==='mobile'?'lt-mobile':'lt-unknown';
      var typeLabel = a.type==='web'?'🌐 Web':a.type==='mobile'?'📱 Mobile':'❓ Unknown';
      var deviceIcon = a.type==='mobile'?'📱':'💻';
      rows += '<tr>'
        + '<td style="white-space:nowrap;font-size:11.5px;color:var(--td);font-weight:500;">'+fmtDateTime(a.time)+'</td>'
        + '<td><span class="device-tag"><span class="device-icon">'+deviceIcon+'</span>'+a.device+'</span></td>'
        + '<td><span class="ip-code">'+a.ip+'</span></td>'
        + '<td><span class="login-type-badge '+typeCls+'">'+typeLabel+'</span></td>'
        + '<td>'+(a.current?'<span class="act-current"><span class="act-dot"></span>Current</span>':'<span style="font-size:11px;color:var(--tdi);">Ended</span>')+'</td>'
        + '</tr>';
      if (!a.current) {
        selectOpts += '<option value="'+idx+'">'+fmtDateTime(a.time)+' — '+a.ip+'</option>';
      }
    });
    tbody.innerHTML = rows;
    if (opts) opts.innerHTML = selectOpts;
    openModal('m-activity');
  }).catch(function(e) { toast('Failed to load login history', 'error'); });
}

function reportUnknownLogin() {
  closeModal('m-activity');
  setTimeout(function() { openModal('m-unknown'); }, 250);
}

function submitUnknownReport() {
  var sel = document.getElementById('unknown-session-select');
  var sessionId = sel ? sel.value : '';
  api('/api/auth/report-unknown', {
    method: 'POST',
    body: JSON.stringify({ sessionId: sessionId || undefined })
  })
  .then(function(d) {
    if (d.error) { toast(d.error, 'error'); return; }
    toast('Account secured. All sessions terminated. Please login again.', 'warn');
    closeModal('m-unknown');
    setTimeout(doLogout, 2000);
  })
  .catch(function(e) { toast(e.message, 'error'); });
}

function logoutAllDevices() {
  if (!confirm('This will log you out of all devices including this one. Continue?')) return;
  api('/api/auth/logout-all', { method:'POST' })
  .then(function(d) {
    if (d.error) { toast(d.error, 'error'); return; }
    toast('Logged out from all devices.');
    setTimeout(doLogout, 2000);
  })
  .catch(function() {
    // fallback: still logout locally
    toast('Logged out from all devices.');
    setTimeout(doLogout, 2000);
  });
}

function getFirstAccessTime(usr) {
  if (usr && usr.firstLogin) return usr.firstLogin;
  if (usr && usr.createdAt) return usr.createdAt;
  if (usr && usr.lastLogin) return usr.lastLogin;
  return new Date().toISOString();
}

function shouldForcePasswordChange(userObj) {
  if (!userObj) return false;
  return !!(
    userObj.mustChangePassword ||
    userObj.forcePasswordChange ||
    userObj.requirePasswordChange ||
    userObj.isFirstLogin ||
    userObj.firstLoginRequired
  );
}

// ── Session timer ─────────────────────────────────────────────────
var _sessionTimerInterval = null;
function startSessionTimer(startIso) {
  if (_sessionTimerInterval) clearInterval(_sessionTimerInterval);
  function update() {
    var el = document.getElementById('session-timer');
    if (!el) { clearInterval(_sessionTimerInterval); return; }
    var diff = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
    var h = Math.floor(diff / 3600);
    var m = Math.floor((diff % 3600) / 60);
    el.textContent = (h > 0 ? h + 'h ' : '') + pad2(m) + 'm';
  }
  update();
  _sessionTimerInterval = setInterval(update, 60000);
}

function updateTokenExpiry() {
  var el = document.getElementById('token-expiry');
  if (!el) return;
  try {
    var payload = JSON.parse(atob(TOKEN.split('.')[1]));
    if (payload.exp) {
      var expDate = new Date(payload.exp * 1000);
      var mins = Math.round((expDate - Date.now()) / 60000);
      if (mins > 0) {
        el.textContent = mins >= 60 ? Math.round(mins/60) + 'h remaining' : mins + ' min remaining';
        el.style.color = mins < 30 ? '#dc2626' : 'var(--gK)';
      } else {
        el.textContent = 'Expired';
        el.style.color = '#dc2626';
      }
    }
  } catch(e) {
    el.textContent = '1h remaining';
    el.style.color = 'var(--gK)';
  }
}

// ── Device/browser utils ─────────────────────────────────────────
function getDeviceType() {
  var ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return '📱 Mobile';
  if (/Tablet|iPad/i.test(ua)) return '📲 Tablet';
  return '💻 Desktop';
}
function getBrowserName() {
  var ua = navigator.userAgent;
  if (/Edg/.test(ua)) return 'Microsoft Edge';
  if (/Chrome/.test(ua)) return 'Chrome';
  if (/Firefox/.test(ua)) return 'Firefox';
  if (/Safari/.test(ua)) return 'Safari';
  return 'Unknown Browser';
}

// ══ BOOT ══════════════════════════════════════════════════════════════
api('/api/student/me').then(function(d) {
  if (d.error) { toast(d.error, 'error'); return; }
  if (d.user && shouldForcePasswordChange(d.user)) {
    sessionStorage.setItem('eams_mustChangePw', '1');
  }
  renderPortal(d);
  if (sessionStorage.getItem('eams_mustChangePw') === '1') {
    setTimeout(openChangePw, 600);
  }
  // If profile view is already active (e.g. via direct link), render it
  if (_currentView === 'profile') renderProfilePage(d);
}).catch(function(e) {
  document.getElementById('main-content').innerHTML =
    '<div class="loading-screen"><span style="font-size:40px;">⚠️</span><div style="font-size:14px;color:#dc2626;">'+e.message+'</div><a href="index.html" style="color:var(--gK);font-size:13px;font-weight:600;">← Back to Login</a></div>';
  document.getElementById('profile-content').innerHTML =
    '<div class="loading-screen"><span style="font-size:40px;">⚠️</span><div style="font-size:14px;color:#dc2626;">'+e.message+'</div></div>';
});

// ══ LIVE SESSION POLLING ══════════════════════════════════════════════
var activeLiveSessionId = null;
function pollLiveSessionActive() {
  fetch('/api/live-session/active', {
    headers: { 'Authorization': 'Bearer ' + sessionStorage.getItem('eams_token') }
  })
  .then(function(res){ return res.json(); })
  .then(function(d) {
    var cont = document.getElementById('live-session-container');
    if (!cont) return;
    if (d.active) {
      activeLiveSessionId = d.sessionId;
      if (d.alreadyMarked) {
        cont.innerHTML = '<div style="background:#f0fdfa;border:1.5px solid #5eead4;border-radius:14px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px;">'
          + '<span style="font-size:24px;">✅</span>'
          + '<div style="flex:1;"><div style="font-size:13px;font-weight:700;color:#0f766e;">Attendance Marked</div><div style="font-size:11.5px;color:#115e59;margin-top:2px;">You have successfully marked your attendance for '+d.subjectName+'.</div></div>'
          + '</div>';
      } else {
        cont.innerHTML = '<div style="background:#fdf4ff;border:1.5px solid #f0abfc;border-radius:14px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px;">'
          + '<span style="font-size:24px;">📡</span>'
          + '<div style="flex:1;"><div style="font-size:13px;font-weight:700;color:#86198f;">Live Class Active: '+d.subjectName+'</div><div style="font-size:11.5px;color:#701a75;margin-top:2px;">Enter the passcode shown by your teacher to mark attendance.</div></div>'
          + '<input type="text" id="live-passcode" placeholder="----" maxlength="4" style="width:70px;text-align:center;font-size:18px;font-weight:bold;letter-spacing:3px;padding:8px;border:1px solid #f0abfc;border-radius:8px;">'
          + '<button onclick="submitLiveSession()" style="padding:10px 16px;border-radius:10px;background:#d946ef;border:none;color:#fff;font-size:12px;font-weight:700;cursor:pointer;margin-left:8px;">Mark</button>'
          + '</div>';
      }
    } else {
      activeLiveSessionId = null;
      cont.innerHTML = '';
    }
  })
  .catch(function(e){});
}
window.submitLiveSession = function() {
  if (!activeLiveSessionId) return;
  var code = document.getElementById('live-passcode').value;
  if (!code || code.length < 4) { toast('Enter 4-digit passcode', 'warn'); return; }
  fetch('/api/live-session/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sessionStorage.getItem('eams_token') },
    body: JSON.stringify({ sessionId: activeLiveSessionId, passcode: code })
  })
  .then(function(res){ return res.json(); })
  .then(function(d) {
    if (d.error) { toast(d.error, 'error'); return; }
    toast('Attendance Self-Marked!', 'success');
    pollLiveSessionActive();
  })
  .catch(function(e){ toast('Error submitting', 'error'); });
};
setInterval(pollLiveSessionActive, 10000);
setTimeout(pollLiveSessionActive, 1500);

// Security
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
document.addEventListener('keydown', function(e) {
  if (e.key==='F12'||(e.ctrlKey&&e.shiftKey&&['I','J','C'].includes(e.key))||(e.ctrlKey&&e.key==='U')) {
    e.preventDefault(); return false;
  }
});