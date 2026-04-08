// ═══════════════════════════════════════════════════════
//  EAMS — start.js  |  Interactive Default-User Setup
//  Run: node start.js
//  • Connects to MongoDB (same config as server.js)
//  • Prompts you to create Admin / Teacher / Student
//  • Skips any role that already exists in the DB
//  • Press ENTER to accept the [default] shown in brackets
// ═══════════════════════════════════════════════════════

'use strict';

// ── DNS (mirrors server.js) ───────────────────────────
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const readline = require('readline');
const cfg      = require('./config');
const M        = require('./models');

// ── In-memory plain-text password store (this session only) ──
const plainPasswords = {};

// ── ANSI colours ──────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  white:   '\x1b[97m',
};

const ok   = (m) => console.log(`${C.green}  ✅  ${m}${C.reset}`);
const warn = (m) => console.log(`${C.yellow}  ⚠️   ${m}${C.reset}`);
const info = (m) => console.log(`${C.cyan}  ℹ️   ${m}${C.reset}`);
const err  = (m) => console.log(`${C.red}  ❌  ${m}${C.reset}`);
const head = (m) => console.log(`\n${C.bold}${C.blue}${'─'.repeat(54)}\n  ${m}\n${'─'.repeat(54)}${C.reset}`);

// ── Single readline interface (created once, reused everywhere) ──
// Raw mode is NEVER used — it conflicts with readline and causes hangs.
// Passwords are shown in plain text during entry (visible in terminal).
let rl;

function initRL() {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Prevent readline from swallowing Ctrl+C
  rl.on('SIGINT', () => { console.log('\n'); process.exit(0); });
}

/** Prompt for any value. Returns trimmed input or defaultVal if blank. */
function ask(question, defaultVal = '') {
  const hint = defaultVal ? ` ${C.dim}[${defaultVal}]${C.reset}` : '';
  return new Promise(resolve => {
    rl.question(`  ${C.white}${question}${hint}${C.cyan} › ${C.reset}`, answer => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

/** Prompt for a password — same as ask(), password shown while typing.
 *  Using raw mode here caused stdin to hang between prompts, so we keep
 *  it simple and consistent with the rest of the prompts. */
function askPassword(question, defaultVal = '') {
  return ask(question + ' (password)', defaultVal);
}

/** Yes / No prompt. Returns boolean. */
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

// ── Seed default Settings ─────────────────────────────
async function seedSettings() {
  const defaults = [
    { key: 'maintenance',  value: { active: false, message: 'System under maintenance.', affectedRoles: ['teacher','student'], endTime: null, startedAt: null } },
    { key: 'institution',  value: { name: 'Sri Shakthi Institute of Engineering and Technology', short: 'SSIET', address: 'Coimbatore, Tamil Nadu', email: '', phone: '' } },
    { key: 'academic',     value: { year: '2025-26', sem: 'I', minAttendance: 75, workingDays: 5 } },
    { key: 'security',     value: { maxLoginAttempts: 5, sessionTimeoutMins: 480, forcePwChange: true } },
    { key: 'special_delete_password', value: bcrypt.hashSync('987543210', 10) },
    { key: 'college_ips',  value: ['127.0.0.1', '::1', '192.', '10.'] },
  ];
  for (const d of defaults) {
    if (!await M.Settings.findOne({ key: d.key })) await M.Settings.create(d);
  }
}

// ── DB log helper ─────────────────────────────────────
async function logSetup(action, details) {
  try {
    await M.Log.create({ userId: null, userName: 'SETUP', role: 'system', action, details, category: 'system', severity: 'info', ip: '127.0.0.1', time: new Date() });
  } catch { /* non-fatal */ }
}

// ══════════════════════════════════════════════════════
//  USER CREATION FLOWS
// ══════════════════════════════════════════════════════

async function setupAdmin() {
  head('👤  ADMIN SETUP');
  const exists = await M.User.findOne({ role: 'admin' });

  if (exists) {
    warn(`Admin already exists → ${C.bold}${exists.username}${C.reset}`);
    if (await askYN('Reset admin password?', false)) {
      const pw   = await askPassword('New password', 'admin123');
      const hash = await bcrypt.hash(pw, cfg.BCRYPT_ROUNDS);
      await M.User.findByIdAndUpdate(exists._id, { password: hash, failedLogins: 0, lockedUntil: null, active: true });
      plainPasswords[exists.username] = pw;
      await logSetup('Admin Password Reset', `Username: ${exists.username}`);
      ok(`Admin password updated → ${exists.username}`);
    }
    return;
  }

  info('No admin found — creating one. Press ENTER to accept [defaults].');
  const name     = await ask('Full name',  'Administrator');
  const username = await ask('Username',   'admin');
  const pw       = await askPassword('Password', 'admin123');
  const email    = await ask('Email',      '');

  const hash = await bcrypt.hash(pw, cfg.BCRYPT_ROUNDS);
  const user = await M.User.create({ name, username: username.toLowerCase(), password: hash, role: 'admin', email, mustChangePassword: true, active: true });
  plainPasswords[user.username] = pw;
  await logSetup('Admin Created', `Username: ${user.username} | via start.js`);
  ok(`Admin "${user.username}" created!`);
}

async function setupTeacher() {
  head('🎓  TEACHER SETUP');
  const exists = await M.User.findOne({ role: 'teacher' });

  if (exists) {
    warn(`Teacher already exists → ${C.bold}${exists.username}${C.reset}`);
    if (await askYN('Reset teacher password?', false)) {
      const pw   = await askPassword('New password', 'teacher123');
      const hash = await bcrypt.hash(pw, cfg.BCRYPT_ROUNDS);
      await M.User.findByIdAndUpdate(exists._id, { password: hash, failedLogins: 0, lockedUntil: null, active: true });
      plainPasswords[exists.username] = pw;
      await logSetup('Teacher Password Reset', `Username: ${exists.username}`);
      ok(`Teacher password updated → ${exists.username}`);
    }
    return;
  }

  info('No teacher found — creating one. Press ENTER to accept [defaults].');
  const name     = await ask('Full name',   'Default Teacher');
  const username = await ask('Username',    'teacher');
  const pw       = await askPassword('Password', 'teacher123');
  const empId    = await ask('Employee ID', 'EMP001');
  const dept     = await ask('Department',  'Computer Science Engineering');
  const desig    = await ask('Designation', 'Assistant Professor');
  const email    = await ask('Email',       '');

  const hash = await bcrypt.hash(pw, cfg.BCRYPT_ROUNDS);
  const user = await M.User.create({ name, username: username.toLowerCase(), password: hash, role: 'teacher', empId, dept, desig, email, mustChangePassword: true, active: true });
  plainPasswords[user.username] = pw;
  await logSetup('Teacher Created', `Username: ${user.username} | via start.js`);
  ok(`Teacher "${user.username}" created!`);
}

async function setupStudent() {
  head('🎒  STUDENT SETUP');
  const exists = await M.User.findOne({ role: 'student' });

  if (exists) {
    warn(`Student already exists → ${C.bold}${exists.username}${C.reset}`);
    if (await askYN('Reset student password?', false)) {
      const pw   = await askPassword('New password', 'student123');
      const hash = await bcrypt.hash(pw, cfg.BCRYPT_ROUNDS);
      await M.User.findByIdAndUpdate(exists._id, { password: hash, failedLogins: 0, lockedUntil: null, active: true });
      plainPasswords[exists.username] = pw;
      await logSetup('Student Password Reset', `Username: ${exists.username}`);
      ok(`Student password updated → ${exists.username}`);
    }
    return;
  }

  info('No student found — creating one. Press ENTER to accept [defaults].');
  const name     = await ask('Full name',    'Test Student');
  const username = await ask('Username',     'student');
  const pw       = await askPassword('Password', 'student123');
  const regNo    = await ask('Register No',  'REG001');
  const deptName = await ask('Department',   'Computer Science Engineering');
  const year     = await ask('Year',         'I Year');
  const section  = await ask('Section',      'A');
  const email    = await ask('Email',        '');

  const hash = await bcrypt.hash(pw, cfg.BCRYPT_ROUNDS);
  const user = await M.User.create({ name, username: username.toLowerCase(), password: hash, role: 'student', regNo, deptName, year, section, email, mustChangePassword: true, active: true });
  plainPasswords[user.username] = pw;

  if (!await M.Student.findOne({ regNo })) {
    await M.Student.create({ name, regNo, deptName, year, section, email, userId: user._id, academicYear: '2025-26' });
  }

  await logSetup('Student Created', `Username: ${user.username} | RegNo: ${regNo} | via start.js`);
  ok(`Student "${user.username}" created!`);
}

// ── Add more users loop ───────────────────────────────
async function addMoreUsers() {
  while (true) {
    head('➕  ADD MORE USERS');
    console.log(`  ${C.dim}1) Add another Admin`);
    console.log(`  2) Add another Teacher`);
    console.log(`  3) Add another Student`);
    console.log(`  4) Done${C.reset}\n`);
    const choice = await ask('Choice', '4');

    if (choice === '1') {
      const name = await ask('Full name', '');
      if (!name) { warn('Name cannot be empty.'); continue; }
      const username = await ask('Username', '');
      if (!username) { warn('Username cannot be empty.'); continue; }
      if (await M.User.findOne({ username: username.toLowerCase() })) { warn(`Username "${username}" is already taken.`); continue; }
      const pw    = await askPassword('Password', 'admin123');
      const email = await ask('Email', '');
      const hash  = await bcrypt.hash(pw, cfg.BCRYPT_ROUNDS);
      const user  = await M.User.create({ name, username: username.toLowerCase(), password: hash, role: 'admin', email, mustChangePassword: true, active: true });
      plainPasswords[user.username] = pw;
      await logSetup('Extra Admin Created', `Username: ${user.username} | via start.js`);
      ok(`Admin "${user.username}" added!`);

    } else if (choice === '2') {
      const name = await ask('Full name', '');
      if (!name) { warn('Name cannot be empty.'); continue; }
      const username = await ask('Username', '');
      if (!username) { warn('Username cannot be empty.'); continue; }
      if (await M.User.findOne({ username: username.toLowerCase() })) { warn(`Username "${username}" is already taken.`); continue; }
      const pw    = await askPassword('Password', 'teacher123');
      const empId = await ask('Employee ID',  '');
      const dept  = await ask('Department',   'Computer Science Engineering');
      const desig = await ask('Designation',  'Assistant Professor');
      const email = await ask('Email',        '');
      const hash  = await bcrypt.hash(pw, cfg.BCRYPT_ROUNDS);
      const user  = await M.User.create({ name, username: username.toLowerCase(), password: hash, role: 'teacher', empId, dept, desig, email, mustChangePassword: true, active: true });
      plainPasswords[user.username] = pw;
      await logSetup('Extra Teacher Created', `Username: ${user.username} | via start.js`);
      ok(`Teacher "${user.username}" added!`);

    } else if (choice === '3') {
      const name = await ask('Full name', '');
      if (!name) { warn('Name cannot be empty.'); continue; }
      const username = await ask('Username', '');
      if (!username) { warn('Username cannot be empty.'); continue; }
      if (await M.User.findOne({ username: username.toLowerCase() })) { warn(`Username "${username}" is already taken.`); continue; }
      const pw       = await askPassword('Password', 'student123');
      const regNo    = await ask('Register No',  '');
      const deptName = await ask('Department',   'Computer Science Engineering');
      const year     = await ask('Year',         'I Year');
      const section  = await ask('Section',      'A');
      const email    = await ask('Email',        '');
      const hash     = await bcrypt.hash(pw, cfg.BCRYPT_ROUNDS);
      const user     = await M.User.create({ name, username: username.toLowerCase(), password: hash, role: 'student', regNo, deptName, year, section, email, mustChangePassword: true, active: true });
      plainPasswords[user.username] = pw;
      if (regNo && !await M.Student.findOne({ regNo })) {
        await M.Student.create({ name, regNo, deptName, year, section, email, userId: user._id, academicYear: '2025-26' });
      }
      await logSetup('Extra Student Created', `Username: ${user.username} | RegNo: ${regNo} | via start.js`);
      ok(`Student "${user.username}" added!`);

    } else {
      break;
    }
  }
}

// ── Summary table ─────────────────────────────────────
async function printSummary(showPasswords = false) {
  head('📋  CURRENT USERS IN DATABASE');
  const users = await M.User.find({}, 'name username role empId regNo dept desig deptName year section email active').lean();
  if (!users.length) { info('No users found.'); return; }

  const col = (s, w) => String(s ?? '').padEnd(w);

  for (const u of users) {
    const roleColor = u.role === 'admin' ? C.red : u.role === 'teacher' ? C.cyan : C.green;
    const pwLine    = showPasswords
      ? `\n      ${C.dim}Password :${C.reset} ${C.yellow}${plainPasswords[u.username] || `${C.dim}(unchanged)${C.reset}`}${C.reset}`
      : '';

    console.log(
      `\n  ${roleColor}${C.bold}[${u.role.toUpperCase()}]${C.reset}  ` +
      `${C.white}${C.bold}${u.name}${C.reset}  ${C.dim}(${u.username})${C.reset}  ` +
      `${u.active ? C.green + '● active' : C.red + '● inactive'}${C.reset}`
    );

    if (u.role === 'admin') {
      console.log(`      ${C.dim}Email    :${C.reset} ${u.email || '—'}`);
    } else if (u.role === 'teacher') {
      console.log(`      ${C.dim}Emp ID   :${C.reset} ${u.empId    || '—'}`);
      console.log(`      ${C.dim}Dept     :${C.reset} ${u.dept     || '—'}`);
      console.log(`      ${C.dim}Desig    :${C.reset} ${u.desig    || '—'}`);
      console.log(`      ${C.dim}Email    :${C.reset} ${u.email    || '—'}`);
    } else if (u.role === 'student') {
      console.log(`      ${C.dim}Reg No   :${C.reset} ${u.regNo    || '—'}`);
      console.log(`      ${C.dim}Dept     :${C.reset} ${u.deptName || '—'}`);
      console.log(`      ${C.dim}Year     :${C.reset} ${u.year     || '—'}`);
      console.log(`      ${C.dim}Section  :${C.reset} ${u.section  || '—'}`);
      console.log(`      ${C.dim}Email    :${C.reset} ${u.email    || '—'}`);
    }
    console.log(pwLine);
  }
  console.log('');
}

// ══════════════════════════════════════════════════════
//  CLEAR LOCAL STORAGE (MongoDB collections)
// ══════════════════════════════════════════════════════
async function clearStorage() {
  while (true) {
    head('🗑️   CLEAR LOCAL STORAGE');
    console.log(`  ${C.dim}Select what to clear from the database:\n`);
    console.log(`  1) Users only        ${C.red}(admins, teachers, students)${C.reset}`);
    console.log(`  2) Students only     ${C.red}(student records / enrolments)${C.reset}`);
    console.log(`  3) Assignments only  ${C.red}(attendance records)${C.reset}`);
    console.log(`  4) Logs only         ${C.red}(activity / system logs)${C.reset}`);
    console.log(`  5) ${C.bold}${C.red}FULL RESET${C.reset}${C.dim}       (wipe ALL collections)${C.reset}`);
    console.log(`  6) Back\n`);

    const choice = await ask('Choice', '6');

    if (choice === '1') {
      warn('This will DELETE all users (admin, teacher, student) from the database.');
      if (await askYN('Are you sure?', false)) {
        const r = await M.User.deleteMany({});
        Object.keys(plainPasswords).forEach(k => delete plainPasswords[k]);
        await logSetup('Users Cleared', `${r.deletedCount} user(s) deleted via start.js`);
        ok(`Cleared ${r.deletedCount} user(s) from Users collection.`);
      } else {
        info('Cancelled.');
      }

    } else if (choice === '2') {
      warn('This will DELETE all student enrolment records from the database.');
      if (await askYN('Are you sure?', false)) {
        const r = await M.Student.deleteMany({});
        await logSetup('Students Cleared', `${r.deletedCount} student record(s) deleted via start.js`);
        ok(`Cleared ${r.deletedCount} student record(s) from Students collection.`);
      } else {
        info('Cancelled.');
      }

    } else if (choice === '3') {
      warn('This will DELETE all attendance assignment records from the database.');
      if (await askYN('Are you sure?', false)) {
        const r = await M.Assignment.deleteMany({});
        await logSetup('Assignments Cleared', `${r.deletedCount} record(s) deleted via start.js`);
        ok(`Cleared ${r.deletedCount} assignment record(s) from Assignments collection.`);
      } else {
        info('Cancelled.');
      }

    } else if (choice === '4') {
      warn('This will DELETE all activity and system logs from the database.');
      if (await askYN('Are you sure?', false)) {
        const r = await M.Log.deleteMany({});
        ok(`Cleared ${r.deletedCount} log entry(ies) from Logs collection.`);
      } else {
        info('Cancelled.');
      }

    } else if (choice === '5') {
      warn(`${C.bold}FULL RESET: This will wipe Users, Students, Assignments, and Logs.`);
      warn('Settings will be preserved. This CANNOT be undone.');
      const confirm = await ask('Type  CONFIRM  to proceed (or press ENTER to cancel)', '');
      if (confirm === 'CONFIRM') {
        const [u, s, a, l] = await Promise.all([
          M.User.deleteMany({}),
          M.Student.deleteMany({}),
          M.Assignment.deleteMany({}),
          M.Log.deleteMany({}),
        ]);
        Object.keys(plainPasswords).forEach(k => delete plainPasswords[k]);
        await logSetup('Full Storage Reset', `Users:${u.deletedCount} Students:${s.deletedCount} Assignments:${a.deletedCount} Logs:${l.deletedCount} via start.js`);
        ok(`Full reset done → Users:${u.deletedCount}  Students:${s.deletedCount}  Assignments:${a.deletedCount}  Logs:${l.deletedCount}`);
      } else {
        info('Full reset cancelled — no data was deleted.');
      }

    } else {
      break;
    }
  }
}

// ══════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════
async function main() {
  console.clear();
  console.log(`\n${C.bold}${C.magenta}
  ╔═══════════════════════════════════════════════════╗
  ║       EAMS — Default User Setup  (start.js)       ║
  ╚═══════════════════════════════════════════════════╝
${C.reset}`);

  // ── Connect ───────────────────────────────────────
  info(`Connecting to MongoDB → ${cfg.DB_NAME} …`);
  try {
    await mongoose.connect(cfg.MONGO_URI, { dbName: cfg.DB_NAME });
    ok(`MongoDB connected → ${cfg.DB_NAME}`);
  } catch (e) {
    err(`MongoDB error: ${e.message}`);
    process.exit(1);
  }

  await seedSettings();
  info('Default settings ensured.');

  // ── Single rl for entire session ──────────────────
  initRL();

  await printSummary(false);

  head('🔧  SETUP OPTIONS');
  info('Walk through default user creation. ENTER = accept [default].\n');

  if (await askYN('Set up Admin user?',   true)) await setupAdmin();
  if (await askYN('Set up Teacher user?', true)) await setupTeacher();
  if (await askYN('Set up Student user?', true)) await setupStudent();

  if (await askYN('\nAdd more admins / teachers / students?', false)) await addMoreUsers();

  if (await askYN('\n🗑️  Clear local storage (wipe DB collections)?', false)) await clearStorage();

  // ── Final summary with passwords ──────────────────
  await printSummary(true);

  // ── Launch server? ─────────────────────────────────
  head('🚀  READY TO LAUNCH');
  const launch = await askYN('Start the EAMS server now? (node server.js)', true);
  rl.close();
  await mongoose.disconnect();

  if (launch) {
    console.log(`\n${C.bold}${C.green}  Launching server…${C.reset}\n`);
    const { spawn } = require('child_process');
    const child = spawn('node', ['server.js'], { stdio: 'inherit', shell: true });
    child.on('error', (e) => { err(`Failed to start: ${e.message}`); process.exit(1); });
    child.on('close', (code) => process.exit(code ?? 0));
  } else {
    console.log(`\n${C.cyan}  Run ${C.bold}node server.js${C.reset}${C.cyan} whenever you're ready.${C.reset}\n`);
    process.exit(0);
  }
}

main().catch(e => {
  err(`Unexpected error: ${e.message}`);
  console.error(e);
  process.exit(1);
});