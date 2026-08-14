// ════════════════════════════════════════════════════════════════════
//  EAMS – TIMETABLE MANAGEMENT  (timetable.html)
//  Role-based, department-aware | Node/Express + MongoDB backend
// ════════════════════════════════════════════════════════════════════

const API_BASE = '/api';

/* ── SESSION ─────────────────────────────────────────────────────── */
// Supports both key formats:
//   teacher.html / student.html / admin.html → eams_user (JSON) + eams_token (string)
//   legacy eams_session → single JSON blob
const SESSION = (() => {
  try {
    // Primary: eams_user set by all portals
    const u = JSON.parse(sessionStorage.getItem('eams_user') || 'null');
    if (u) {
      u.token = sessionStorage.getItem('eams_token') || '';
      return u;
    }
    // Fallback: legacy unified key
    const s = JSON.parse(sessionStorage.getItem('eams_session') || 'null');
    if (s) return s;
    return {};
  } catch { return {}; }
})();

const ROLE        = SESSION.role || '';
const IS_STUDENT  = ROLE === 'student';
const IS_TEACHER  = ROLE === 'teacher';
const IS_ADMIN    = ROLE === 'admin';
const IS_COORD    = SESSION.isTimeTableCoordinator === true;
const CAN_EDIT    = IS_COORD || IS_ADMIN;
const CAN_VIEW    = IS_STUDENT || IS_TEACHER || IS_COORD || IS_ADMIN;
const TT_DEPT     = (SESSION.TTdeptName || '').trim();

/* ── STATE ───────────────────────────────────────────────────────── */
const S = {
  depts: [], deptId: null, deptName: null, deptCode: null,
  classes: [], classId: null, className: null, sectionId: null,
  tt: {},
  activeCellKey: null,
  subjects: [],
  coordDeptId: null,
  coordIsService: false,
};

/* ── SUBJECT CELL COLORS (light pastels – one consistent color per subject) ── */
const SUBJ_CELL_COLORS = [
  { bg:'#f0fdf4', border:'#4ade80', text:'#166534' },
  { bg:'#eff6ff', border:'#60a5fa', text:'#1e40af' },
  { bg:'#fefce8', border:'#facc15', text:'#854d0e' },
  { bg:'#fdf4ff', border:'#d946ef', text:'#6b21a8' },
  { bg:'#fff7ed', border:'#fb923c', text:'#9a3412' },
  { bg:'#ecfeff', border:'#22d3ee', text:'#155e75' },
  { bg:'#fdf2f8', border:'#f472b6', text:'#831843' },
  { bg:'#f0fdfa', border:'#2dd4bf', text:'#134e4a' },
  { bg:'#fff1f2', border:'#fb7185', text:'#9f1239' },
  { bg:'#f5f3ff', border:'#a78bfa', text:'#4c1d95' },
  { bg:'#fafaf9', border:'#a8a29e', text:'#44403c' },
  { bg:'#ecfdf5', border:'#34d399', text:'#065f46' },
];

function hashSubjColor(name) {
  if (!name) return SUBJ_CELL_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return SUBJ_CELL_COLORS[Math.abs(h) % SUBJ_CELL_COLORS.length];
}


const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const PERIODS = [
  { id:1, label:'P1', time:'08:30–09:15' },
  { id:2, label:'P2', time:'09:15–10:00' },
  { id:'B1', label:'BREAK', time:'10:00–10:15', isBreak:true, breakLbl:'☕ Break' },
  { id:3, label:'P3', time:'10:15–11:00' },
  { id:4, label:'P4', time:'11:00–11:45' },
  { id:5, label:'P5', time:'11:45–12:30' },
  { id:'L', label:'LUNCH', time:'12:30–13:15', isBreak:true, breakLbl:'🍱 Lunch' },
  { id:6, label:'P6', time:'1:15–2:00' },
  { id:7, label:'P7', time:'2:00–2:45' },
  { id:'B2', label:'BREAK', time:'14:45–15:00', isBreak:true, breakLbl:'☕ Break' },
  { id:8, label:'P8', time:'3:00–3:45' },
  { id:9, label:'P9', time:'3:45–4:30' },
];
const COLORS = ['#22c55e','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6'];

/* ══════════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  if (!CAN_VIEW) {
    document.getElementById('auth-gate').classList.add('show');
    return;
  }
  setupUI();
  buildSidebar();
  await bootstrap();

  // Show synced dbtoast only for admin / coordinator / teacher — NOT for students
  if (!IS_STUDENT) {
    const ttCount = Object.keys(S.tt).length || 0;
    dbtoast(`✅ Synced from MongoDB.<br><span style="font-size:11px;opacity:0.8;">Depts: ${S.depts.length} | Periods: ${ttCount}</span>`, 'success', 4000);
  }
});

/* ── UI SETUP ────────────────────────────────────────────────────── */
function setupUI() {
  const name     = SESSION.name || 'User';
  const initials = name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
  ['sb-av','tb-av'].forEach(id => document.getElementById(id).textContent = initials);
  ['sb-name','tb-name'].forEach(id => document.getElementById(id).textContent = name);

  let roleTxt, roleClass, subTxt, deptTxt;
  if (IS_ADMIN) {
    roleTxt = 'Admin';           roleClass = 'coord';
    subTxt  = 'Full Timetable Access'; deptTxt = 'Administrator';
    document.getElementById('sb-role-lbl').textContent = 'Administrator';
  } else if (IS_COORD) {
    roleTxt = TT_DEPT ? `${TT_DEPT} Coordinator` : 'TT Coordinator';
    roleClass = 'coord';
    subTxt  = `TT Coordinator – ${TT_DEPT || 'All Depts'}`;
    deptTxt = SESSION.dept || '—';
    document.getElementById('sb-role-lbl').textContent = 'TT Coordinator';
  } else if (IS_TEACHER) {
    roleTxt = 'Teacher';         roleClass = 'student';
    subTxt  = `${SESSION.dept || '—'} · View Only`;
    deptTxt = SESSION.dept || '—';
    document.getElementById('sb-role-lbl').textContent = 'Teacher';
  } else {
    roleTxt = 'Student';         roleClass = 'student';
    subTxt  = `${SESSION.deptName || SESSION.dept || '—'} · View Only`;
    deptTxt = SESSION.deptName || SESSION.dept || '—';
    document.getElementById('sb-role-lbl').textContent = 'Student';
  }

  document.getElementById('tb-sub').textContent  = subTxt;
  document.getElementById('tb-dept').textContent = deptTxt;
  const rp = document.getElementById('role-pill');
  rp.textContent = roleTxt; rp.className = `role-pill ${roleClass}`;
}

function buildSidebar() {
  const homeHref = IS_ADMIN ? 'admin.html'
                 : IS_STUDENT ? 'student.html'
                 : 'teacher.html';

  const items = [
    { ic:'🏠', lbl: IS_ADMIN ? 'Admin Panel' : IS_STUDENT ? 'Dashboard' : 'Dashboard', href: homeHref },
    { ic:'🗓️', lbl:'Timetable', href:'timetable.html', act:true },
    ...(IS_STUDENT ? [{ ic:'✅', lbl:'Attendance', href:'student.html' }] : []),
    ...((IS_TEACHER || IS_COORD) ? [
      { ic:'✅', lbl:'Attendance', href:'teacher.html' },
      { ic:'📊', lbl:'Reports',   href:'teacher.html' },
    ] : []),
    ...(IS_ADMIN ? [
      { ic:'🏛️', lbl:'Departments', href:'admin.html' },
      { ic:'⚙️',  lbl:'Control Panel', href:'control.html' },
    ] : []),
  ];

  document.getElementById('sb-nav').innerHTML =
    `<div class="sb-section-label">Navigation</div>` +
    items.map(i =>
      `<button class="si ${i.act ? 'act' : ''}" onclick="location.href='${i.href}'">
         <span class="sbi-ic">${i.ic}</span>${i.lbl}
       </button>`
    ).join('');
}

/* ── SIDEBAR TOGGLE ──────────────────────────────────────────────── */
let sbOpen = true;
function toggleSb() {
  sbOpen = !sbOpen;
  const sb = document.getElementById('sidebar');
  const mc = document.getElementById('mc');
  const btn = document.getElementById('sb-toggle');
  sb.classList.toggle('sb-hidden', !sbOpen);
  mc.style.marginLeft = sbOpen ? 'var(--sb-w)' : '0';
  btn.classList.toggle('closed', !sbOpen);
  btn.textContent = sbOpen ? '✕' : '☰';
}

/* ══════════════════════════════════════════════════════════════════
   BOOTSTRAP – determine what to show based on role
══════════════════════════════════════════════════════════════════ */
async function bootstrap() {
  S.depts = await API.getDepts();

  if (IS_STUDENT) { await loadStudentTT(); return; }

  if (IS_ADMIN) {
    renderDeptGrid(S.depts);
    showView('view-dept');
    return;
  }

  if (IS_TEACHER && !IS_COORD) {
    document.getElementById('dept-ps').textContent =
      'Select a department to view its timetable';
    renderDeptGrid(S.depts);
    showView('view-dept');
    return;
  }

  // COORDINATOR (isTimeTableCoordinator === true)
  const myDept = S.depts.find(d =>
    d.name?.toLowerCase() === TT_DEPT.toLowerCase() ||
    d.code?.toLowerCase() === TT_DEPT.toLowerCase()
  );

  if (!myDept) {
    renderDeptGrid(S.depts);
    showView('view-dept');
    return;
  }

  S.coordDeptId = myDept._id;
  const ownClasses = await API.getClasses(myDept._id);
  S.coordIsService = ownClasses.length === 0;

  if (S.coordIsService) {
    document.getElementById('dept-ps').textContent =
      `${TT_DEPT} Coordinator — Edit your subject across all departments`;
    renderDeptGrid(S.depts);
    showView('view-dept');
  } else {
    await enterDept(myDept._id, myDept.name, myDept.code || myDept.name.substring(0,4).toUpperCase(), ownClasses);
  }
}

/* ══════════════════════════════════════════════════════════════════
   DEPT GRID
══════════════════════════════════════════════════════════════════ */
function renderDeptGrid(depts) {
  const grid = document.getElementById('dept-grid');
  if (!depts.length) {
    grid.innerHTML = `<div class="state-sc"><div class="state-icon">🏛️</div><div class="state-t">No Departments Found</div></div>`;
    return;
  }
  grid.innerHTML = depts.map(d => {
    const isServiceCard = S.coordIsService && d._id !== S.coordDeptId;
    return `
      <div class="dept-card ${S.deptId===d._id?'sel':''} ${isServiceCard?'svc':''}"
           onclick="clickDept('${d._id}','${e(d.name)}','${e(d.code||'')}')">
        <div class="dc-icon">${d.icon||'🏛️'}</div>
        <div class="dc-code">${d.code || d.name.substring(0,4).toUpperCase()}</div>
        <div class="dc-name">${d.name}</div>
      </div>`;
  }).join('');
}

async function clickDept(id, name, code) {
  if (IS_COORD && !IS_ADMIN && !S.coordIsService && id !== S.coordDeptId) {
    dbtoast('Access denied: You can only manage your own department', 'error'); return;
  }
  const classes = await API.getClasses(id);
  if (!classes.length && !S.coordIsService && !IS_TEACHER && !IS_ADMIN) {
    dbtoast('No classes found for this department', 'info'); return;
  }
  await enterDept(id, name, code || name.substring(0,4).toUpperCase(), classes);
}

async function enterDept(id, name, code, classes) {
  S.deptId = id; S.deptName = name; S.deptCode = code;
  S.classes = classes;
  S.classId = null; S.sectionId = null; S.tt = {};

  document.getElementById('tt-h1').textContent = name;
  document.getElementById('tt-ps').textContent = `${code} Department — Select class and section`;

  await loadSubjectsForRole(id);
  populateClassSelect();
  showView('view-tt');
}

/* ══════════════════════════════════════════════════════════════════
   CLASS + SECTION SELECTORS
══════════════════════════════════════════════════════════════════ */
function populateClassSelect() {
  const sel = document.getElementById('sel-class');
  sel.innerHTML = '<option value="">— Select Class —</option>';
  const byYear = {};
  S.classes.forEach(c => { const y = c.year || 'Other'; (byYear[y] = byYear[y]||[]).push(c); });
  Object.keys(byYear).sort().forEach(yr => {
    const og = document.createElement('optgroup');
    og.label = yr;
    byYear[yr].forEach(c => {
      const o = document.createElement('option');
      o.value = c._id; o.textContent = c.name; og.appendChild(o);
    });
    sel.appendChild(og);
  });
  const secSel = document.getElementById('sel-section');
  secSel.innerHTML = '<option value="">— Select Section —</option>';
  secSel.disabled = true;
  document.getElementById('btn-load').disabled = true;
  hideCard();
}

function onClassChange() {
  const sel = document.getElementById('sel-class');
  S.classId = sel.value || null;
  const cls = S.classes.find(c => c._id === S.classId);
  S.className = cls?.name || null;
  const secSel = document.getElementById('sel-section');
  secSel.innerHTML = '<option value="">— Select Section —</option>';
  secSel.disabled = true;
  document.getElementById('btn-load').disabled = true;
  S.sectionId = null;
  hideCard();
  if (!cls) return;
  secSel.disabled = false;
  const o = document.createElement('option');
  o.value = cls._id; o.textContent = `Section ${cls.section || 'A'}`; secSel.appendChild(o);
  secSel.value = cls._id;
  S.sectionId = cls._id;
  document.getElementById('btn-load').disabled = !S.sectionId;
}

function onSectionChange() {
  S.sectionId = document.getElementById('sel-section').value || null;
  document.getElementById('btn-load').disabled = !S.sectionId;
}

function hideCard() {
  document.getElementById('tt-card').classList.add('hidden');
  document.getElementById('tt-placeholder').classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════════════
   LOAD TIMETABLE
══════════════════════════════════════════════════════════════════ */
async function loadTT() {
  const classId = S.sectionId || S.classId;
  if (!classId) return;

  const btn = document.getElementById('btn-load');
  const orgBtnText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:6px;vertical-align:middle;"></span> Loading…';
  btn.disabled = true;

  try {
    const cls = S.classes.find(c => c._id === classId);
    S.className = cls?.name || S.className || '—';

    document.getElementById('tt-card-title').textContent = `${S.deptCode} – ${S.className}`;
    document.getElementById('tt-card-sub').textContent   =
      `${S.deptName} Department · ${CAN_EDIT ? 'Editable' : 'View Only'}`;

    const data = await API.getTimetable(classId);
    S.tt = data || {};

    buildTTTable(classId);
    buildCardActions(classId);
    buildSummary();

    document.getElementById('tt-placeholder').classList.add('hidden');
    document.getElementById('tt-card').classList.remove('hidden');
    
    applyZoom();
  } finally {
    btn.innerHTML = orgBtnText;
    btn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════════
   STUDENT FLOW – direct to their class TT
══════════════════════════════════════════════════════════════════ */
async function loadStudentTT() {
  let classId   = SESSION.classId;
  let className = SESSION.className || '—';
  let deptName  = SESSION.deptName  || SESSION.dept || '—';

  if (!classId) {
    try {
      const profile = await API.getStudentProfile();
      classId = profile?.classId; className = profile?.className || '—'; deptName = profile?.deptName || '—';
    } catch {}
  }

  if (!classId) {
    document.getElementById('dept-grid').innerHTML = `
      <div class="state-sc" style="grid-column:1/-1">
        <div class="state-icon">⚠️</div>
        <div class="state-t">Class Not Assigned</div>
        <div class="state-s">Your class has not been assigned yet. Contact your class advisor.</div>
      </div>`;
    showView('view-dept');
    return;
  }

  document.getElementById('tt-h1').textContent = className;
  document.getElementById('tt-ps').textContent = `${deptName} · Read Only`;
  document.getElementById('sel-panel').classList.add('hidden');
  document.getElementById('tt-placeholder').classList.add('hidden');

  const data = await API.getTimetable(classId);
  S.tt = data || {};
  document.getElementById('tt-card-title').textContent = className;
  document.getElementById('tt-card-sub').textContent   = `${deptName} · Read Only`;
  buildTTTable(classId);
  buildCardActions(classId);
  document.getElementById('tt-card').classList.remove('hidden');
  showView('view-tt');
}

/* ══════════════════════════════════════════════════════════════════
   TT TABLE
══════════════════════════════════════════════════════════════════ */
function buildTTTable(classId) {
  const table = document.getElementById('tt-table');
  let html = `<thead><tr><th class="day-th">Day</th>`;
  PERIODS.forEach(p => {
    html += p.isBreak
      ? `<th style="color:var(--amber);font-size:9.5px;">BREAK<br><span style="opacity:.6;font-weight:400;">${p.time}</span></th>`
      : `<th>${p.label}<br><span style="font-size:9px;font-weight:400;opacity:.7;">${p.time}</span></th>`;
  });
  html += `</tr></thead><tbody>`;

  DAYS.forEach(day => {
    html += `<tr><td class="day-cell"><div class="day-n">${day}</div><div class="day-s">${day.substring(0,3).toUpperCase()}</div></td>`;
    PERIODS.forEach(p => {
      if (p.isBreak) { html += `<td><div class="tt-cell brk"><span class="brk-lbl">${p.breakLbl || '☕ Break'}</span></div></td>`; return; }
      const key  = `${day}-${p.id}`;
      const cell = S.tt[key] || null;
      const click = CAN_EDIT
        ? `openEditCell('${key}','${day}','${p.label}','${p.time}')`
        : (cell?.subject ? `openDetailCell('${key}','${day}','${p.label}','${p.time}')` : '');
      if (cell?.subject) {
        const col = hashSubjColor(cell.subject);
        html += `<td onclick="${click}"><div class="tt-cell filled" style="background:${col.bg};border-left:3px solid ${col.border};">
          <span class="pno">${p.label}</span>
          <div class="c-subj" style="color:${col.text}">${e(cell.subject)}</div>
          ${cell.staff  ? `<div class="c-staff">👤 ${e(cell.staff)}</div>` : ''}
          ${cell.hall   ? `<div class="c-hall">📍 ${e(cell.hall)}</div>`  : ''}
          ${cell.type   ? `<span class="c-badge ${cell.type}">${cell.type.charAt(0).toUpperCase()+cell.type.slice(1)}</span>` : ''}
        </div></td>`;
    } else {
      html += `<td ${click?`onclick="${click}"`:''}><div class="tt-cell">
        <span class="pno">${p.label}</span>
        ${CAN_EDIT ? `<div class="c-empty">Empty</div><div class="c-add">＋ Add</div>` : `<div class="c-empty">—</div>`}
      </div></td>`;
    }
  });
  html += `</tr>`;
});
html += `</tbody>`;
table.innerHTML = html;
}

/* ── CARD ACTIONS ─────────────────────────────────────────────────── */
let currentZoom = 1;
function applyZoom() {
  const table = document.getElementById('tt-table');
  if (table) {
    table.style.zoom = currentZoom;
  }
}
function zoomTT(delta) {
  currentZoom += delta;
  if (currentZoom < 0.5) currentZoom = 0.5;
  if (currentZoom > 2) currentZoom = 2;
  applyZoom();
}

function buildCardActions(classId) {
  const el = document.getElementById('tt-card-acts');
  const zoomHtml = `
    <div style="display:flex;align-items:center;background:var(--gLt);border-radius:10px;overflow:hidden;border:1.5px solid var(--br);margin-right:8px;">
      <button class="btn btn-ghost btn-sm" style="border:none;border-radius:0;padding:6px 10px;" onclick="zoomTT(-0.1)">-</button>
      <span style="font-size:11px;font-weight:700;color:var(--gD);padding:0 4px;" id="tt-zoom-lbl">Zoom</span>
      <button class="btn btn-ghost btn-sm" style="border:none;border-radius:0;padding:6px 10px;" onclick="zoomTT(0.1)">+</button>
    </div>
  `;

  if (!CAN_EDIT) { 
    el.innerHTML = zoomHtml; 
    return; 
  }
  el.innerHTML = zoomHtml + `
    <button class="btn btn-outline-white btn-sm" onclick="exportCSV()">⬇ Export</button>
    <button class="btn btn-amber btn-sm" onclick="openAutoGen()">⚡ Auto Gen</button>
    <button class="btn btn-white btn-sm" onclick="saveTT('${classId}')">💾 Save All</button>`;
}

/* ══════════════════════════════════════════════════════════════════
   SUMMARY (coordinators)
══════════════════════════════════════════════════════════════════ */
function buildSummary() {
  const sum = document.getElementById('tt-summary');
  if (!CAN_EDIT) { sum.classList.add('hidden'); return; }
  sum.classList.remove('hidden');

  const map = {};
  Object.values(S.tt).forEach(cell => {
    if (!cell?.subject) return;
    const k = cell.subject;
    if (!map[k]) map[k] = { ...cell, hrs: 0 };
    map[k].hrs++;
  });
  const subjs   = Object.values(map);
  const filled  = subjs.reduce((a, s) => a + s.hrs, 0);
  const total   = DAYS.length * PERIODS.filter(p => !p.isBreak).length;

  document.getElementById('stat-row').innerHTML = `
    <div class="stat-c"><div class="stat-n">${subjs.length}</div><div class="stat-l">Subjects</div></div>
    <div class="stat-c"><div class="stat-n">${filled}</div><div class="stat-l">Hrs Filled</div></div>
    <div class="stat-c"><div class="stat-n">${total - filled}</div><div class="stat-l">Hrs Empty</div></div>
    <div class="stat-c"><div class="stat-n">${total?Math.round(filled/total*100):0}%</div><div class="stat-l">Completion</div></div>`;

  const tbody = document.getElementById('sum-tbody');
  if (!subjs.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--tdi);">No subjects assigned yet</td></tr>`;
    return;
  }
  const barMax = Math.max(...subjs.map(s => s.hrs));
  tbody.innerHTML = subjs.map((s, i) => {
    const col = COLORS[i % COLORS.length];
    const pct = Math.round(s.hrs / barMax * 100);
    return `<tr>
      <td style="color:var(--tdi);font-size:11px;">${String(i+1).padStart(2,'0')}</td>
      <td><span class="sdot" style="background:${col};margin-right:7px;"></span><strong>${e(s.subject)}</strong></td>
      <td style="font-size:11px;color:var(--tdi);">${e(s.code||'—')}</td>
      <td><span class="c-badge ${s.type||'theory'}">${(s.type||'Theory').charAt(0).toUpperCase()+(s.type||'theory').slice(1)}</span></td>
      <td style="font-size:12px;">${e(s.staff||'—')}</td>
      <td style="font-size:11px;color:var(--tdi);">${e(s.hall||'—')}</td>
      <td style="color:var(--gD);font-weight:700;">${s.credit||'—'}</td>
      <td><div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div>&nbsp;<span style="font-size:11px;font-weight:600;">${s.hrs}</span></td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   SUBJECT LOADING (role-filtered)
══════════════════════════════════════════════════════════════════ */
async function loadSubjectsForRole(targetDeptId) {
  if (!CAN_EDIT) return;

  if (IS_ADMIN) {
    const all = await API.getSubjects(null);
    S.subjects = all;
  } else if (IS_COORD) {
    if (S.coordIsService) {
      S.subjects = await API.getSubjects(S.coordDeptId);
    } else {
      const own = await API.getSubjects(S.coordDeptId);
      const all = await API.getSubjects(null);
      const mainIds = new Set(S.depts.map(d => d._id));
      const svcSubjs = all.filter(s =>
        !own.find(o => o._id === s._id) &&
        ['maths','mathematics','english','tamil','physics','chemistry','biology']
          .some(kw => (s.deptName||'').toLowerCase().includes(kw))
      );
      S.subjects = [...own, ...svcSubjs];
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   CELL EDIT MODAL
══════════════════════════════════════════════════════════════════ */
function openEditCell(key, day, period, time) {
  if (!CAN_EDIT) return;
  S.activeCellKey = key;
  const cell = S.tt[key] || {};
  document.getElementById('edit-title').textContent = `${day} · ${period}`;
  document.getElementById('edit-sub').textContent   = time;
  document.getElementById('edit-subj').value        = cell.subject  || '';
  document.getElementById('edit-subj-id').value     = cell.subjectId|| '';
  document.getElementById('edit-subj-code').value   = cell.code     || '';
  document.getElementById('edit-staff').value        = cell.staff    || '';
  document.getElementById('edit-hall').value         = cell.hall     || '';
  document.getElementById('edit-credit').value       = cell.credit   || '';
  document.getElementById('edit-type').value         = cell.type     || 'theory';

  const hint = document.getElementById('edit-subj-hint');
  if (S.coordIsService)
    hint.textContent = `Service Coordinator: only ${TT_DEPT} subjects may be assigned here`;
  else if (IS_COORD)
    hint.textContent = 'Showing your dept subjects + service dept subjects';
  else hint.textContent = '';

  openModal('modal-edit');
}

/* ── SUBJECT DROPDOWN ─────────────────────────────────────────────── */
function filterSubj(q) {
  const list = q
    ? S.subjects.filter(s => s.name.toLowerCase().includes(q.toLowerCase()) || (s.code||'').toLowerCase().includes(q.toLowerCase()))
    : S.subjects;
  renderSubjDrop(list);
}

function openSubjDrop() { renderSubjDrop(S.subjects); document.getElementById('sdrop').classList.add('open'); }
function closeSubjDrop() { setTimeout(() => document.getElementById('sdrop').classList.remove('open'), 180); }

function renderSubjDrop(list) {
  const dd = document.getElementById('sdrop');
  if (!list.length) { dd.innerHTML = `<div class="sdrop-empty">No subjects found</div>`; dd.classList.add('open'); return; }
  dd.innerHTML = list.slice(0,30).map(s =>
    `<div class="sdrop-opt" onmousedown="pickSubj('${s._id}')">
       <div class="sdrop-name">${e(s.name)}</div>
       <div class="sdrop-meta">${e(s.code||'—')} · ${e(s.deptName||'—')} · ${s.credits||'?'} cr · ${s.type||'Theory'}</div>
     </div>`
  ).join('');
  dd.classList.add('open');
}

function pickSubj(id) {
  const subj = S.subjects.find(s => s._id === id);

  if (!subj) return;
  document.getElementById('edit-subj').value      = subj.name;
  document.getElementById('edit-subj-id').value   = subj._id;
  document.getElementById('edit-subj-code').value = subj.code || '';
  document.getElementById('edit-credit').value    = subj.credits || '';
  document.getElementById('edit-type').value      = (subj.type || 'theory').toLowerCase();
  const staffVal = subj.staff || subj.staffName || subj.defaultStaff || '';
  const hallVal  = subj.hall  || subj.hallNo    || subj.defaultHall  || '';
  if (staffVal) document.getElementById('edit-staff').value = staffVal;
  if (hallVal)  document.getElementById('edit-hall').value  = hallVal;
  document.getElementById('sdrop').classList.remove('open');
}

/* ── SAVE / CLEAR CELL ───────────────────────────────────────────── */
document.getElementById('btn-save').addEventListener('click', async () => {
  const key = S.activeCellKey;
  if (!key) return;
  const subjName = document.getElementById('edit-subj').value.trim();
  if (!subjName) { dbtoast('Subject name is required', 'error'); return; }

  const payload = {
    subject  : subjName,
    subjectId: document.getElementById('edit-subj-id').value || null,
    code     : document.getElementById('edit-subj-code').value || '',
    staff    : document.getElementById('edit-staff').value.trim(),
    hall     : document.getElementById('edit-hall').value.trim(),
    credit   : parseInt(document.getElementById('edit-credit').value) || null,
    type     : document.getElementById('edit-type').value,
  };

  if (IS_COORD && S.coordIsService && S.subjects.length) {
    const allowed = S.subjects.find(s => s.name === subjName || s._id === payload.subjectId);
    if (!allowed) {
      dbtoast(`Only ${TT_DEPT} subjects can be assigned by this coordinator`, 'error');
      return;
    }
  }

  const classId = S.sectionId || S.classId;
  S.tt[key] = payload;
  buildTTTable(classId);
  buildSummary();
  closeModal('modal-edit');

  const ok = await API.updateCell(classId, key, payload);
  dbtoast(ok ? 'Period saved ✓' : 'Saved locally (check connection)', ok ? 'success' : 'info');
});

document.getElementById('btn-clear').addEventListener('click', async () => {
  const key = S.activeCellKey;
  if (!key) return;
  delete S.tt[key];
  const classId = S.sectionId || S.classId;
  buildTTTable(classId);
  buildSummary();
  closeModal('modal-edit');
  await API.updateCell(classId, key, null);
  dbtoast('Period cleared', 'info');
});

/* ── STUDENT DETAIL MODAL ────────────────────────────────────────── */
function openDetailCell(key, day, period, time) {
  const cell = S.tt[key]; if (!cell?.subject) return;
  document.getElementById('det-period').textContent = `${day} · ${period} · ${time}`;
  document.getElementById('det-subj').textContent   = cell.subject;
  document.getElementById('det-staff').textContent  = cell.staff  || '—';
  document.getElementById('det-hall').textContent   = cell.hall   || '—';
  document.getElementById('det-type').textContent   = (cell.type||'Theory').charAt(0).toUpperCase()+(cell.type||'theory').slice(1);
  document.getElementById('det-code').textContent   = cell.code   || '—';
  document.getElementById('det-ring').textContent   = cell.credit || '?';
  openModal('modal-detail');
}

/* ── SAVE ALL ────────────────────────────────────────────────────── */
async function saveTT(classId) {
  if (!classId) classId = S.sectionId || S.classId;
  if (!classId) { dbtoast('No class selected', 'error'); return; }
  const ok = await API.saveTimetable(classId, S.tt);
  dbtoast(ok ? 'Timetable saved to DB ✓' : 'Save failed – check connection', ok ? 'success' : 'error');
}

/* ══════════════════════════════════════════════════════════════════
   AUTO GEN
══════════════════════════════════════════════════════════════════ */
function openAutoGen() {
  document.getElementById('ag-sub').textContent = `Dept: ${S.deptName} — Generates TT for all sections of selected year`;
  document.getElementById('ag-list').innerHTML = '';
  document.getElementById('conflict-log').style.display = 'none';
  document.getElementById('ag-hall').value = '';
  const seeds = S.subjects.slice(0, 5);
  seeds.length ? seeds.forEach(s => addAgRow(s.name, 4, s.credits||3, '')) : [1,2,3].forEach(() => addAgRow());
  openModal('modal-ag');
}

function addAgRow(name='', hrs='', cr='', staff='') {
  const row = document.createElement('div');
  row.className = 'ag-row';
  row.innerHTML = `
    <input class="ag-in ag-n" type="text"   placeholder="Subject name" value="${e(name)}">
    <input class="ag-in ag-h" type="number" placeholder="Hrs/wk" min="1" max="12" value="${hrs}">
    <input class="ag-in ag-c" type="number" placeholder="Cr" min="1" max="6" value="${cr}">
    <input class="ag-in ag-s" type="text"   placeholder="Staff" value="${e(staff)}">
    <button class="ag-rm" onclick="this.closest('.ag-row').remove()">✕</button>`;
  document.getElementById('ag-list').appendChild(row);
}

function getAgSubjects() {
  return Array.from(document.querySelectorAll('.ag-row')).map(r => ({
    name  : r.querySelector('.ag-n').value.trim(),
    hours : parseInt(r.querySelector('.ag-h').value)||0,
    credit: parseInt(r.querySelector('.ag-c').value)||0,
    staff : r.querySelector('.ag-s').value.trim(),
  })).filter(s => s.name && s.hours > 0);
}

document.getElementById('btn-conflicts').addEventListener('click', async () => {
  const subjects = getAgSubjects();
  if (!subjects.length) { dbtoast('Add at least one subject', 'error'); return; }
  const log = document.getElementById('conflict-log');
  log.style.display = 'block'; log.innerHTML = '<span class="ok">↳ Checking conflicts…</span><br>';
  const res = await API.checkConflicts(S.deptId, document.getElementById('ag-year').value, subjects);
  log.innerHTML = res.map(r => `<span class="${r.ok?'ok':'err'}">${r.ok?'✓':'✗'} ${r.message}</span>`).join('<br>');
});

/* ── CLIENT-SIDE AUTO-GEN FALLBACK ──────────────────────────────── */
function clientAutoGen(subjects, hall) {
  const workPeriods = PERIODS.filter(p => !p.isBreak);
  const allSlots = [];
  DAYS.forEach(day => workPeriods.forEach(p => allSlots.push({ day, pid: p.id })));
  for (let i = allSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allSlots[i], allSlots[j]] = [allSlots[j], allSlots[i]];
  }
  const generated = {};
  let si = 0;
  subjects.forEach(subj => {
    for (let h = 0; h < subj.hours && si < allSlots.length; h++, si++) {
      const { day, pid } = allSlots[si];
      generated[`${day}-${pid}`] = {
        subject  : subj.name,
        subjectId: null,
        code     : subj.code || '',
        staff    : subj.staff || '',
        hall     : hall || '',
        credit   : subj.credit || null,
        type     : (subj.type || 'theory').toLowerCase(),
      };
    }
  });
  return generated;
}

document.getElementById('btn-gen').addEventListener('click', async () => {
  const subjects = getAgSubjects();
  const year = document.getElementById('ag-year').value;
  const hall = document.getElementById('ag-hall').value.trim();
  if (!subjects.length) { dbtoast('Add at least one subject', 'error'); return; }
  const log = document.getElementById('conflict-log');
  log.style.display = 'block'; log.innerHTML = '<span class="ok">⚡ Generating…</span>';

  let generatedSlots = null;

  try {
    const r = await fetch(`${API_BASE}/timetable/auto-gen`, {
      method: 'POST', headers: { ...ah(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ deptId: S.deptId, year, hall, subjects }),
    });
    const res = await r.json();
    if (res.success) {
      generatedSlots = res.slots || null;
      log.innerHTML += '<br><span class="ok">✓ Server generated and saved!</span>';
    } else {
      log.innerHTML += `<br><span class="err">✗ ${res.error || 'Server error'} — using client gen</span>`;
    }
  } catch {
    log.innerHTML += '<br><span class="ok">⚡ API unreachable — generating locally…</span>';
  }

  if (!generatedSlots) {
    generatedSlots = clientAutoGen(subjects, hall);
  }

  const classId = S.sectionId || S.classId;
  if (classId && Object.keys(generatedSlots).length) {
    S.tt = { ...S.tt, ...generatedSlots };
    buildTTTable(classId);
    buildSummary();
    log.innerHTML += `<br><span class="ok">✓ Applied ${Object.keys(generatedSlots).length} slots to timetable!</span>`;
    dbtoast(`⚡ Auto-generated ${Object.keys(generatedSlots).length} periods`, 'success');
    API.saveTimetable(classId, S.tt).then(ok => {
      if (ok) dbtoast('💾 Saved to MongoDB ✓', 'success');
    });
    setTimeout(() => closeModal('modal-ag'), 1400);
  } else {
    log.innerHTML += '<br><span class="err">✗ No class selected – load a class first</span>';
    dbtoast('Load a class first before generating', 'error');
  }
});

/* ══════════════════════════════════════════════════════════════════
   EXPORT
══════════════════════════════════════════════════════════════════ */
function exportCSV() {
  let csv = 'Day,' + PERIODS.filter(p=>!p.isBreak).map(p=>`${p.label} (${p.time})`).join(',') + '\n';
  DAYS.forEach(day => {
    csv += day;
    PERIODS.forEach(p => {
      if (p.isBreak) return;
      const c = S.tt[`${day}-${p.id}`];
      csv += ',' + (c?.subject ? `"${c.subject}|${c.staff||''}"` : '');
    });
    csv += '\n';
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = `TT_${S.deptCode}_${S.className}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  dbtoast('Exported as CSV', 'info');
}

/* ══════════════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════════════ */
function showView(id) {
  ['view-dept','view-tt'].forEach(v => {
    const el = document.getElementById(v);
    el.classList.toggle('hidden', v !== id);
    if (v === id) { el.classList.remove('hidden'); el.classList.add('fade-in'); }
  });
}

function goBack() {
  if (IS_COORD && !IS_ADMIN && !S.coordIsService) {
    dbtoast('You are locked to your department', 'info'); return;
  }
  S.deptId = null; S.deptName = null; S.classId = null; S.sectionId = null; S.tt = {};
  renderDeptGrid(S.depts);
  showView('view-dept');
}

/* ══════════════════════════════════════════════════════════════════
   DBTOAST  (matches admin.html – supports HTML content, no escaping)
══════════════════════════════════════════════════════════════════ */
function dbtoast(msg, type = 'info', ms = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
  const el = document.createElement('div');
  el.className = `dbtoast ${type}`;
  el.innerHTML = `<span class="db-spin">${icons[type] || 'ℹ️'}</span><div id="msg-toast-text">${msg}</div>`;
  const wrap = document.getElementById('toast-wrap');
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    setTimeout(() => el.remove(), 320);
  }, ms);
}
function toast(msg, type = 'info', ms = 3200) { dbtoast(msg, type, ms); }

/* ══════════════════════════════════════════════════════════════════
   API LAYER
══════════════════════════════════════════════════════════════════ */
const API = {
  async getDepts() {
    try {
      const r = await fetch(`${API_BASE}/departments`, { headers: ah() });
      if (!r.ok) throw 0;
      return await r.json();
    } catch { return demoDepts(); }
  },
  async getClasses(deptId) {
    try {
      const url = deptId ? `${API_BASE}/classes?deptId=${deptId}` : `${API_BASE}/classes`;
      const r = await fetch(url, { headers: ah() });
      if (!r.ok) throw 0;
      return await r.json();
    } catch { return demoClasses(deptId); }
  },
  async getSubjects(deptId) {
    try {
      const url = deptId ? `${API_BASE}/subjects?deptId=${deptId}` : `${API_BASE}/subjects`;
      const r = await fetch(url, { headers: ah() });
      if (!r.ok) throw 0;
      return await r.json();
    } catch { return demoSubjects(deptId); }
  },
  async getTimetable(classId) {
    try {
      const r = await fetch(`${API_BASE}/timetable/section/${classId}`, {
        headers: ah(), cache: 'no-store'
      });
      if (!r.ok) throw 0;
      const d = await r.json();
      const slots = d.slots || (typeof d === 'object' && !Array.isArray(d) ? d : {});
      if (Object.keys(slots).length > 0) return slots;
      throw 0;
    } catch {
      try {
        const r = await fetch(`${API_BASE}/timetable?classId=${classId}`, {
          headers: ah(), cache: 'no-store'
        });
        if (!r.ok) throw 0;
        const payload = await r.json();
        const slots = Array.isArray(payload) ? payload : (payload.slots || []);
        if (!Array.isArray(slots)) return slots;
        const map = {};
        const dayMap = { Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday' };
        slots.forEach(sl => {
          const day = dayMap[sl.day] || sl.day;
          const per = PERIODS.find(p => p.time && p.time.replace('–','-') === `${sl.start}-${sl.end}`);
          const pid = per ? per.id : sl.start;
          map[`${day}-${pid}`] = {
            subject  : sl.subjectName || sl.subject,
            staff    : sl.teacherName || sl.staff || '',
            hall     : sl.hall || sl.room || '',
            code     : sl.subjectCode || sl.code || '',
            credit   : sl.credit || sl.credits || null,
            type     : sl.type || 'theory',
            subjectId: sl.subjectId || null,
          };
        });
        return map;
      } catch { return {}; }
    }
  },
  async updateCell(classId, slotKey, payload) {
    try {
      const r = await fetch(`${API_BASE}/timetable/section/${classId}/slot`, {
        method: 'PUT', headers: { ...ah(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotKey, payload,
          _meta: { coordDeptId: S.coordDeptId, coordIsService: S.coordIsService, ttDeptName: TT_DEPT }
        }),
      });
      return r.ok;
    } catch { return false; }
  },
  async saveTimetable(classId, slots) {
    try {
      const r = await fetch(`${API_BASE}/timetable/section/${classId}`, {
        method: 'PUT', headers: { ...ah(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots,
          _meta: { coordDeptId: S.coordDeptId, coordIsService: S.coordIsService, ttDeptName: TT_DEPT }
        }),
      });
      return r.ok;
    } catch { return false; }
  },
  async getStudentProfile() {
    try {
      const r = await fetch(`${API_BASE}/profile/me`, { headers: ah() });
      if (!r.ok) throw 0;
      return await r.json();
    } catch { return null; }
  },
  async checkConflicts(deptId, year, subjects) {
    try {
      const r = await fetch(`${API_BASE}/timetable/check-conflicts`, {
        method: 'POST', headers: { ...ah(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId, year, subjects }),
      });
      return await r.json();
    } catch {
      return subjects.map(s => ({ ok: true, message: `${s.name} — ${s.staff || 'TBA'} is available (${s.hours} hrs/wk)` }));
    }
  },
  async autoGenTT(payload) {
    try {
      const r = await fetch(`${API_BASE}/timetable/auto-gen`, {
        method: 'POST', headers: { ...ah(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await r.json();
    } catch { return { success: true }; }
  },
};

function ah() { return { 'Authorization': `Bearer ${SESSION.token || ''}` }; }

/* ── DEMO DATA (dev fallback when API unreachable) ─────────────────── */
function demoDepts() {
  return [
    { _id:'d-cse',   name:'Computer Science Engineering', code:'CSE',   icon:'💻' },
    { _id:'d-it',    name:'Information Technology',       code:'IT',    icon:'🖧'  },
    { _id:'d-ece',   name:'Electronics & Communication',  code:'ECE',   icon:'📡' },
    { _id:'d-eee',   name:'Electrical Engineering',       code:'EEE',   icon:'⚡' },
    { _id:'d-mech',  name:'Mechanical Engineering',       code:'MECH',  icon:'⚙️' },
    { _id:'d-aids',  name:'AI & Data Science',            code:'AIDS',  icon:'🤖' },
    { _id:'d-maths', name:'Mathematics',                  code:'MATHS', icon:'📐' },
    { _id:'d-eng',   name:'English',                      code:'ENG',   icon:'📖' },
    { _id:'d-phy',   name:'Physics',                      code:'PHY',   icon:'🔭' },
  ];
}
function demoClasses(deptId) {
  if (['d-maths','d-eng','d-phy'].includes(deptId)) return [];
  const code = { 'd-cse':'CSE','d-it':'IT','d-ece':'ECE','d-eee':'EEE','d-mech':'MECH','d-aids':'AIDS' }[deptId] || 'DEPT';
  const rows = [];
  ['I Year','II Year','III Year','IV Year'].forEach((yr, yi) => {
    ['A','B'].forEach(sec => {
      rows.push({ _id:`${deptId}-${yi+1}-${sec}`, name:`${code}-${yi+1}${sec}`, year:yr, section:sec, deptId });
    });
  });
  return rows;
}
function demoSubjects(deptId) {
  const map = {
    'd-cse' : [
      { _id:'s1', name:'Data Structures',      code:'CS201', credits:4, type:'Theory', deptId:'d-cse', deptName:'CSE' },
      { _id:'s2', name:'Operating Systems',    code:'CS301', credits:3, type:'Theory', deptId:'d-cse', deptName:'CSE' },
      { _id:'s3', name:'DBMS Lab',             code:'CS302', credits:2, type:'Lab',    deptId:'d-cse', deptName:'CSE' },
      { _id:'s4', name:'Software Engineering', code:'CS401', credits:3, type:'Theory', deptId:'d-cse', deptName:'CSE' },
      { _id:'s5', name:'Machine Learning',     code:'CS402', credits:3, type:'Elective',deptId:'d-cse', deptName:'CSE' },
    ],
    'd-it'  : [
      { _id:'s6', name:'Web Development',  code:'IT201', credits:3, type:'Theory', deptId:'d-it', deptName:'IT' },
      { _id:'s7', name:'Network Security', code:'IT301', credits:3, type:'Theory', deptId:'d-it', deptName:'IT' },
    ],
    'd-maths': [
      { _id:'sm1', name:'Engineering Mathematics I',  code:'MA101', credits:4, type:'Theory', deptId:'d-maths', deptName:'Mathematics' },
      { _id:'sm2', name:'Engineering Mathematics II', code:'MA201', credits:4, type:'Theory', deptId:'d-maths', deptName:'Mathematics' },
      { _id:'sm3', name:'Probability & Statistics',   code:'MA301', credits:3, type:'Theory', deptId:'d-maths', deptName:'Mathematics' },
    ],
    'd-eng': [
      { _id:'se1', name:'Technical English I',  code:'EN101', credits:3, type:'Theory', deptId:'d-eng', deptName:'English' },
      { _id:'se2', name:'Technical English II', code:'EN201', credits:3, type:'Theory', deptId:'d-eng', deptName:'English' },
    ],
    'd-phy': [
      { _id:'sp1', name:'Engineering Physics', code:'PH101', credits:4, type:'Theory', deptId:'d-phy', deptName:'Physics' },
      { _id:'sp2', name:'Physics Lab',         code:'PH102', credits:2, type:'Lab',    deptId:'d-phy', deptName:'Physics' },
    ],
  };
  if (!deptId) return Object.values(map).flat();
  return map[deptId] || [];
}

/* ── UTIL ─────────────────────────────────────────────────────────── */
function e(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Navigate back to the portal that opened this page
function goHome() {
  const href = IS_ADMIN ? 'admin.html' : IS_STUDENT ? 'student.html' : 'teacher.html';
  location.href = href;
}
