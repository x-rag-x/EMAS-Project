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
  JWT_EXPIRES_IN:    process.env.JWT_EXPIRES_IN    || '1h',
  BCRYPT_ROUNDS:     parseInt(process.env.BCRYPT_ROUNDS || '10'),

  // ── CORS ─────────────────────────────────────────────
  CORS_ORIGIN: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
};
