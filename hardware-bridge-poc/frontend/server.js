// Tiny HTTPS static server for the demo page.
// Why HTTPS: the whole point of the PoC is an HTTPS origin calling an HTTP loopback
// API. To exercise that locally without deploying, this serves index.html over HTTPS
// with a self-signed cert. Bind to 0.0.0.0 so you can load it via either:
//   - https://localhost:4782   (loopback origin → no LNA prompt; tests mixed-content + CORS only)
//   - https://<your-LAN-IP>:4782 (local origin → triggers the Chrome 142+ LNA prompt)
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const selfsigned = require('selfsigned');

const PORT = Number(process.env.PORT) || 4782;
const HOST = process.env.HOST || '0.0.0.0';

const pems = selfsigned.generate(null, {
  keySize: 2048,
  days: 365,
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' }, // DNS
        { type: 7, ip: '127.0.0.1' },    // IP
      ],
    },
  ],
});

const dir = __dirname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

const server = https.createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  const file = path.resolve(dir, '.' + url);
  if (!file.startsWith(dir)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  const ips = [];
  for (const name of Object.keys(os.networkInterfaces())) {
    for (const n of os.networkInterfaces()[name]) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    }
  }
  console.log('Hardware Bridge demo frontend (HTTPS) running.\n');
  console.log('  loopback origin (no LNA prompt expected):');
  console.log('    https://localhost:' + PORT + '\n');
  console.log('  LAN origin (Chrome 142+ LNA prompt expected):');
  console.log('    https://' + (ips[0] || '<your-LAN-IP>') + ':' + PORT + '\n');
  console.log('Self-signed cert: click "Advanced → Proceed" past the browser warning.');
});