function toggleBulkSidebar() {
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

function goBack() { window.location.href = "./admin.html"; }

var DB = {
  get: function (c) { try { return JSON.parse(localStorage.getItem('ss3_' + c) || '[]'); } catch (e) { return []; } },
  set: function (c, d) { localStorage.setItem('ss3_' + c, JSON.stringify(d)); },
  insert: function (c, doc) { var r = DB.get(c); doc._id = '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); r.push(doc); DB.set(c, r); return doc; },
  update: function (c, id, u) { var r = DB.get(c), i = r.findIndex(function (x) { return x._id === id; }); if (i >= 0) { r[i] = Object.assign({}, r[i], u); DB.set(c, r); } },
  delete: function (c, id) { DB.set(c, DB.get(c).filter(function (x) { return x._id !== id; })); },
  find: function (c, q) { q = q || {}; return DB.get(c).filter(function (d) { return Object.keys(q).every(function (k) { return d[k] === q[k]; }); }); },
  one: function (c, q) { q = q || {}; return DB.get(c).find(function (d) { return Object.keys(q).every(function (k) { return d[k] === q[k]; }); }) || null; },
};

var WIZARD_STEPS = [
  { key: 'wizard', icon:'🧙‍♂️', label:'Start', tab:'wizard' },
  { key: 'dept',    icon: '🏛️',  label: 'Departments', tab: 'dept'    },
  { key: 'teacher', icon: '👩‍🏫', label: 'Teachers',    tab: 'teacher' },
  { key: 'class',   icon: '🏫',  label: 'Classes',     tab: 'class'   },
  { key: 'subject', icon: '📚',  label: 'Subjects',    tab: 'subject' },
  { key: 'student', icon: '👨‍🎓', label: 'Students',    tab: 'student' },
];
var _wizDone = {}, _wizActive = '';

function initWizard() {
  var adminName = sessionStorage.getItem('adminName') || sessionStorage.getItem('name') || 'Administrator';
  var nameEl = document.getElementById('sb-name');
  var avEl   = document.getElementById('sb-av');
  if (nameEl) nameEl.textContent = adminName;
  if (avEl)   avEl.textContent   = adminName.charAt(0).toUpperCase();

  var isEmpty = DB.get('depts').length === 0 && DB.get('classes').length === 0;
  var isDeptEmpty = DB.get('depts').length === 0;
  document.getElementById('wizard-banner').style.display = isEmpty ? 'block' : 'none';
  document.getElementById('wizard-badge').style.display  = isEmpty ? 'inline-flex' : 'none';
  if (isEmpty) renderWizSteps();

  if (isDeptEmpty) {
    var wizBtn = document.getElementById('wz-tab-wizard');
    if (wizBtn) bulkTab(wizBtn, 'wizard');
  } else {
    var deptBtn = document.getElementById('wz-tab-dept');
    if (deptBtn) bulkTab(deptBtn, 'dept');
  }

  var wizTab = document.getElementById('wz-tab-wizard');
  if (wizTab) {
    wizTab.style.display = isDeptEmpty ? '' : 'none';
  }
}

function dismissWizard() {
  document.getElementById('wizard-banner').style.display = 'none';
  document.getElementById('wizard-badge').style.display  = 'none';
}

function renderWizSteps() {
  var row = document.getElementById('wiz-steps-row');
  if (!row) return;
  row.innerHTML = WIZARD_STEPS.map(function (s, i) {
    var done   = !!_wizDone[s.key];
    var active = _wizActive === s.key;
    var cls    = 'wiz-pill' + (done ? ' done' : '') + (active ? ' active' : '');
    return '<div class="' + cls + '" onclick="wizGoTo(\'' + s.tab + '\')" id="wiz-step-' + s.key + '">'
      + '<div class="wiz-pill-num">' + (done ? '✓' : (i + 1)) + '</div>'
      + '<span style="font-size:16px;">' + s.icon + '</span>'
      + '<span>' + s.label + '</span>'
      + (done ? '<span style="font-size:10px;color:#4ade80;">✅</span>' : '')
      + '</div>';
  }).join('');
  var done  = Object.keys(_wizDone).length;
  var total = WIZARD_STEPS.length;
  var pct   = Math.round(done / total * 100);
  document.getElementById('wiz-bar-fill').style.width = pct + '%';
  document.getElementById('wiz-bar-lbl').textContent  = 'Step ' + done + ' of ' + total + ' complete (' + pct + '%)';
}

function wizGoTo(tab) {
  var btn = document.getElementById('wz-tab-' + tab);
  if (btn) bulkTab(btn, tab);
}

function wizMarkDone(key) {
  _wizDone[key] = true;
  var t = document.getElementById('wz-tab-' + key);
  if (t) t.classList.add('tab-done');
  renderWizSteps();
  if (WIZARD_STEPS.every(function (s) { return _wizDone[s.key]; })) {
    showWizComplete();
    return;
  }
  var idx = WIZARD_STEPS.findIndex(function (s) { return s.key === key; });
  if (idx >= 0 && idx < WIZARD_STEPS.length - 1) {
    var next = WIZARD_STEPS[idx + 1];
    showNextStepPopup(WIZARD_STEPS[idx], next);
  }
}

var _nspTimeout = null;
function showNextStepPopup(current, next) {
  clearTimeout(_nspTimeout);
  document.getElementById('nsp-icon').textContent = next.icon || '➡️';
  document.getElementById('nsp-top').textContent = '✅ ' + current.label + ' complete!';
  document.getElementById('nsp-sub').textContent =
    'All data saved. Proceed to upload ' + next.label + '?';
  var goBtn = document.getElementById('nsp-go-btn');
  goBtn.textContent = 'Upload ' + next.label + ' →';
  goBtn.onclick = function () { closeNextStepPopup(); wizGoTo(next.tab); };
  document.getElementById('next-step-popup').classList.add('show');
  _nspTimeout = setTimeout(closeNextStepPopup, 10000);
}

function closeNextStepPopup() {
  clearTimeout(_nspTimeout);
  document.getElementById('next-step-popup').classList.remove('show');
}

function showWizComplete() {
  var b = document.getElementById('wizard-banner');
  if (!b) return;
  b.innerHTML = '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">'
    + '<div style="font-size:44px;">🎉</div>'
    + '<div style="flex:1;"><div style="font-size:17px;font-weight:800;margin-bottom:4px;">Setup Complete!</div>'
    + '<div style="font-size:12.5px;opacity:.85;">All institution data imported. Your EAMS is ready.</div></div>'
    + '<a href="admin.html" style="padding:10px 22px;border-radius:22px;border:1.5px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;">Go to Dashboard →</a>'
    + '</div>';
}

function bulkTab(btn, tab) {
  document.querySelectorAll('.sb-item.bulk-tab').forEach(function (b) { b.classList.remove('act'); });
  btn.classList.add('act');
  document.querySelectorAll('.bulk-panel').forEach(function (p) { p.style.display = 'none'; });
  var p = document.getElementById('bulk-' + tab);
  if (p) p.style.display = '';
  if (tab === 'wizard') {
    document.getElementById('wizard-banner').style.display = 'block';
  }
  _wizActive = tab;
  renderWizSteps();
}

var _confCb = null, _confChoice = null;

function showConflictDialog(existing, incoming, keyLabel, cb) {
  _confCb = cb;
  document.getElementById('conflict-apply-all').checked = false;
  document.getElementById('conflict-msg').innerHTML = '<b>' + esc(keyLabel) + '</b> already exists in the database with differences.';
  var fields = Object.keys(incoming).filter(function (k) { return k !== '_id' && k !== 'createdAt'; });
  document.getElementById('conflict-db-data').innerHTML = fields.map(function (k) {
    return '<div class="frow"><span class="fkey">' + k + '</span><span class="fval">' + esc(existing[k] !== undefined ? existing[k] : '—') + '</span></div>';
  }).join('');
  document.getElementById('conflict-upload-data').innerHTML = fields.map(function (k) {
    var diff = String(existing[k] || '') !== String(incoming[k] || '');
    return '<div class="frow"><span class="fkey">' + k + (diff ? '<span class="chg-badge">changed</span>' : '') + '</span>'
      + '<span class="fval' + (diff ? ' diff' : '') + '">' + esc(incoming[k] !== undefined ? incoming[k] : '—') + '</span></div>';
  }).join('');
  var diffs   = fields.filter(function (k) { return String(existing[k] || '') !== String(incoming[k] || ''); });
  var diffEl  = document.getElementById('conflict-diff-list');
  diffEl.style.display = diffs.length ? 'block' : 'none';
  diffEl.innerHTML     = diffs.length
    ? '⚡ <b>' + diffs.length + '</b> field' + (diffs.length > 1 ? 's' : '') + ' differ: ' + diffs.join(', ')
    : '';
  document.getElementById('conflict-compare-wrap').style.display = 'grid';
  document.getElementById('bulk-conflict-overlay').classList.add('open');
}

function resolveConflict(choice) {
  if (choice === 'cancel') {
    _confCb     = null;
    _confChoice = null;
    document.getElementById('bulk-conflict-overlay').classList.remove('open');
    showToast('Upload cancelled', 'warn');
    return;
  }
  if (document.getElementById('conflict-apply-all').checked) _confChoice = choice;
  document.getElementById('bulk-conflict-overlay').classList.remove('open');
  if (_confCb) { var cb = _confCb; _confCb = null; cb(choice); }
}

function checkConflict(existing, incoming, keyLabel, onDecide) {
  var fields = Object.keys(incoming).filter(function (k) { return k !== '_id'; });
  if (fields.every(function (k) { return String(existing[k] || '') === String(incoming[k] || ''); })) {
    onDecide('skip');
    return;
  }
  if (_confChoice) { onDecide(_confChoice); return; }
  showConflictDialog(existing, incoming, keyLabel, onDecide);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showUploadPreview(elId, added, skipped, errors) {
  var el = document.getElementById(elId);
  if (!el) return;
  errors = errors || [];
  var errHtml = errors.slice(0, 8).map(function (e) {
    return '<div class="up-err-row">Row <b>' + e.row + '</b> <span style="color:var(--tmu);">' + esc(e.name || '') + '</span> — <span class="issue">' + e.issues.join('; ') + '</span></div>';
  }).join('');
  var more = errors.length > 8
    ? '<div style="font-size:11px;color:var(--tdi);padding:4px 0;">…and ' + (errors.length - 8) + ' more skipped</div>'
    : '';
  el.innerHTML = '<div class="up-result">'
    + '<div class="up-stat-row">'
    + '<div class="up-stat"><span class="v">' + added + '</span><span class="l">Added</span></div>'
    + '<div class="up-stat"><span class="v" style="color:var(--amber);">' + skipped + '</span><span class="l">Skipped</span></div>'
    + '<div class="up-stat"><span class="v" style="color:var(--blue);">' + (added + skipped) + '</span><span class="l">Total</span></div>'
    + '</div>'
    + (errHtml ? '<div class="up-errors">' + errHtml + more + '</div>' : '')
    + '</div>';
}

function dlTemplate(type) {
  var T = {
    dept:    [['DeptName', 'Code', 'Icon'],                                                                                        ['Computer Science Engineering', 'CSE', '💻']],
    teacher: [['Name', 'EmployeeID', 'Department', 'Designation', 'Username', 'Password'],                                         ['John Doe', 'EMP001', 'CSE', 'Assistant Professor', 'johndoe', 'teacher123']],
    class:   [['Department', 'HallNo', 'Year', 'Semester', 'Section'],                                                             ['CSE', 'LH01', 'I Year', 'I', 'A']],
    subject: [['Name', 'Code', 'Department', 'Credits', 'Type', 'Teacher'],                                                        ['Data Structures', 'CS201', 'CSE', '4', 'Theory', '']],
    student: [['FullName', 'RegisterNo', 'AcademicYear', 'CourseType', 'Branch', 'Department', 'Year', 'Class', 'Section', 'Email', 'Username', 'Password'], ['Arun Kumar', '714025104000', '2025-26', 'UG', 'B.E', 'Computer Science Engineering', 'I Year', 'CSE-I-A', 'A', 'arun@eams.edu', 'arun25', 'Student@123']],
  };
  var data = T[type] || [['No template']];
  var ws = XLSX.utils.aoa_to_sheet(data), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type);
  XLSX.writeFile(wb, 'EAMS_' + type + '_template.xlsx');
}

function dlUploaded(collection, roleFilter) {
  var data = DB.get(collection);
  if (roleFilter) data = data.filter(function (r) { return r.role === roleFilter; });
  if (!data.length) { showToast('No data to download', 'warn'); return; }
  var clean = data.map(function (r) { var c = Object.assign({}, r); delete c.password; delete c._id; return c; });
  var ws = XLSX.utils.json_to_sheet(clean), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, collection);
  XLSX.writeFile(wb, 'EAMS_' + collection + '_export.xlsx');
}

function hd(event, type) {
  event.preventDefault();
  event.currentTarget.classList.remove('dg');
  var f = event.dataTransfer.files[0];
  if (f) processFile(f, type);
}

function hu(input, type) {
  var f = input.files[0];
  if (f) processFile(f, type);
  input.value = '';
}

function processFile(file, type) {
  _confChoice = null;
  var reader  = new FileReader();
  reader.onload = function (e) {
    try {
      var wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if      (type === 'dept')     parseDeptRows(rows);
      else if (type === 'struct')   parseStructureRows(rows);
      else if (type === 'subjects') parseSubjectRows(rows);
      else if (type === 'students') parseStudentRows(rows);
      else if (type === 'teachers') parseTeacherRows(rows);
    } catch (err) {
      showToast('Error reading file: ' + err.message, 'warn');
    }
  };
  reader.readAsArrayBuffer(file);
}

function nk(k) { return k.toString().toLowerCase().replace(/[^a-z]/g, ''); }
function cv(row, aliases) {
  var keys = Object.keys(row);
  for (var i = 0; i < aliases.length; i++) {
    var m = keys.find(function (k) { return nk(k).includes(nk(aliases[i])); });
    if (m) return String(row[m]).trim();
  }
  return '';
}

function parseDeptRows(rows) {
  var added = 0, skipped = 0, pending = rows.slice();

  function next() {
    if (!pending.length) {
      showUploadPreview('dept-up', added, skipped);
      showToast('Departments: ' + added + ' added, ' + skipped + ' skipped');
      if (added > 0) wizMarkDone('dept');
      return;
    }
    var row  = pending.shift();
    var name = cv(row, ['deptname', 'name', 'dept']);
    var code = cv(row, ['code', 'deptcode']);
    var icon = cv(row, ['icon']) || '🏛️';

    if (!name || !code) { skipped++; next(); return; }

    var ex = DB.get('depts').find(function (d) {
      return d.code.toUpperCase() === code.toUpperCase() || d.name.toLowerCase() === name.toLowerCase();
    });

    if (ex) {
      checkConflict(ex, { name: name, code: code.toUpperCase(), icon: icon }, 'Dept: ' + name, function (c) {
        if (c === 'replace') {
          DB.update('depts', ex._id, { name: name, code: code.toUpperCase(), icon: icon });
          added++;
        } else {
          skipped++;
        }
        next();
      });
    } else {
      DB.insert('depts', { name: name, code: code.toUpperCase(), icon: icon });
      added++;
      next();
    }
  }
  next();
}

function parseStructureRows(rows) {
  var added = 0, skipped = 0;
  rows.forEach(function (row) {
    var dn   = cv(row, ['dept', 'department']);
    var dc   = cv(row, ['code', 'deptcode']);
    var sem  = cv(row, ['sem', 'semester']);
    var sec  = cv(row, ['sec', 'section']);
    var yr   = cv(row, ['year']);
    var hall = cv(row, ['hall', 'hallno']);

    if (!dn) { skipped++; return; }

    var dept = DB.get('depts').find(function (d) { return d.name === dn || d.code === dc; });
    if (!dept) dept = DB.insert('depts', { name: dn, code: dc || dn.slice(0, 4).toUpperCase(), icon: '🏛️' });

    if (DB.one('classes', { deptId: dept._id, sem: sem, section: sec, year: yr || 'I Year' })) {
      skipped++;
      return;
    }

    DB.insert('classes', {
      deptId:   dept._id,
      deptName: dept.name,
      deptCode: dept.code,
      year:     yr || 'I Year',
      sem:      sem || 'I',
      section:  sec || 'A',
      hallNo:   hall,
      name:     dept.code + '-' + (sem || 'I') + '-' + (sec || 'A'),
    });
    added++;
  });
  showUploadPreview('sup', added, skipped);
  showToast('Classes: ' + added + ' added, ' + skipped + ' skipped');
  if (added > 0) wizMarkDone('class');
}

function parseSubjectRows(rows) {
  var added = 0, skipped = 0;
  rows.forEach(function (row) {
    var name    = cv(row, ['name', 'subject']);
    var code    = cv(row, ['code']);
    var dc      = cv(row, ['dept', 'department', 'deptcode']);
    var credits = parseInt(cv(row, ['credit', 'credits'])) || 3;
    var type    = cv(row, ['type']) || 'Theory';

    if (!name) { skipped++; return; }

    var dept = DB.get('depts').find(function (d) { return d.code === dc || d.name === dc; });
    if (!dept) { skipped++; return; }

    if (DB.one('subjects', { code: code, deptId: dept._id })) { skipped++; return; }

    DB.insert('subjects', {
      name:     name,
      code:     code,
      credits:  credits,
      type:     type,
      deptId:   dept._id,
      deptName: dept.name,
      deptCode: dept.code,
    });
    added++;
  });
  showUploadPreview('subup', added, skipped);
  showToast('Subjects: ' + added + ' added, ' + skipped + ' skipped');
  if (added > 0) wizMarkDone('subject');
}

function parseStudentRows(rows) {
  var added = 0, skipped = 0, errors = [];
  var VALID = ['UG', 'PG', 'M.E', 'M.TECH', 'B.E', 'B.TECH'];

  rows.forEach(function (row, ri) {
    var rn     = ri + 2;
    var name   = cv(row, ['fullname', 'name', 'studentname']);
    var regNo  = cv(row, ['registerno', 'regno', 'registernum', 'rollno', 'roll']);
    var ay     = cv(row, ['academicyear', 'academicyr', 'ay']) || '';
    var ct     = cv(row, ['coursetype', 'course', 'type']).toUpperCase() || '';
    var branch = cv(row, ['branch', 'branchname']);
    var dn     = cv(row, ['department', 'dept', 'deptname']);
    var yr     = cv(row, ['year', 'studyyear', 'yr']);
    var cn     = cv(row, ['class', 'classname', 'classid']);
    var sec    = cv(row, ['section', 'sec']);
    var email  = cv(row, ['email', 'emailid', 'mail']);
    var user   = cv(row, ['username', 'user', 'loginid']);
    var pass   = cv(row, ['password', 'pass', 'pwd']) || 'student@123';

    var errs = [];
    if (!name)  errs.push('FullName missing');
    if (!regNo) errs.push('RegisterNo missing');
    if (!dn)    errs.push('Department missing');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.push('Invalid email');
    if (ct && VALID.indexOf(ct) === -1)  errs.push('CourseType "' + ct + '" unknown');
    if (regNo && DB.one('students', { regNo: regNo })) errs.push('RegisterNo ' + regNo + ' exists');
    if (user && DB.one('users', { username: user })) errs.push('Username "' + user + '" taken');

    if (errs.length) {
      skipped++;
      errors.push({ row: rn, name: name || '(blank)', issues: errs });
      return;
    }

    var dept = DB.get('depts').find(function (d) {
      return d.name.toLowerCase() === dn.toLowerCase() || d.code.toLowerCase() === dn.toLowerCase();
    });
    var cls  = DB.get('classes').find(function (c) {
      return c.name === cn || (c.deptName.toLowerCase() === dn.toLowerCase() && c.section === sec);
    });

    DB.insert('students', {
      name:         name,
      regNo:        regNo,
      academicYear: ay,
      courseType:   ct,
      branch:       branch,
      deptId:       dept ? dept._id   : '',
      deptName:     dept ? dept.name  : dn,
      classId:      cls  ? cls._id    : '',
      className:    cls  ? cls.name   : cn,
      year:         yr,
      section:      sec,
      email:        email,
    });

    if (user) {
      DB.insert('users', {
        name:     name,
        username: user,
        password: pass,
        role:     'student',
        regNo:    regNo,
        deptName: dept ? dept.name : dn,
        email:    email,
      });
    }
    added++;
  });

  showUploadPreview('tup', added, skipped, errors);
  showToast('Students: ' + added + ' added' + (skipped ? ', ' + skipped + ' skipped' : ''));
  if (added > 0) wizMarkDone('student');
}

function parseTeacherRows(rows) {
  var added = 0, skipped = 0;
  rows.forEach(function (row) {
    var name  = cv(row, ['name']);
    var empId = cv(row, ['empid', 'employeeid', 'employee']);
    var dept  = cv(row, ['dept', 'department']);
    var desig = cv(row, ['desig', 'designation']) || 'Assistant Professor';
    var user  = cv(row, ['user', 'username']);
    var pass  = cv(row, ['pass', 'password']) || 'teacher123';

    if (!name || !user) { skipped++; return; }
    if (DB.one('users', { username: user })) { skipped++; return; }

    DB.insert('users', {
      name:  name,
      empId: empId,
      dept:  dept,
      desig: desig,
      username: user,
      password: pass,
      role:  'teacher',
    });
    added++;
  });
  showUploadPreview('tcup', added, skipped);
  showToast('Teachers: ' + added + ' added, ' + skipped + ' skipped');
  if (added > 0) wizMarkDone('teacher');
}

initWizard();
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
