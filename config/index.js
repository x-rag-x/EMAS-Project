// ═══════════════════════════════════════════════════════
//  EAMS — Database & Server Configuration
//  Store secrets in .env — never commit .env to git
// ═══════════════════════════════════════════════════════

require('dotenv').config();

module.exports = {
  // ── MongoDB ──────────────────────────────────────────
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/eams_db',
  DB_NAME:   process.env.DB_NAME   || 'eams_db',

  // ── Server ───────────────────────────────────────────
  PORT:      process.env.PORT      || 3000,
  NODE_ENV:  process.env.NODE_ENV  || 'development',

  // ── Passwords ────────────────────────────────────────
  STUDENT_PASSWORD:    process.env.studentPassword    || 'student123',
  TEACHER_PASSWORD:    process.env.teacherPassword    || 'teacher123',
  ADMIN_PASSWORD:      process.env.adminPassword      || 'admin123',
  DELETE_DATA_PASSWORD: process.env.deleteDataPassword || 'EMAS-DEL-6969',
  EXPORT_DATA_PASSWORD: process.env.exportDataPassword || 'EMAS-EXPORT-7898',

  // ── Auth ─────────────────────────────────────────────
  JWT_SECRET:        process.env.JWT_SECRET,
  JWT_EXPIRES_IN:    process.env.JWT_EXPIRES_IN,
  BCRYPT_ROUNDS:     parseInt(process.env.BCRYPT_ROUNDS),

  // ── CORS ─────────────────────────────────────────────
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5500',
};
