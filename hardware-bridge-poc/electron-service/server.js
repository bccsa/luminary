// Loopback HTTP API the Electron app exposes to HTTPS-hosted pages.
// Solves the three obstacles from the PoC brief:
//  1. Mixed content  -> bound to 127.0.0.1 (loopback = secure origin per W3C spec).
//  2. CORS           -> echoes the calling origin when allow-listed (or '*' in dev).
//  3. Local Network  -> answers the PNA preflight header for older Chromium; the
//     Access (Chrome 142+) model uses a permission prompt instead, which we surface
//     client-side via navigator.permissions.query({name:'local-network-access'}).
const express = require('express');
const os = require('os');

const PORT = Number(process.env.PORT) || 4781;
// Comma-separated allow-list of HTTPS origins that may call us, or '*' for dev.
// Why: a real luminary deployment should list its exact origin(s) instead of '*'
// so a malicious site can't drive the visitor's local hardware.
const ALLOWED = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowAll = ALLOWED.includes('*');

const app = express();
app.use(express.json());

// CORS + PNA headers on every response. Preflight (OPTIONS) handled below.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowAll || ALLOWED.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (allowAll) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // Older Chromium Private Network Access sent this on the preflight and required
  // a 'true' back. Chrome 142+ LNA replaced this with a permission prompt, but
  // answering it is harmless and keeps the PoC working across versions.
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.options('/api/*', (req, res) => res.status(204).end());

// In-memory "device" so we can prove *bidirectional* interaction (browser writes
// state to local hardware) through the bridge, not just reads.
let device = { on: false, label: 'LED-1', brightness: 0 };

app.get('/api/ping', (req, res) =>
  res.json({ status: 'ok', service: 'hardware-bridge', version: '1.0.0' })
);

app.get('/api/system', (req, res) => {
  const cpus = os.cpus();
  res.json({
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    cpuCount: cpus.length,
    cpuModel: cpus[0] ? cpus[0].model : 'unknown',
    totalMemMB: Math.round(os.totalmem() / 1048576),
    freeMemMB: Math.round(os.freemem() / 1048576),
    uptimeSec: Math.round(os.uptime()),
    node: process.version,
  });
});

app.get('/api/device', (req, res) => res.json(device));

app.post('/api/device', (req, res) => {
  // Merge so the page can toggle one field at a time.
  device = { ...device, ...req.body };
  res.json(device);
});

function start() {
  // Bind loopback only: required for the mixed-content secure-origin exception,
  // and stops the bridge from being reachable from the LAN/Internet.
  return app.listen(PORT, '127.0.0.1', () => {
    console.log(`hardware-bridge API on http://127.0.0.1:${PORT}`);
    console.log(`allowed origins: ${ALLOWED.join(', ') || '(none)'}`);
  });
}

module.exports = { app, start, PORT };