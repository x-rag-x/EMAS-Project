console.log("> Starting EAMS...");

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const cfg = require('./config');
require('./config/db');
require('./utils/serverState');

const app = express();
app.set('trust proxy', 1);
const upload = multer({ storage: multer.memoryStorage() });

// ── Middleware ────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcElem:  ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcAttr:  ["'unsafe-inline'"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:        ["'self'", "data:", "blob:"],
      connectSrc:    ["'self'", "http://localhost:*", "http://127.0.0.1:*", "ws:", "wss:"],
      upgradeInsecureRequests: null,
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({origin: cfg.CORS_ORIGIN,credentials: true}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', require('./routes/index'));

// ── Start Server ──────────────────────────────────────
const PORT = process.env.PORT || cfg.PORT;
app.listen(PORT, () => {
  console.log(`   1/5: Environment set for: ${cfg.NODE_ENV}`);
  console.log(`   2/5: EAMS API running → http://localhost:${PORT}`);
  console.log(`> Connecting Database...`)
});