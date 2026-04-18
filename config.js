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

  // ── Auth ─────────────────────────────────────────────
  JWT_SECRET:        process.env.JWT_SECRET        || 'eams_jwt_secret_change_in_production',
  JWT_EXPIRES_IN:    process.env.JWT_EXPIRES_IN    || '8h',
  BCRYPT_ROUNDS:     parseInt(process.env.BCRYPT_ROUNDS || '10'),

  // ── CORS ─────────────────────────────────────────────
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5500',

  // ── HMAC Key for attendance data signing ─────────────
  HMAC_SECRET: process.env.HMAC_SECRET || 'eams_hmac_attendance_secret_change_in_prod',

  // ── Token System Configuration ───────────────────────
  TOKEN_SCHEMA: {
    enabled: false,  // master toggle (also stored in Settings DB for runtime control)
    initialTokens: { sem1: 60, sem2: 50 },
    maxTokens: 60,
    minTokens: 0,
    costs: {
      overallColor:   8,    // View overall attendance as color only
      overallPercent: 15,   // View overall attendance as percentage
      theory:         15,   // View theory subject-wise (color only)
      lab:            10,   // View lab subject-wise (color only)
    },
    cooldowns: {  // in days
      overallColor:   20,
      overallPercent: 35,
      theory:         30,
      lab:            20,
    },
    // Which features each view blocks during its cooldown
    blocks: {
      overallColor:   ['overallColor'],
      overallPercent: ['overallColor', 'overallPercent', 'theory', 'lab'],
      theory:         ['theory'],
      lab:            ['lab'],
    },
    bonuses: {
      attendance95: { tokens: 10, cooldownDays: 25 },   // ≥ 95% after overall view
      attendance85: { tokens: 5,  cooldownDays: 25 },   // ≥ 85% after overall view
      noLeave2w:    { tokens: 5,  cooldownDays: 15 },   // No leave for 2 weeks
      noLeave1m:    { tokens: 10, cooldownDays: 30 },   // No leave for 1 month
    },
    penalties: {
      applyLeave:       { tokens: 5,  blockOverallDays: 15 },   // Apply for leave
      unauthorizedLeave:{ tokens: 10, blockAllDays: 30 },       // Absent without leave request
    },
    freeCheck: {
      threshold: 75,       // Below this % = eligible for free check
      cooldownDays: 20,    // Free check available every 20 days
    },
  },
};

