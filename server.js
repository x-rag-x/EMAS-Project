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
const { startSessionMonitor } = require('./utils/sessionMonitor');

const app = express();
app.set('trust proxy', 1);
const upload = multer({ storage: multer.memoryStorage() });

// ── Middleware ────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({origin: cfg.CORS_ORIGIN,credentials: true}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

startSessionMonitor();
app.use('/api', require('./routes/index'));

// ── Start Server ──────────────────────────────────────
const PORT = process.env.PORT || cfg.PORT;
app.listen(PORT, () => {
  console.log(`   1/5: Environment set for: ${cfg.NODE_ENV}`);
  console.log(`   2/5: EAMS API running → http://localhost:${PORT}`);
  console.log(`> Connecting Database...`)
});