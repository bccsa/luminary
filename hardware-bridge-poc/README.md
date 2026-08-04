# Hardware Bridge PoC

Proof that an **HTTPS-hosted site** (e.g. the Luminary app) can call an **HTTP API on the visitor's own machine** at `http://localhost:PORT`, and use it to interact with local hardware — through all three obstacles:

1. **Mixed content** — solved automatically because loopback (`localhost` / `127.0.0.1`) is a *secure origin* per the W3C spec. Does **not** extend to LAN IPs.
2. **CORS** — the local server returns `Access-Control-Allow-Origin` for the calling origin and handles `OPTIONS` preflight.
3. **Local Network Access (Chrome 142+)** — Chromium shows a mandatory permission prompt for public→loopback requests; checkable via `navigator.permissions.query({ name: "local-network-access" })`. Firefox/Safari don't implement it.

The "hardware" is intentionally minimal (no native deps): `GET /api/system` returns real local machine info (CPU, memory, uptime) and `GET/POST /api/device` is an in-memory virtual device you can read and write — enough to prove **bidirectional browser → local-hardware interaction** through the bridge.

## Layout

```
hardware-bridge-poc/
  electron-service/   # Electron app: loopback HTTP API (127.0.0.1:4781) + status window
  frontend/           # Standalone HTTPS demo page (self-signed, port 4782)
  docker/             # Dockerfile: builds Linux binary, hosts it for download
```

## 1. Run the local service (Electron)

```sh
cd electron-service
npm install
npm start
```

A small window opens showing the API URL (`http://127.0.0.1:4781`) and endpoints. The HTTP server is bound to **loopback only**, so it is reachable from the browser but not from the LAN/Internet.

By default CORS allows any origin (`*`) for easy testing. For anything real, restrict it:

```sh
ALLOWED_ORIGINS=https://your-luminary-domain.com npm start
```

You can sanity-check the API directly (bypasses CORS/mixed-content — this is just a server check):

```sh
curl http://localhost:4781/api/ping
curl http://localhost:4781/api/system
```

## 2. Run the HTTPS demo page

```sh
cd frontend
npm install
npm start
```

It prints two URLs:

- `https://localhost:4782` — **loopback origin**: tests mixed-content + CORS only. No LNA prompt (loopback→loopback is same address space).
- `https://<your-LAN-IP>:4782` — **local origin**: triggers the **Chrome 142+ LNA permission prompt** on the first call to `http://localhost:4781`. This is the faithful reproduction of a public site calling localhost.

Open the **LAN-IP URL** in Chrome to see all three layers. The self-signed cert will warn — click *Advanced → Proceed*. Click **Ping**, **Get system**, **Toggle device**. On the first call Chrome shows the "This site wants to access devices on your local network" prompt; approve it. The page shows the LNA permission pill (`prompt`/`granted`/`denied`/`unsupported`), the browser, and categorises any failure (mixed content vs CORS vs LNA denied vs service-down).

> For a true **public** origin (most faithful), deploy `frontend/index.html` to GitHub Pages / Vercel / Netlify and update the default target URL in the page. Public→loopback always triggers the LNA prompt in Chrome 142+.

### Cross-browser expectations

| Browser | Mixed content (loopback) | LNA prompt |
|---|---|---|
| Chrome 142+ / Edge / Brave | allowed (secure origin) | **yes** — permission prompt |
| Firefox | allowed (since FF84) | no |
| Safari | allowed | no |

## 3. Package the binary & host it via Docker

Build a Linux binary and serve it for download:

```sh
docker build -f docker/Dockerfile -t hardware-bridge ../  # from repo root of the poc
# or, from this folder:
docker build -f docker/Dockerfile -t hardware-bridge .
docker run -p 8080:8080 hardware-bridge
```

Then browse `http://localhost:8080` and download `HardwareBridge-1.0.0.tar.gz`.

**macOS / Windows builds:** `electron-builder` cannot produce macOS targets on Linux (and vice versa). To ship a mac `.dmg` or Windows `.exe`, run `npm run dist` on that OS (or add a CI matrix). The Docker path is for the Linux artifact + hosting.

## 4. Integrate into Luminary

The Luminary app/cms, served over HTTPS, can call the bridge directly from browser JS. Example composable:

```ts
// shared/src/composables/useHardwareBridge.ts (PoC — adapt to luminary conventions)
const BRIDGE = 'http://localhost:4781'

export async function checkLnaAccess(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  try {
    const s = await navigator.permissions.query({ name: 'local-network-access' as PermissionName })
    return s.state as 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unsupported' // Firefox/Safari
  }
}

export async function bridgeFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BRIDGE}${path}`, init)
  if (!res.ok) throw new Error(`bridge ${path} -> ${res.status}`)
  return res.json()
}

// Usage from a Vue component:
// const lna = await checkLnaAccess()        // show a UI hint if 'prompt'/'denied'
// const sys = await bridgeFetch('/api/system')
// await bridgeFetch('/api/device', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ on: true }) })
```

On the Electron side, start the service with Luminary's origin allow-listed:

```sh
ALLOWED_ORIGINS=https://your-luminary-domain.com npm start
```

If the page calling the bridge lives in an **iframe**, the parent must delegate the permission:

```html
<iframe src="https://app.luminary.example/" allow="local-network-access"></iframe>
```

## Security notes

- The bridge binds to **loopback only**. Don't bind `0.0.0.0` in production.
- Use an explicit `ALLOWED_ORIGINS` allow-list, never `*`, for anything handling sensitive hardware.
- `POST /api/device` is an open in-memory setter for the PoC. A real hardware bridge must authenticate/authorize commands (e.g. a one-time pairing token shown in the Electron status window) before driving real hardware.
- For enterprise/internal Chrome deployments, origins can be pre-allowed via the `LocalNetworkAccessAllowedForUrls` policy — don't rely on this for a general audience.

## References

- [MDN — Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)
- [MDN — Local network access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access)
- [Chrome for Developers — LNA prompt](https://developer.chrome.com/blog/local-network-access)
- [WICG LNA explainer](https://github.com/WICG/local-network-access/blob/main/explainer.md)
- [Firefox loopback mixed-content history](https://bugzilla.mozilla.org/show_bug.cgi?id=903966)