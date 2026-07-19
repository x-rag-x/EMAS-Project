// ═══════════════════════════════════════════════════════════════════════
//  EAMS — setup.js  |  Interactive DB Control Console
//  Run: node setup.js
//
//  MAIN MENU
//    1) Addition   → 1) Normal  (Add User / Dept / Class)
//                    2) Demo Data (seed sample data for testing)
//    2) Deletion   → Delete User · Delete Dept · Delete Class ·
//                     Delete ALL of a role · Delete ENTIRE Database
//    3) Manage Collections → list every MongoDB collection with a number,
//                     pick a number to drop that collection, or 0 to drop
//                     the whole database
//    4) Start Server (spawns server.js)
//    5) Exit
//
//  Demo Data sub-menu (under Addition → Demo Data):
//    1) Students      → ask how many per class → auto-generate
//    2) Admins        → ask how many → auto-generate
//    3) Teachers      → ask how many → auto-generate
//    4) Departments   → ask how many → pick from predefined pool
//    5) Classes       → ask how many per dept → auto-generate
//    6) Subjects      → ask how many per dept → auto-generate
//    7) Assignments   → auto-assign teachers to subject×class pairs
//    8) All           → ask all counts → generate everything in order
//    0) Back
//
//  Everything here writes directly to MongoDB via models.js — nothing is
//  ever stored in localStorage/sessionStorage (this is a Node CLI, not a
//  browser, but the same "DB is the single source of truth" rule applies:
//  no JSON files, no caches — every read/write goes straight to Mongo).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const readline = require('readline');
const crypto   = require('crypto');
const cfg      = require('./config');
const M        = require('./models');

let COLLECTION;

// ── ANSI colours ───────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m',
  red: '\x1b[31m', blue: '\x1b[34m', magenta: '\x1b[35m', white: '\x1b[97m',
};
const ok   = (m) => console.log(`${C.green}  ✅  ${m}${C.reset}`);
const warn = (m) => console.log(`${C.yellow}  ⚠️   ${m}${C.reset}`);
const info = (m) => console.log(`${C.cyan}  ℹ️   ${m}${C.reset}`);
const err  = (m) => console.log(`${C.red}  ❌  ${m}${C.reset}`);
const head = (m) => console.log(`\n${C.bold}${C.blue}${'─'.repeat(60)}\n  ${m}\n${'─'.repeat(60)}${C.reset}`);

// ── Single readline interface, reused everywhere ───────────────────────
let rl;
function initRL() {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => { console.log('\n'); cleanExit(0); });
}

function ask(question, defaultVal = '') {
  const hint = defaultVal !== '' ? ` ${C.dim}[${defaultVal}]${C.reset}` : '';
  return new Promise(resolve => {
    rl.question(`  ${C.white}${question}${hint}${C.cyan} › ${C.reset}`, answer => {
      resolve(answer.trim() || String(defaultVal));
    });
  });
}


async function getDBName() {
  info('Connecting to MongoDB to list databases…');
  let tempConn;
  try {
    tempConn = await mongoose.createConnection(cfg.MONGO_URI).asPromise();
    const adminDb = tempConn.db.admin();
    const result  = await adminDb.listDatabases();
    const dbs     = (result.databases || [])
      .filter(d => !['admin', 'local', 'config'].includes(d.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!dbs.length) {
      warn('No user databases found on this cluster.');
      COLLECTION = await ask('Enter DB_NAME manually', 'eams_db');
      return;
    }

    head('📂  Available Databases');
    dbs.forEach((d, i) => {
      const sizeMB = (d.sizeOnDisk / (1024 * 1024)).toFixed(2);
      console.log(`  ${C.dim}${String(i + 1).padStart(2, ' ')})${C.reset} ${C.cyan}${d.name}${C.reset}  ${C.dim}(${sizeMB} MB)${C.reset}`);
    });
    console.log(`  ${C.dim} 0) Enter name manually${C.reset}\n`);

    const defaultIdx = dbs.findIndex(d => d.name === 'eams_db');
    const defaultHint = defaultIdx >= 0 ? String(defaultIdx + 1) : '1';
    const choice = await ask('Select database (number)', defaultHint);
    const idx    = parseInt(choice, 10);

    if (idx === 0 || isNaN(idx)) {
      COLLECTION = await ask('Enter DB_NAME', 'eams_db');
    } else if (idx >= 1 && idx <= dbs.length) {
      COLLECTION = dbs[idx - 1].name;
    } else {
      warn('Invalid choice — using default.');
      COLLECTION = 'eams_db';
    }
  } catch (e) {
    warn(`Could not list databases: ${e.message}`);
    COLLECTION = await ask('Enter DB_NAME manually', 'eams_db');
  } finally {
    try { if (tempConn) await tempConn.close(); } catch {}
  }

  ok(`Selected database: ${COLLECTION}`);
}


function askPassword(question, defaultVal = '') { return ask(question + ' (password, visible)', defaultVal); }

function askYN(question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return new Promise(resolve => {
    rl.question(`  ${C.white}${question} ${C.dim}(${hint})${C.reset}${C.cyan} › ${C.reset}`, answer => {
      const a = answer.trim().toLowerCase();
      if (!a) return resolve(defaultYes);
      resolve(a === 'y' || a === 'yes');
    });
  });
}

/** Type-to-confirm guard for destructive actions */
async function confirmPhrase(phrase, warningText) {
  warn(warningText);
  const typed = await ask(`Enter 'Y/n' to confirm action`, '');
  return typed === 'y';
}

async function cleanExit(code) {
  try { if (rl) rl.close(); } catch {}
  try { await mongoose.disconnect(); } catch {}
  process.exit(code);
}

// ── Helpers: id generators (mirrors server.js conventions) ─────────────
const genTrackId = (prefix) => 'TR' + prefix + '_' + crypto.randomBytes(5).toString('hex').toUpperCase();
const genStudentTrackId = () => 'TRSTU_' + Math.random().toString(36).substr(2, 9).toUpperCase();
const genTeacherTrackId = () => 'TRTCH_' + Math.random().toString(36).substr(2, 9).toUpperCase();
const genClassTrackId = () => 'TRCLS_' + crypto.randomBytes(5).toString('hex').toUpperCase();
const genSubjectTrackId = () => 'TRSUB_' + crypto.randomBytes(5).toString('hex').toUpperCase();

// ── DB log helper ───────────────────────────────────────────────────────
async function logSetup(action, details, severity = 'info') {
  try {
    await M.Log.create({
      userName: 'START-MENU', role: 'system', action, details,
      category: 'system', severity, ip: '127.0.0.1', time: new Date()
    });
  } catch { /* non-fatal */ }
}

// ── Generic numbered picker over a Mongo query ─────────────────────────
/** docs: array of lean docs. labelFn(doc) -> string. Returns chosen doc or null. */
async function pickFromList(docs, labelFn, promptLabel = 'Select') {
  if (!docs.length) { warn('No records found.'); return null; }
  docs.forEach((d, i) => console.log(`  ${C.dim}${String(i + 1).padStart(2, ' ')})${C.reset} ${labelFn(d)}`));
  console.log(`  ${C.dim} 0) Cancel${C.reset}`);
  const choice = await ask(`${promptLabel} (number)`, '0');
  const idx = parseInt(choice, 10);
  if (!idx || idx < 1 || idx > docs.length) return null;
  return docs[idx - 1];
}

async function pickDepartment(promptLabel = 'Select Department') {
  const depts = await M.Department.find().sort({ name: 1 }).lean();
  return pickFromList(depts, d => `${d.name}  ${C.dim}(${d.code || '—'} · #${d.number || '—'})${C.reset}`, promptLabel);
}

async function pickClass(deptId, promptLabel = 'Select Class') {
  const filter = deptId ? { deptId } : {};
  const classes = await M.Class.find(filter).sort({ name: 1 }).lean();
  return pickFromList(classes, c => `${c.name}  ${C.dim}(Year ${c.year || '—'} · Sec ${c.section || '—'} · Hall ${c.hallNo || '—'})${C.reset}`, promptLabel);
}

// ══════════════════════════════════════════════════════════════════════
//  ADDITION → ADD USER
// ══════════════════════════════════════════════════════════════════════

async function addUserMenu() {
  while (true) {
    head('➕  ADD USER');
    console.log(`  ${C.dim}1) Admin`);
    console.log(`  2) Teacher`);
    console.log(`  3) Student`);
    console.log(`  4) Quick-Add Default Teacher (minimal prompts)`);
    console.log(`  5) Quick-Add Default Student (minimal prompts)`);
    console.log(`  0) Back${C.reset}\n`);
    const choice = await ask('Choice', '0');
    if (choice === '1') await addAdmin();
    else if (choice === '2') await addTeacher(false);
    else if (choice === '3') await addStudent(false);
    else if (choice === '4') await addTeacher(true);
    else if (choice === '5') await addStudent(true);
    else if (choice === '0') return;
    else warn('Invalid choice.');
  }
}

// ── Add Admin — fields per models.js Admin schema ─────────────────────
async function addAdmin() {
  head('👑  ADD ADMIN  (M.Admin)');
  const fullName   = await ask('Full Name', 'New Administrator');
  if (!fullName) { warn('Full name is required.'); return; }
  const nameParts  = fullName.split(/\s+/).filter(Boolean);
  const firstName  = await ask('First Name', nameParts[0] || '');
  const lastName   = await ask('Last Name', nameParts.slice(1).join(' ') || '');
  let username     = await ask('Username', '');
  if (!username) { warn('Username is required.'); return; }
  username = username.toLowerCase().trim();
  if (await M.Admin.findOne({ username })) { warn(`Username "${username}" already exists in Admin collection.`); return; }
  const employeeNo  = await ask('Employee No', '');
  const department  = await ask('Department (free text, optional)', '');
  const adminRights = await ask('Admin Rights ("all" or comma list e.g. Manage User)', 'all');
  const password    = await askPassword('Password', 'admin123');
  const trackId      = await ask('Track ID', genTrackId('ADMIN'));
  const mustChangePw = await askYN('Force password change on first login?', true);
  const active        = await askYN('Active?', true);

  const hash = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
  await M.Admin.create({
    fullName, firstName, lastName, username, password: hash,
    employeeNo, department, trackId,
    isAdmin: true,
    adminRights: adminRights === 'all' ? 'all' : adminRights.split(',').map(s => s.trim()).filter(Boolean),
    active, mustChangePassword: mustChangePw,
  });
  await M.User.create({ username, trackId, role: 'admin', status: 'active', online: false });
  await logSetup('Admin Created (CLI)', `${fullName} (@${username})`);
  ok(`Admin "${fullName}" (@${username}) created. Password: ${password}`);
}

// ── Add Teacher — fields per models.js Teacher schema ──────────────────
async function addTeacher(quick) {
  head(quick ? '🎓  QUICK-ADD DEFAULT TEACHER' : '🎓  ADD TEACHER  (M.Teacher)');

  const fullName = await ask('Full Name', quick ? 'Default Teacher' : '');
  if (!fullName) { warn('Full name is required.'); return; }
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = quick ? (nameParts[0] || '') : await ask('First Name', nameParts[0] || '');
  const lastName  = quick ? nameParts.slice(1).join(' ') : await ask('Last Name', nameParts.slice(1).join(' ') || '');

  const employeeNo = await ask('Employee No', quick ? ('EMP' + Date.now().toString().slice(-5)) : 'EMP001');

  let department = '', deptId = null, deptCode = '';
  const useDeptList = await askYN('Pick department from existing list in DB?', true);
  if (useDeptList) {
    const dept = await pickDepartment('Select Teacher Department');
    if (dept) {
      department = dept.name;
      deptId = dept._id;
      deptCode = dept.code || dept.threeLetterCode || '';
    } else {
      department = await ask('Department (free text)', '');
    }
  } else {
    department = await ask('Department (free text)', '');
  }

  const designation = await ask('Designation', 'Assistant Professor');
  const email        = await ask('Email', '');
  let username = await ask('Username', quick ? employeeNo.toLowerCase() : '');
  if (!username) { warn('Username is required.'); return; }
  username = username.toLowerCase().trim();
  if (await M.Teacher.findOne({ username })) { warn(`Username "${username}" already exists in Teacher collection.`); return; }
  const password = await askPassword('Password', 'teacher123');

  let specials;
  if (!quick) {
    const isHOD = await askYN('Is HOD?', false);
    const isClassAdvisor = !isHOD && await askYN('Is Class Advisor?', false);
    const isTT = !isHOD && !isClassAdvisor && await askYN('Is Timetable Coordinator?', false);
    if (isHOD) specials = { option: 'isHod', key: 'isHod_' + username, value: department };
    else if (isClassAdvisor) {
      const advisorClass = await ask('Advisor Class Name', '');
      specials = { option: 'isClassAdvisor', key: 'isClassAdvisor_' + username, value: advisorClass };
    } else if (isTT) {
      specials = { option: 'isTimeTableCoordinator', key: 'isTimeTableCoordinator_' + username, value: department };
    }
  }

  const trackId = genTeacherTrackId();
  const hash = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
  await M.Teacher.create({
    fullName, firstName, lastName, employeeNo, department, deptId, deptCode, designation,
    email, username, password: hash, trackId, specials,
    isAdmin: false, active: true, current: false, status: 'active',
    mustChangePassword: true,
  });
  await M.User.create({ username, trackId, role: 'teacher', status: 'active' });
  await logSetup('Teacher Created (CLI)', `${fullName} (@${username}) trackId=${trackId}`);
  ok(`Teacher "${fullName}" (@${username}) created. Password: ${password} | trackId: ${trackId}`);
}

// ── Add Student — fields per models.js Student schema ──────────────────
async function addStudent(quick) {
  head(quick ? '🧑‍🎓  QUICK-ADD DEFAULT STUDENT' : '🧑‍🎓  ADD STUDENT  (M.Student)');

  const fullName = await ask('Full Name', quick ? 'Default Student' : '');
  if (!fullName) { warn('Full name is required.'); return; }
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = quick ? (nameParts[0] || '') : await ask('First Name', nameParts[0] || '');
  const lastName  = quick ? nameParts.slice(1).join(' ') : await ask('Last Name', nameParts.slice(1).join(' ') || '');

  const registerNo = await ask('Register No', quick ? ('7140' + Date.now().toString().slice(-8)) : '');
  if (!registerNo) { warn('Register No is required.'); return; }
  if (await M.Student.findOne({ registerNo })) { warn(`Register No "${registerNo}" already exists.`); return; }

  // Department — always offered from DB list since class/dept are linked
  let deptId = null, deptName = '';
  const dept = await pickDepartment('Select Student Department');
  if (dept) { deptId = dept._id; deptName = dept.name; }
  else { deptName = await ask('Department (free text — no dept linked)', ''); }

  // Class — filtered by chosen department
  let classId = null, className = '';
  if (deptId) {
    const cls = await pickClass(deptId, 'Select Class (filtered by department)');
    if (cls) { classId = cls._id; className = cls.name; }
  }
  if (!classId) className = await ask('Class Name (free text)', '');

  const section     = await ask('Section', classNameDefaultSection(className));
  const courseType  = await ask('Course Type (UG/PG/B.E/B.TECH/M.E/M.TECH)', 'UG');
  const branch       = await ask('Branch', 'None');
  const admissionYear = await ask('Academic Year', '2025-26');
  const email          = await ask('Email', '');
  const username       = await ask('Username', quick ? registerNo.toLowerCase() : (email ? email.split('@')[0] : registerNo.toLowerCase()));
  if (await M.User.findOne({ username: username.toLowerCase() })) { warn(`Username "${username}" already taken (shadow collection).`); return; }
  const password       = await askPassword('Password', cfg.STUDENT_PASSWORD || 'student123');
  const isRep           = !quick && await askYN('Is Class Representative?', false);

  const trackId = genStudentTrackId();
  const hash = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
  await M.Student.create({
    fullName, firstName, lastName, registerNo,
    class: className, classId, section,
    courseType, branch, department: deptName, deptId,
    admissionYear, email, username: username.toLowerCase(), password: hash,
    trackId, isRep, active: true, mustChangePassword: true,
  });
  await M.User.create({ username: username.toLowerCase(), trackId, role: 'student', status: 'active', online: false });
  await logSetup('Student Created (CLI)', `${fullName} (${registerNo}) trackId=${trackId}`);
  ok(`Student "${fullName}" (${registerNo}) created. Password: ${password} | trackId: ${trackId}`);
}

function classNameDefaultSection(className) {
  if (!className) return 'A';
  const parts = String(className).split('-');
  return parts[parts.length - 1] || 'A';
}

// ══════════════════════════════════════════════════════════════════════
//  ADDITION → ADD DEPARTMENT / ADD CLASS
// ══════════════════════════════════════════════════════════════════════

async function addDepartment() {
  head('🏛️  ADD DEPARTMENT  (M.Department)');
  const name = await ask('Department Full Name', '');
  if (!name) { warn('Name is required.'); return; }
  const code           = (await ask('3-Letter Code (e.g. CSE)', '')).toUpperCase();
  const twoLetterCode  = (await ask('2-Letter Code (e.g. cs)', '')).toLowerCase();
  const number          = await ask('3-digit Register Code (e.g. 104)', '');
  if (!/^\d{3}$/.test(number)) { warn('Register code must be exactly 3 digits.'); return; }
  const courseType     = await ask('Course Type (UG/PG)', 'UG');
  const branch           = await ask('Branch (B.E/B.TECH/M.E/M.TECH)', 'B.E');
  const icon             = await ask('Icon (emoji, optional)', '🏛️');
  const hodId           = await ask('HoD TrackID (optional)', '');
  let hodName = '';
  if (hodId) {
    const t = await M.Teacher.findOne({ trackId: hodId.trim() }).lean();
    hodName = t ? t.fullName : '';
    if (!hodName) warn('HoD TrackID not found — saving without HoD name.');
    else ok(`HoD resolved: ${hodName}`);
  }

  if (await M.Department.findOne({ $or: [{ code }, { number }] })) {
    warn('A department with this code or register number already exists.');
    return;
  }

  await M.Department.create({
    name, code, twoLetterCode, number, courseType, branch, icon,
    threeLetterCode: code.toUpperCase(),
    hodId: hodId || null, hodName,
  });
  await logSetup('Department Created (CLI)', `${name} (${code})`);
  ok(`Department "${name}" (${code}) added to DB.`);
}

async function addClass() {
  head('🏫  ADD CLASS  (M.Class)');
  const dept = await pickDepartment('Select Department for new Class');
  if (!dept) { warn('A department is required — none selected.'); return; }
  const batch   = await ask('Batch (e.g. 2025-29)', '2025-29');
  const year    = await ask('Year (I Year/II Year/III Year/IV Year)', 'I Year');
  const sem     = await ask('Semester (I..VIII)', 'I');
  const section = await ask('Section (single letter)', 'A');
  const hallNo  = await ask('Hall No', 'LH01');
  const autoName = `${batch}-${dept.code || dept.name.slice(0, 4).toUpperCase()}-${section}`;
  const name = await ask('Class Name', autoName);

  if (await M.Class.findOne({ name })) { warn(`Class "${name}" already exists.`); return; }

  await M.Class.create({
    classTrackId: genClassTrackId(),
    deptId: dept._id, deptName: dept.name, deptCode: dept.code,
    year, sem, section, hallNo, name, batch,
  });
  await logSetup('Class Created (CLI)', `${name}`);
  ok(`Class "${name}" added to DB.`);
}

// ── Normal Addition Menu (former additionMenu) ─────────────────────────
async function normalAdditionMenu() {
  while (true) {
    head('➕  NORMAL ADDITION');
    console.log(`  ${C.dim}1) Add User (Admin / Teacher / Student)`);
    console.log(`  2) Add Department`);
    console.log(`  3) Add Class`);
    console.log(`  0) Back${C.reset}\n`);
    const choice = await ask('Choice', '0');
    if (choice === '1') await addUserMenu();
    else if (choice === '2') await addDepartment();
    else if (choice === '3') await addClass();
    else if (choice === '0') return;
    else warn('Invalid choice.');
  }
}

// ══════════════════════════════════════════════════════════════════════
//  DEMO DATA — POOLS
// ══════════════════════════════════════════════════════════════════════

const DEMO = {
  firstNames: [
    'Arun','Karthik','Vijay','Priya','Deepa','Sathish','Muthu','Ravi','Kumar','Suresh',
    'Lakshmi','Kavitha','Meena','Anand','Ramesh','Selvam','Gowri','Bharathi','Rajesh','Divya',
    'Senthil','Arjun','Pooja','Nithya','Vignesh','Saranya','Harini','Pandian','Manikandan','Sowmiya',
    'Bala','Ganesh','Siva','Mani','Veni','Radha','Gopal','Malar','Dinesh','Pradeep',
    'Tamilselvan','Yuvarani','Janani','Surya','Keerthana','Venkatesh','Shobana','Mohan','Abinaya','Prasanth',
  ],
  lastNames: [
    'Kumar','Raj','Murali','Devi','Selvam','Krishnan','Murugan','Sundaram','Narayanan','Rajan',
    'Pandian','Subramanian','Chandran','Venkatesh','Natarajan','Balasubramanian','Arumugam',
    'Rajagopal','Shanmugam','Ganesan','Prabhu','Srinivasan','Periyasamy','Senthilkumar','Velmurugan',
  ],
  // Predefined departments (pool of 8 — user picks how many to seed)
  depts: [
    { name:'Computer Science and Engineering',        code:'CSE',  twoLetterCode:'cs', number:'114', courseType:'UG', branch:'B.E',    icon:'💻' },
    { name:'Electronics and Communication Engg',      code:'ECE',  twoLetterCode:'ec', number:'107', courseType:'UG', branch:'B.E',    icon:'📡' },
    { name:'Mechanical Engineering',                  code:'MECH', twoLetterCode:'me', number:'101', courseType:'UG', branch:'B.E',    icon:'⚙️' },
    { name:'Electrical and Electronics Engineering',  code:'EEE',  twoLetterCode:'ee', number:'109', courseType:'UG', branch:'B.E',    icon:'⚡' },
    { name:'Civil Engineering',                       code:'CIVIL',twoLetterCode:'ci', number:'112', courseType:'UG', branch:'B.E',    icon:'🏗️' },
    { name:'Information Technology',                  code:'IT',   twoLetterCode:'it', number:'706', courseType:'UG', branch:'B.TECH', icon:'🖥️' },
    { name:'Artificial Intelligence and ML',          code:'AIML', twoLetterCode:'ai', number:'411', courseType:'UG', branch:'B.TECH', icon:'🤖' },
    { name:'Computer Science and Design',             code:'CSD',  twoLetterCode:'cd', number:'412', courseType:'UG', branch:'B.TECH', icon:'🎨' },
  ],
  // Subjects pool per department (code must be unique system-wide)
  subjectsByDept: {
    CSE:  [
      { name:'Data Structures and Algorithms',  code:'CS6301', credits:4, type:'Theory' },
      { name:'Operating Systems',               code:'CS6401', credits:4, type:'Theory' },
      { name:'Database Management Systems',     code:'CS6302', credits:4, type:'Theory' },
      { name:'Computer Networks',               code:'CS6501', credits:4, type:'Theory' },
      { name:'Software Engineering',            code:'CS6403', credits:3, type:'Theory' },
      { name:'Object Oriented Programming',     code:'CS6202', credits:4, type:'Theory' },
      { name:'DBMS Lab',                        code:'CS6312', credits:2, type:'Lab'    },
      { name:'Networks Lab',                    code:'CS6511', credits:2, type:'Lab'    },
    ],
    ECE:  [
      { name:'Signals and Systems',             code:'EC6303', credits:4, type:'Theory' },
      { name:'Digital Electronics',             code:'EC6302', credits:4, type:'Theory' },
      { name:'Communication Theory',            code:'EC6402', credits:4, type:'Theory' },
      { name:'VLSI Design',                     code:'EC6601', credits:3, type:'Theory' },
      { name:'Embedded Systems',                code:'EC6504', credits:3, type:'Theory' },
      { name:'Microprocessors and Controllers', code:'EC6504', credits:3, type:'Theory' },
      { name:'Digital Lab',                     code:'EC6312', credits:2, type:'Lab'    },
      { name:'Communication Lab',               code:'EC6412', credits:2, type:'Lab'    },
    ],
    MECH: [
      { name:'Engineering Mechanics',           code:'ME6401', credits:4, type:'Theory' },
      { name:'Fluid Mechanics and Machinery',   code:'ME6403', credits:4, type:'Theory' },
      { name:'Thermodynamics',                  code:'ME6301', credits:4, type:'Theory' },
      { name:'Manufacturing Technology',        code:'ME6402', credits:3, type:'Theory' },
      { name:'CAD/CAM',                         code:'ME6501', credits:3, type:'Theory' },
      { name:'Dynamics of Machinery',           code:'ME6302', credits:4, type:'Theory' },
      { name:'Workshop Lab',                    code:'ME6311', credits:2, type:'Lab'    },
      { name:'CAD Lab',                         code:'ME6511', credits:2, type:'Lab'    },
    ],
    EEE:  [
      { name:'Electrical Machines I',           code:'EE6401', credits:4, type:'Theory' },
      { name:'Power Systems Analysis',          code:'EE6501', credits:4, type:'Theory' },
      { name:'Control Systems',                 code:'EE6351', credits:4, type:'Theory' },
      { name:'Power Electronics',               code:'EE6503', credits:4, type:'Theory' },
      { name:'Electrical Machines II',          code:'EE6504', credits:4, type:'Theory' },
      { name:'High Voltage Engineering',        code:'EE6701', credits:3, type:'Theory' },
      { name:'Electrical Machines Lab',         code:'EE6411', credits:2, type:'Lab'    },
      { name:'Power Electronics Lab',           code:'EE6511', credits:2, type:'Lab'    },
    ],
    CIVIL: [
      { name:'Structural Analysis',             code:'CE6501', credits:4, type:'Theory' },
      { name:'Environmental Engineering',       code:'CE6601', credits:4, type:'Theory' },
      { name:'Concrete Technology',             code:'CE6401', credits:3, type:'Theory' },
      { name:'Soil Mechanics',                  code:'CE6405', credits:4, type:'Theory' },
      { name:'Highway Engineering',             code:'CE6503', credits:3, type:'Theory' },
      { name:'Foundation Engineering',          code:'CE6602', credits:3, type:'Theory' },
      { name:'Surveying Lab',                   code:'CE6411', credits:2, type:'Lab'    },
      { name:'Concrete Lab',                    code:'CE6511', credits:2, type:'Lab'    },
    ],
    IT: [
      { name:'Web Technology',                  code:'IT6503', credits:3, type:'Theory' },
      { name:'Cloud Computing',                 code:'IT6601', credits:3, type:'Theory' },
      { name:'Cyber Security',                  code:'IT6702', credits:3, type:'Theory' },
      { name:'Machine Learning Fundamentals',   code:'IT6010', credits:3, type:'Theory' },
      { name:'Software Testing',                code:'IT6604', credits:3, type:'Theory' },
      { name:'Mobile Application Development',  code:'IT6602', credits:3, type:'Theory' },
      { name:'Web Programming Lab',             code:'IT6512', credits:2, type:'Lab'    },
      { name:'Networks Lab',                    code:'IT6611', credits:2, type:'Lab'    },
    ],
    AIML: [
      { name:'Introduction to Artificial Intelligence', code:'AI6301', credits:4, type:'Theory' },
      { name:'Machine Learning',                code:'AI6401', credits:4, type:'Theory' },
      { name:'Deep Learning',                   code:'AI6501', credits:3, type:'Theory' },
      { name:'Natural Language Processing',     code:'AI6502', credits:3, type:'Theory' },
      { name:'Computer Vision',                 code:'AI6601', credits:3, type:'Theory' },
      { name:'Reinforcement Learning',          code:'AI6602', credits:3, type:'Theory' },
      { name:'AI Lab',                          code:'AI6411', credits:2, type:'Lab'    },
      { name:'ML Lab',                          code:'AI6511', credits:2, type:'Lab'    },
    ],
    CSD: [
      { name:'UI/UX Design Principles',         code:'CD6301', credits:3, type:'Theory' },
      { name:'Human Computer Interaction',      code:'CD6401', credits:3, type:'Theory' },
      { name:'Multimedia Systems',              code:'CD6501', credits:3, type:'Theory' },
      { name:'Visual Design',                   code:'CD6302', credits:3, type:'Theory' },
      { name:'Interaction Design',              code:'CD6402', credits:3, type:'Theory' },
      { name:'User Research Methods',           code:'CD6502', credits:3, type:'Theory' },
      { name:'Design Lab',                      code:'CD6311', credits:2, type:'Lab'    },
      { name:'Prototyping Lab',                 code:'CD6411', credits:2, type:'Lab'    },
    ],
  },
  designations: ['Professor','Assistant Professor','Associate Professor','Lecturer','Senior Lecturer'],
  years:    ['I Year','II Year','III Year','IV Year'],
  semByYear:{ 'I':'I', 'II':'III', 'III':'V', 'IV':'VII' },
  sections: ['A','B','C','D','E'],
  hallNos:  ['LH01','LH02','LH03','LH04','LH05','LH06','LH07','LH08'],
};

// ── Demo helpers ────────────────────────────────────────────────────────
function rnd(arr)        { return arr[Math.floor(Math.random() * arr.length)]; }
function rndInt(min,max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function genName() {
  const firstName = rnd(DEMO.firstNames);
  const lastName  = rnd(DEMO.lastNames);
  return { fullName: `${firstName} ${lastName}`, firstName, lastName };
}

// Build student register no: 7140 + YY + DDD(dept.number) + RRR(roll)
function buildRegNo(yearCode, deptNumber, roll) {
  return `7140${yearCode}${deptNumber}${String(roll).padStart(3,'0')}`;
}

// Build student trackId: TR + YY + TWOCODE.upper + RRR
function buildStudentTrackId(yearCode, twoCode, roll) {
  return `TR${yearCode}${twoCode.toUpperCase()}${String(roll).padStart(3,'0')}`;
}

// Build student email: firstname+lastname[0]+YY+twoCode@srishakthi.ac.in
function buildStudentEmail(firstName, lastName, yearCode, twoCode) {
  return `${firstName.toLowerCase()}${(lastName[0] || '').toLowerCase()}${yearCode}${twoCode.toLowerCase()}@srishakthi.ac.in`;
}

// Build teacher trackId from empId: EMP001 → TR-EMP001
function buildTeacherTrackId(empNo) {
  return `TR-${empNo}`;
}

// ══════════════════════════════════════════════════════════════════════
//  DEMO — CORE GENERATOR FUNCTIONS
//  Each returns { created, skipped } so wrappers can print summary.
// ══════════════════════════════════════════════════════════════════════

// ── Demo Departments ────────────────────────────────────────────────────
async function _demoDepts(count) {
  const pool = DEMO.depts.slice(0, Math.min(count, DEMO.depts.length));
  let created = 0, skipped = 0;

  for (const d of pool) {
    const exists = await M.Department.findOne({ $or: [{ code: d.code }, { number: d.number }] });
    if (exists) {
      warn(`  Dept ${d.code} already exists — skipping.`);
      skipped++; continue;
    }
    await M.Department.create({ ...d, threeLetterCode: d.code.toUpperCase(), hodId: null, hodName: '' });
    ok(`  Dept "${d.name}" (${d.code}) created.`);
    created++;
  }
  await logSetup('Demo Departments Created (CLI)', `${created} created, ${skipped} skipped`);
  return { created, skipped };
}

// ── Demo Classes ─────────────────────────────────────────────────────────
async function _demoClasses(perDept, batch, yearRaw) {
  const depts = await M.Department.find().lean();
  if (!depts.length) { warn('No departments found — create Demo Departments first.'); return { created:0, skipped:0 }; }

  const year    = yearRaw.includes('Year') ? yearRaw : `${yearRaw} Year`;
  const yKey    = yearRaw.trim().replace(' Year','');
  const sem     = DEMO.semByYear[yKey] || 'I';
  let created = 0, skipped = 0;
  let hallIdx = 0;

  for (const dept of depts) {
    for (let i = 0; i < perDept; i++) {
      const section   = DEMO.sections[i] || String.fromCharCode(65 + i);
      const hallNo    = DEMO.hallNos[hallIdx++ % DEMO.hallNos.length];
      const className = `${batch} ${dept.code}-${section}`;

      if (await M.Class.findOne({ name: className })) {
        skipped++; continue;
      }
      await M.Class.create({
        classTrackId: genClassTrackId(),
        name: className, deptId: dept._id, deptName: dept.name, deptCode: dept.code,
        year, sem, section, hallNo, batch,
      });
      ok(`  Class "${className}" created.`);
      created++;
    }
  }
  await logSetup('Demo Classes Created (CLI)', `${created} created, ${skipped} skipped`);
  return { created, skipped };
}

// ── Demo Subjects ─────────────────────────────────────────────────────────
async function _demoSubjects(perDept) {
  const depts = await M.Department.find().lean();
  if (!depts.length) { warn('No departments found — create Demo Departments first.'); return { created:0, skipped:0 }; }

  let created = 0, skipped = 0;

  for (const dept of depts) {
    const pool    = DEMO.subjectsByDept[dept.code] || [];
    const subset  = pool.slice(0, Math.min(perDept, pool.length));

    // If pool empty for this dept, generate generic subjects
    if (!subset.length) {
      for (let i = 1; i <= perDept; i++) {
        const code        = `${dept.code}60${i}1`;
        const subjectCode = `${code}-${dept.code}`;
        if (await M.Subject.findOne({ subjectCode })) { skipped++; continue; }
        await M.Subject.create({
          subjectTrackId: genSubjectTrackId(),
          name: `${dept.code} Subject ${i}`, code, subjectCode,
          credits: 3, type: 'Theory',
          deptId: dept._id, deptName: dept.name, deptCode: dept.code,
        });
        ok(`  Subject "${dept.code} Subject ${i}" created.`);
        created++;
      }
      continue;
    }

    for (const subj of subset) {
      const subjectCode = `${subj.code}-${dept.code}`;
      if (await M.Subject.findOne({ subjectCode })) { skipped++; continue; }
      await M.Subject.create({
        subjectTrackId: genSubjectTrackId(),
        name: subj.name, code: subj.code, subjectCode,
        credits: subj.credits, type: subj.type,
        deptId: dept._id, deptName: dept.name, deptCode: dept.code,
      });
      ok(`  Subject "${subj.name}" (${subjectCode}) created.`);
      created++;
    }
  }
  await logSetup('Demo Subjects Created (CLI)', `${created} created, ${skipped} skipped`);
  return { created, skipped };
}

// ── Demo Teachers ──────────────────────────────────────────────────────────
async function _demoTeachers(count) {
  const depts = await M.Department.find().lean();

  // Find the next available employee number
  let empCounter = 1;
  const lastTch = await M.Teacher.findOne().sort({ createdAt: -1 }).lean();
  if (lastTch?.employeeNo) {
    const m = lastTch.employeeNo.match(/\d+/);
    if (m) empCounter = parseInt(m[0], 10) + 1;
  }

  let created = 0, skipped = 0;

  for (let i = 0; i < count; i++) {
    const { fullName, firstName, lastName } = genName();
    const empNo   = `EMP${String(empCounter).padStart(3,'0')}`;
    empCounter++;
    const trackId = buildTeacherTrackId(empNo);

    // username = first2ofFirst + empNo (e.g. ar + EMP001 = aremp001)
    let username = (firstName.slice(0,3) + empNo).toLowerCase().replace(/\s+/g,'');

    if (await M.Teacher.findOne({ username })) {
      username = username + String(rndInt(10,99));
    }
    if (await M.Teacher.findOne({ username })) { skipped++; continue; }

    const dept        = depts.length ? depts[i % depts.length] : null;
    const department  = dept ? dept.name : 'General';
    const deptId      = dept ? dept._id : null;
    const deptCode    = dept ? (dept.code || dept.threeLetterCode || '') : '';
    const designation = rnd(DEMO.designations);
    const email       = `${username}@srishakthi.ac.in`;
    const password    = 'teacher123';
    const hash        = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);

    await M.Teacher.create({
      fullName, firstName, lastName, employeeNo: empNo,
      department, deptId, deptCode, designation, email, username, password: hash,
      trackId, specials: [], isAdmin: false, active: true,
      status: 'active', mustChangePassword: true,
    });
    await M.User.create({
      username: username, trackId: trackId, role: 'teacher', status: 'active'
    })
    ok(`  Teacher "${fullName}" (@${username}) | empNo: ${empNo} | pass: ${password}`);
    created++;
  }
  await logSetup('Demo Teachers Created (CLI)', `${created} created, ${skipped} skipped`);
  return { created, skipped };
}

// ── Demo Admins ────────────────────────────────────────────────────────────
async function _demoAdmins(count) {
  let created = 0, skipped = 0;

  for (let i = 1; i <= count; i++) {
    const { fullName, firstName, lastName } = genName();
    const username = `admin${i}`;
    const password = 'admin@123';

    if (await M.Admin.findOne({ username })) {
      warn(`  Admin "@${username}" already exists — skipping.`);
      skipped++; continue;
    }

    const hash    = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);
    const trackId = genTrackId('ADMIN');

    await M.Admin.create({
      fullName, firstName, lastName, username, password: hash,
      employeeNo: `EMP${String(i).padStart(3,'0')}`,
      department: 'Administration',
      trackId, isAdmin: true, adminRights: 'all',
      active: true, mustChangePassword: true,
    });
    await M.User.create({ username, trackId, role: 'admin', status: 'active', online: false });

    ok(`  Admin "${fullName}" (@${username}) | pass: ${password}`);
    created++;
  }
  await logSetup('Demo Admins Created (CLI)', `${created} created, ${skipped} skipped`);
  return { created, skipped };
}

// ── Demo Students ──────────────────────────────────────────────────────────
async function _demoStudents(perClass) {
  const depts   = await M.Department.find().lean();
  const classes = await M.Class.find().lean();

  if (!classes.length) {
    warn('No classes found — create Demo Classes first.');
    return { created:0, skipped:0 };
  }

  const academicYear = '2026-27';
  const yearCode     = '26';   // from 2025-26

  // Track roll counters per dept to keep registerNo unique
  const deptRolls = {};

  let created = 0, skipped = 0;

  for (const cls of classes) {
    const dept = depts.find(d => String(d._id) === String(cls.deptId));
    if (!dept) { warn(`  No dept for class "${cls.name}" — skipping.`); continue; }

    const twoCode  = dept.twoLetterCode || dept.code.slice(0,2).toLowerCase();
    const deptNum  = (dept.number || '000').padStart(3,'0');
    const deptKey  = String(dept._id);
    if (!deptRolls[deptKey]) deptRolls[deptKey] = 1;

    for (let i = 0; i < perClass; i++) {
      const { fullName, firstName, lastName } = genName();
      const roll       = deptRolls[deptKey]++;
      const registerNo = buildRegNo(yearCode, deptNum, roll);
      const trackId    = buildStudentTrackId(yearCode, twoCode, roll);

      if (await M.Student.findOne({ registerNo })) { skipped++; continue; }

      // Build email — append roll suffix to avoid collisions on same-name people
      const baseEmail = buildStudentEmail(firstName, lastName, yearCode, twoCode);
      const emailUser = baseEmail.split('@')[0];
      const email     = `${emailUser}${String(roll).padStart(3,'0')}@srishakthi.ac.in`;
      const username  = `${emailUser}${String(roll).padStart(3,'0')}`;

      if (await M.Student.findOne({ username })) { skipped++; continue; }
      if (await M.User.findOne({ username })) { skipped++; continue; }

      const password = 'student123';
      const hash     = await bcrypt.hash(password, cfg.BCRYPT_ROUNDS);

      await M.Student.create({
        fullName, firstName, lastName, registerNo,
        class: cls.name, classId: cls._id, section: cls.section,
        courseType: dept.courseType || 'UG',
        branch:     dept.branch     || 'B.E',
        department: dept.name, deptId: dept._id,
        admissionYear: academicYear,
        email, username, password: hash,
        trackId, isRep: false, active: true, mustChangePassword: true,
      });
      await M.User.create({ username, trackId, role: 'student', status: 'active', online: false });
      ok(`  ${created+1}: Student "${fullName}" (${registerNo}) → class "${cls.name}"`);
      created++;
    }
  }
  await logSetup('Demo Students Created (CLI)', `${created} created, ${skipped} skipped`);
  return { created, skipped };
}

// ── Demo Assignments ───────────────────────────────────────────────────────
// Auto-assigns: for every class, each subject of that dept gets one teacher
async function _demoAssignments() {
  const subjects = await M.Subject.find().lean();
  const classes  = await M.Class.find().lean();
  const teachers = await M.Teacher.find().lean();

  if (!subjects.length) { warn('No subjects found — create Demo Subjects first.');  return { created:0, skipped:0 }; }
  if (!classes.length)  { warn('No classes found — create Demo Classes first.');    return { created:0, skipped:0 }; }
  if (!teachers.length) { warn('No teachers found — create Demo Teachers first.'); return { created:0, skipped:0 }; }

  let created = 0, skipped = 0, globalTchIdx = 0;

  for (const cls of classes) {
    // Subjects belonging to this class's department
    const deptSubjects = subjects.filter(s => String(s.deptId) === String(cls.deptId));
    if (!deptSubjects.length) continue;

    // Prefer dept-matched teachers; fall back to any teacher
    const deptTeachers = teachers.filter(t => t.department === cls.deptName);
    const pool = deptTeachers.length ? deptTeachers : teachers;

    for (const subj of deptSubjects) {
      const existing = await M.Assignment.findOne({
        subjectId: String(subj._id),
        classId:   String(cls._id),
      });
      if (existing) { skipped++; continue; }

      const teacher = pool[globalTchIdx % pool.length];
      globalTchIdx++;

      await M.Assignment.create({
        subjectId:   String(subj._id),
        subjectName: subj.name,
        classId:     String(cls._id),
        className:   cls.name,
        teacherId:   String(teacher._id),
        teacherName: teacher.fullName,
        hallNo:      cls.hallNo || 'LH01',
        deptName:    cls.deptName,
        deptCode:    cls.deptCode,
      });
      ok(`  Assigned "${subj.name}" → class "${cls.name}" → teacher "${teacher.fullName}"`);
      created++;
    }
  }
  await logSetup('Demo Assignments Created (CLI)', `${created} created, ${skipped} skipped`);
  return { created, skipped };
}

// ══════════════════════════════════════════════════════════════════════
//  DEMO — MENU WRAPPERS (each asks for count then calls core fn)
// ══════════════════════════════════════════════════════════════════════

async function demoStudentsMenu() {
  head('🧑‍🎓  DEMO — STUDENTS');
  const classes = await M.Class.find().lean();
  const depts   = await M.Department.find().lean();
  if (!classes.length) { warn('No classes found. Run Demo → Departments then Demo → Classes first.'); return; }
  info(`Found ${depts.length} department(s), ${classes.length} class(es).`);
  console.log(`  Each class will get the same number of students.\n`);

  const raw      = await ask('How many students per class?', '5');
  const perClass = Math.max(1, Math.min(100, parseInt(raw,10) || 5));

  console.log(`\n  ${C.bold}Preview:${C.reset} ${perClass * classes.length} total students (${perClass}/class × ${classes.length} classes)`);
  const go = await askYN('Proceed?', true);
  if (!go) { info('Cancelled.'); return; }

  const { created, skipped } = await _demoStudents(perClass);
  console.log(`\n  ${C.green}${C.bold}✅ Students done:${C.reset}  ${created} created  |  ${skipped} skipped (duplicates)`);
}

async function demoAdminsMenu() {
  head('👑  DEMO — ADMINS');
  const raw   = await ask('How many admin accounts?', '2');
  const count = Math.max(1, Math.min(10, parseInt(raw,10) || 2));
  info(`Creating ${count} demo admin(s)…`);

  const { created, skipped } = await _demoAdmins(count);
  console.log(`\n  ${C.green}${C.bold}✅ Admins done:${C.reset}  ${created} created  |  ${skipped} skipped (duplicates)`);
}

async function demoTeachersMenu() {
  head('🎓  DEMO — TEACHERS');
  const depts = await M.Department.find().lean();
  if (depts.length) info(`Found ${depts.length} department(s) — teachers will be distributed across them.`);
  else              warn('No departments found — teachers will have department set to "General".');

  const raw   = await ask('How many teachers?', '10');
  const count = Math.max(1, Math.min(200, parseInt(raw,10) || 10));
  info(`Creating ${count} demo teacher(s)…`);

  const { created, skipped } = await _demoTeachers(count);
  console.log(`\n  ${C.green}${C.bold}✅ Teachers done:${C.reset}  ${created} created  |  ${skipped} skipped (duplicates)`);
}

async function demoDepartmentsMenu() {
  head('🏛️  DEMO — DEPARTMENTS');
  console.log(`  Available predefined departments:\n`);
  DEMO.depts.forEach((d,i) =>
    console.log(`  ${C.dim}${String(i+1).padStart(2,' ')})${C.reset}  ${d.code.padEnd(6,' ')}  ${d.name}`)
  );
  console.log();

  const raw   = await ask(`How many to create? (1–${DEMO.depts.length})`, String(DEMO.depts.length));
  const count = Math.max(1, Math.min(DEMO.depts.length, parseInt(raw,10) || DEMO.depts.length));

  console.log(`\n  Will create the first ${count} department(s) from the list above.`);
  const go = await askYN('Proceed?', true);
  if (!go) { info('Cancelled.'); return; }

  const { created, skipped } = await _demoDepts(count);
  console.log(`\n  ${C.green}${C.bold}✅ Departments done:${C.reset}  ${created} created  |  ${skipped} skipped (duplicates)`);
}

async function demoClassesMenu() {
  head('🏫  DEMO — CLASSES');
  const depts = await M.Department.find().lean();
  if (!depts.length) { warn('No departments found. Run Demo → Departments first.'); return; }
  info(`Found ${depts.length} department(s).`);

  const perDeptRaw = await ask('How many classes per department?', '2');
  const perDept    = Math.max(1, Math.min(5, parseInt(perDeptRaw,10) || 2));
  const batch      = await ask('Batch (e.g. 2025-29)', '2025-29');
  const yearRaw    = await ask('Year (I / II / III / IV)', 'I');

  console.log(`\n  ${C.bold}Preview:${C.reset} ${perDept * depts.length} classes (${perDept}/dept × ${depts.length} depts), batch ${batch}`);
  const go = await askYN('Proceed?', true);
  if (!go) { info('Cancelled.'); return; }

  const { created, skipped } = await _demoClasses(perDept, batch, yearRaw);
  console.log(`\n  ${C.green}${C.bold}✅ Classes done:${C.reset}  ${created} created  |  ${skipped} skipped (duplicates)`);
}

async function demoSubjectsMenu() {
  head('📚  DEMO — SUBJECTS');
  const depts = await M.Department.find().lean();
  if (!depts.length) { warn('No departments found. Run Demo → Departments first.'); return; }
  info(`Found ${depts.length} department(s).`);
  console.log(`  Subjects are picked from the predefined pool for each department code.\n`);

  const raw     = await ask('How many subjects per department? (max 8)', '5');
  const perDept = Math.max(1, Math.min(8, parseInt(raw,10) || 5));

  console.log(`\n  ${C.bold}Preview:${C.reset} up to ${perDept * depts.length} subjects (${perDept}/dept × ${depts.length} depts)`);
  const go = await askYN('Proceed?', true);
  if (!go) { info('Cancelled.'); return; }

  const { created, skipped } = await _demoSubjects(perDept);
  console.log(`\n  ${C.green}${C.bold}✅ Subjects done:${C.reset}  ${created} created  |  ${skipped} skipped (duplicates)`);
}

async function demoAssignmentsMenu() {
  head('📋  DEMO — ASSIGNMENTS');
  const sc = await M.Subject.countDocuments();
  const cc = await M.Class.countDocuments();
  const tc = await M.Teacher.countDocuments();

  if (!sc) { warn('No subjects found. Create Demo Subjects first.'); return; }
  if (!cc) { warn('No classes found. Create Demo Classes first.');   return; }
  if (!tc) { warn('No teachers found. Create Demo Teachers first.'); return; }

  info(`Found ${sc} subject(s), ${cc} class(es), ${tc} teacher(s).`);
  console.log(`\n  Auto-assign logic:`);
  console.log(`  • For every class, every subject of that department gets one teacher.`);
  console.log(`  • Teachers are matched by department, or cycled from all teachers if unmatched.`);
  console.log(`  • Existing assignments are skipped (no duplicates).\n`);

  const go = await askYN('Proceed with auto-assignment?', true);
  if (!go) { info('Cancelled.'); return; }

  const { created, skipped } = await _demoAssignments();
  console.log(`\n  ${C.green}${C.bold}✅ Assignments done:${C.reset}  ${created} created  |  ${skipped} skipped (already exist)`);
}

// ── Demo All ───────────────────────────────────────────────────────────────
async function demoAllMenu() {
  head('🎭  DEMO — ALL DATA');
  info('Generates the full dataset in order: Depts → Classes → Subjects → Teachers → Admins → Students → Assignments.');
  console.log(`  Answer each prompt — then confirm once to create everything.\n`);

  // Collect all counts upfront
  const deptCount   = Math.max(1, Math.min(DEMO.depts.length,
    parseInt(await ask(`Departments to create (1–${DEMO.depts.length})`, String(DEMO.depts.length)), 10) || DEMO.depts.length));
  const perDept     = Math.max(1, Math.min(5,
    parseInt(await ask('Classes per department', '2'), 10) || 2));
  const batch       = await ask('Batch (e.g. 2026-30)', '2026-30');
  const yearRaw     = await ask('Year (I / II / III / IV)', 'I');
  const subjPerDept = Math.max(1, Math.min(8,
    parseInt(await ask('Subjects per department (max 8)', '5'), 10) || 5));
  const tchCount    = Math.max(1, Math.min(200,
    parseInt(await ask('Total teachers', '10'), 10) || 10));
  const admCount    = Math.max(1, Math.min(10,
    parseInt(await ask('Admin accounts', '1'), 10) || 1));
  const studPerCls  = Math.max(1, Math.min(200,
    parseInt(await ask('Students per class', '5'), 10) || 5));

  // Summary
  console.log(`\n  ${C.bold}${C.blue}Summary${C.reset}`);
  console.log(`  ┌─────────────────────────────────────────────┐`);
  console.log(`  │  Departments  : ${String(deptCount).padEnd(28,' ')}│`);
  console.log(`  │  Classes      : ${String(deptCount * perDept).padEnd(28,' ')}│`);
  console.log(`  │  Subjects     : up to ${String(deptCount * subjPerDept).padEnd(23,' ').trim()}│`);
  console.log(`  │  Teachers     : ${String(tchCount).padEnd(28,' ')}│`);
  console.log(`  │  Admins       : ${String(admCount).padEnd(28,' ')}│`);
  console.log(`  │  Students     : ${String(studPerCls) + '/class (total ≈ ' + (deptCount*perDept*studPerCls) + ')  '}${''.padEnd(0,' ')}│`);
  console.log(`  │  Assignments  : auto-generated              │`);
  console.log(`  └─────────────────────────────────────────────┘\n`);

  const go = await askYN('Proceed with full demo seed?', true);
  if (!go) { info('Cancelled.'); return; }

  // ── Step 1: Departments ──
  head('🏛️  Step 1/7 — Departments');
  const dr = await _demoDepts(deptCount);
  ok(`Departments: ${dr.created} created, ${dr.skipped} skipped.`);

  // ── Step 2: Classes ──
  head('🏫  Step 2/7 — Classes');
  const cr = await _demoClasses(perDept, batch, yearRaw);
  ok(`Classes: ${cr.created} created, ${cr.skipped} skipped.`);

  // ── Step 3: Subjects ──
  head('📚  Step 3/7 — Subjects');
  const sr = await _demoSubjects(subjPerDept);
  ok(`Subjects: ${sr.created} created, ${sr.skipped} skipped.`);

  // ── Step 4: Teachers ──
  head('🎓  Step 4/7 — Teachers');
  const tr = await _demoTeachers(tchCount);
  ok(`Teachers: ${tr.created} created, ${tr.skipped} skipped.`);

  // ── Step 5: Admins ──
  head('👑  Step 5/7 — Admins');
  const ar = await _demoAdmins(admCount);
  ok(`Admins: ${ar.created} created, ${ar.skipped} skipped.`);

  // ── Step 6: Students ──
  head('🧑‍🎓  Step 6/7 — Students');
  const stu = await _demoStudents(studPerCls);
  ok(`Students: ${stu.created} created, ${stu.skipped} skipped.`);

  // ── Step 7: Assignments ──
  head('📋  Step 7/7 — Assignments');
  const ass = await _demoAssignments();
  ok(`Assignments: ${ass.created} created, ${ass.skipped} skipped.`);

  // Final summary
  console.log(`\n${C.bold}${C.green}  ╔═════════════════════════════════════════════════╗`);
  console.log(`  ║   🎉  Full demo seed complete!                  ║`);
  console.log(`  ║                                                 ║`);
  console.log(`  ║   Departments : ${String(dr.created).padEnd(30,' ')} ║`);
  console.log(`  ║   Classes     : ${String(cr.created).padEnd(30,' ')} ║`);
  console.log(`  ║   Subjects    : ${String(sr.created).padEnd(30,' ')} ║`);
  console.log(`  ║   Teachers    : ${String(tr.created).padEnd(30,' ')} ║`);
  console.log(`  ║   Admins      : ${String(ar.created).padEnd(30,' ')} ║`);
  console.log(`  ║   Students    : ${String(stu.created).padEnd(30,' ')} ║`);
  console.log(`  ║   Assignments : ${String(ass.created).padEnd(30,' ')} ║`);
  console.log(`  ╚═════════════════════════════════════════════════╝${C.reset}\n`);

  await logSetup('Demo All Seed Complete (CLI)',
    `depts=${dr.created} classes=${cr.created} subjects=${sr.created} teachers=${tr.created} admins=${ar.created} students=${stu.created} assignments=${ass.created}`);
}

// ── Demo Menu ──────────────────────────────────────────────────────────────
async function demoMenu() {
  while (true) {
    head('🎭  DEMO DATA');
    console.log(`  ${C.dim}Create realistic sample data for testing EAMS.\n`);
    console.log(`  1) Students      → pick count per class`);
    console.log(`  2) Admins        → pick count`);
    console.log(`  3) Teachers      → pick count`);
    console.log(`  4) Departments   → pick from predefined pool`);
    console.log(`  5) Classes       → pick count per department`);
    console.log(`  6) Subjects      → pick count per department`);
    console.log(`  7) Assignments   → auto-assign (needs subjects + classes + teachers)`);
    console.log(`  8) All           → full seed wizard (all in one go)`);
    console.log(`  0) Back${C.reset}\n`);
    const choice = await ask('Choice', '0');
    if      (choice === '1') await demoStudentsMenu();
    else if (choice === '2') await demoAdminsMenu();
    else if (choice === '3') await demoTeachersMenu();
    else if (choice === '4') await demoDepartmentsMenu();
    else if (choice === '5') await demoClassesMenu();
    else if (choice === '6') await demoSubjectsMenu();
    else if (choice === '7') await demoAssignmentsMenu();
    else if (choice === '8') await demoAllMenu();
    else if (choice === '0') return;
    else warn('Invalid choice.');
  }
}

// ── Addition Menu (Normal + Demo) ──────────────────────────────────────────
async function additionMenu() {
  while (true) {
    head('➕  ADDITION');
    console.log(`  ${C.dim}1) Normal      → Add User / Department / Class (manual)`);
    console.log(`  2) Demo Data   → Generate sample data for testing`);
    console.log(`  0) Back to Main Menu${C.reset}\n`);
    const choice = await ask('Choice', '0');
    if      (choice === '1') await normalAdditionMenu();
    else if (choice === '2') await demoMenu();
    else if (choice === '0') return;
    else warn('Invalid choice.');
  }
}

// ══════════════════════════════════════════════════════════════════════
//  DELETION
// ══════════════════════════════════════════════════════════════════════

async function deleteSingleUser() {
  head('🗑️  DELETE SINGLE USER');
  console.log(`  ${C.dim}1) Admin   2) Teacher   3) Student   0) Cancel${C.reset}`);
  const roleChoice = await ask('Role', '0');
  const map = { '1': { model: M.Admin, label: 'Admin' }, '2': { model: M.Teacher, label: 'Teacher' }, '3': { model: M.Student, label: 'Student' } };
  if (!map[roleChoice]) return;
  const { model, label } = map[roleChoice];

  const docs = await model.find().select(label === 'Student' ? 'fullName registerNo username' : 'fullName username').lean();
  const labelFn = (d) => label === 'Student'
    ? `${d.fullName}  ${C.dim}(${d.registerNo} · @${d.username})${C.reset}`
    : `${d.fullName}  ${C.dim}(@${d.username})${C.reset}`;
  const target = await pickFromList(docs, labelFn, `Select ${label} to delete`);
  if (!target) return;

  const sure = await confirmPhrase('DELETE', `This will permanently delete ${label} "${target.fullName}".`);
  if (!sure) { info('Cancelled.'); return; }

  await model.findByIdAndDelete(target._id);
  if (label === 'Teacher') await M.Assignment.deleteMany({ teacherId: target._id });
  await M.User.deleteOne({ username: target.username }); // remove shadow if present
  await logSetup(`${label} Deleted (CLI)`, target.fullName, 'warning');
  ok(`${label} "${target.fullName}" deleted.`);
}

async function deleteDepartment() {
  head('🗑️  DELETE DEPARTMENT');
  const dept = await pickDepartment('Select Department to delete');
  if (!dept) return;
  const classCount = await M.Class.countDocuments({ deptId: dept._id });
  const sure = await confirmPhrase('DELETE', `Deleting "${dept.name}" will NOT auto-delete its ${classCount} linked class(es) — delete those separately if needed.`);
  if (!sure) { info('Cancelled.'); return; }
  await M.Department.findByIdAndDelete(dept._id);
  await logSetup('Department Deleted (CLI)', dept.name, 'warning');
  ok(`Department "${dept.name}" deleted.`);
}

async function deleteClass() {
  head('🗑️  DELETE CLASS');
  const dept = await pickDepartment('Filter by Department (optional, 0 = all)');
  const cls = await pickClass(dept ? dept._id : null, 'Select Class to delete');
  if (!cls) return;
  const studentCount = await M.Student.countDocuments({ classId: cls._id });
  const sure = await confirmPhrase('DELETE', `Class "${cls.name}" has ${studentCount} student(s) linked — they will keep their record but lose the class link.`);
  if (!sure) { info('Cancelled.'); return; }
  await M.Class.findByIdAndDelete(cls._id);
  await logSetup('Class Deleted (CLI)', cls.name, 'warning');
  ok(`Class "${cls.name}" deleted.`);
}

async function deleteAllOfRole() {
  head('🗑️  DELETE ALL OF A ROLE');
  console.log(`  ${C.dim}1) All Teachers   2) All Admins (DANGEROUS)   3) All Students   0) Cancel${C.reset}`);
  const choice = await ask('Choice', '0');
  const map = {
    '1': { model: M.Teacher, label: 'Teachers' },
    '2': { model: M.Admin,   label: 'Admins' },
    '3': { model: M.Student, label: 'Students' },
  };
  if (!map[choice]) return;
  const { model, label } = map[choice];
  const count = await model.countDocuments();
  if (!count) { info(`No ${label} found.`); return; }

  if (choice === '2') {
    const remaining = await M.Admin.countDocuments();
    warn(`There are currently ${remaining} admin(s). Deleting ALL admins may lock you out of the system.`);
  }

  const sure = await confirmPhrase(`DELETE ALL ${label.toUpperCase()}`, `This will permanently delete ${count} ${label} record(s) and their login accounts.`);
  if (!sure) { info('Cancelled.'); return; }

  const docs = await model.find().select('username').lean();
  await model.deleteMany({});
  await M.User.deleteMany({ username: { $in: docs.map(d => d.username) } });
  if (label === 'Teachers') await M.Assignment.deleteMany({});
  await logSetup(`All ${label} Deleted (CLI)`, `${count} record(s) removed`, 'warning');
  ok(`All ${label} (${count}) deleted.`);
}

async function deleteEntireDatabase() {
  head('💥  DELETE ENTIRE DATABASE');
  warn(`This drops every collection inside database "${COLLECTION}". This is IRREVERSIBLE.`);
  const sure1 = await confirmPhrase('DROP DATABASE', 'First confirmation.');
  if (!sure1) { info('Cancelled.'); return; }
  const sure2 = await askYN(`${C.red}Are you absolutely sure? This cannot be undone.${C.reset}`, false);
  if (!sure2) { info('Cancelled.'); return; }

  await mongoose.connection.dropDatabase();
  ok(`Database "${COLLECTION}" has been dropped completely.`);
  console.log(`${C.yellow}  The connection will be re-established empty on next server start (collections recreate on first write).${C.reset}`);
}

async function deletionMenu() {
  while (true) {
    head('🗑️  DELETION');
    console.log(`  ${C.dim}1) Delete Single User (Admin/Teacher/Student)`);
    console.log(`  2) Delete Department`);
    console.log(`  3) Delete Class`);
    console.log(`  4) Delete ALL of a Role (Teachers/Admins/Students)`);
    console.log(`  5) ${C.red}Delete ENTIRE Database${C.dim}`);
    console.log(`  0) Back to Main Menu${C.reset}\n`);
    const choice = await ask('Choice', '0');
    if (choice === '1') await deleteSingleUser();
    else if (choice === '2') await deleteDepartment();
    else if (choice === '3') await deleteClass();
    else if (choice === '4') await deleteAllOfRole();
    else if (choice === '5') await deleteEntireDatabase();
    else if (choice === '0') return;
    else warn('Invalid choice.');
  }
}

// ══════════════════════════════════════════════════════════════════════
//  MANAGE COLLECTIONS — list all collections with numbers,
//  pick a number to drop that collection, or 0 to drop the whole DB
// ══════════════════════════════════════════════════════════════════════

async function manageCollectionsMenu() {
  while (true) {
    head('🗄️  MONGODB COLLECTIONS');
    const db = mongoose.connection.db;
    const collList = (await db.listCollections().toArray()).sort((a, b) => a.name.localeCompare(b.name));
    if (!collList.length) { info('No collections found — database is empty.'); return; }

    const counts = await Promise.all(collList.map(c => db.collection(c.name).countDocuments()));
    console.log(`  Database: ${C.bold}${COLLECTION}${C.reset}\n`);
    collList.forEach((c, i) => {
      console.log(`  ${C.dim}${String(i + 1).padStart(2, ' ')})${C.reset}  ${c.name.padEnd(28)} ${C.dim}${counts[i]} doc(s)${C.reset}`);
    });
    console.log(`\n  ${C.red}99) DROP ENTIRE DATABASE${C.reset}`);
    console.log(`  ${C.dim} 0) Back to Main Menu${C.reset}\n`);

    const choice = await ask('Enter a number to DROP that collection (or 0 / 99)', '0');
    const idx = parseInt(choice, 10);

    if (choice === '0' || idx === 0) return;

    if (idx === 99) {
      await deleteEntireDatabase();
      continue;
    }

    if (!idx || idx < 1 || idx > collList.length) { warn('Invalid number.'); continue; }
    const target = collList[idx - 1].name;
    const sure = await confirmPhrase(target, `This will permanently DROP the collection "${target}" (${counts[idx - 1]} documents) from the database.`);
    if (!sure) { info('Cancelled.'); continue; }

    try {
      await db.collection(target).drop();
      await logSetup('Collection Dropped (CLI)', target, 'warning');
      ok(`Collection "${target}" dropped.`);
    } catch (e) {
      err(`Failed to drop "${target}": ${e.message}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════════════

async function startServer() {
  head('🚀  STARTING SERVER');
  info('Launching server.js — this CLI will hand off to it now.');
  try { if (rl) rl.close(); } catch {}
  try { await mongoose.disconnect(); } catch {}
  const { spawn } = require('child_process');
  const child = spawn('node', ['server.js'], { stdio: 'inherit', shell: true });
  child.on('error', (e) => { console.log(`${C.red}  ❌  Failed to start: ${e.message}${C.reset}`); process.exit(1); });
  child.on('close', (code) => process.exit(code ?? 0));
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN MENU
// ══════════════════════════════════════════════════════════════════════

async function mainMenu() {
  while (true) {
    console.log(`\n${C.bold}${C.magenta}
  ╔════════════════════════════════════════════════════════╗
  ║          MongoDB — DB Control Console  (setup.js)      ║
  ╚════════════════════════════════════════════════════════╝
${C.reset}`);
    console.log(`  ${C.dim}1) Addition           → Normal (manual) or Demo Data (auto-seed)`);
    console.log(`  2) Deletion           → Delete User / Dept / Class / All / Entire DB`);
    console.log(`  3) Manage Collections → list & drop any collection`);
    console.log(`  4) Start Server              → launches server.js`);
    console.log(`  0) Exit${C.reset}\n`);

    const choice = await ask('Choice', '0');
    if (choice === '1') await additionMenu();
    else if (choice === '2') await deletionMenu();
    else if (choice === '3') await manageCollectionsMenu();
    else if (choice === '4') { await startServer(); return; }
    else if (choice === '0') { ok('Goodbye.'); await cleanExit(0); return; }
    else warn('Invalid choice.');
  }
}

// ══════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.clear();
  initRL();
  await getDBName();
  info(`Connecting to MongoDB → ${COLLECTION} …`);
  try {
    await mongoose.connect(cfg.MONGO_URI, { dbName: COLLECTION });
    ok(`MongoDB connected → ${COLLECTION}`);
    var t = new Date();
    await logSetup('Accessed Datebase', `${t}`);

  } catch (e) {
    err(`MongoDB error: ${e.message}`);
    process.exit(1);
  }

  await mainMenu();
}

main().catch(async (e) => {
  err(`Unexpected error: ${e.message}`);
  console.error(e);
  await cleanExit(1);
});