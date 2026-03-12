# Browser Service

Headless Playwright browser behind OpenVPN for cookie-authenticated fetches from the TEE.

## Why

YouTube/Google tie auth cookies to the IP where the session was created. Raw `fetch()` from the TEE's datacenter IP returns `logged_in: 0`. A real browser with injected cookies through a VPN works.

## Architecture

```
Custom capability code
  → fetch('http://browser:3000/browse', {...})
    → Playwright (headless Chromium)
      → socks5://openvpn-socks5:1080
        → ProtonVPN → youtube.com
```

## API

**POST /browse**
```json
{
  "url": "https://www.youtube.com/feed/history",
  "cookies": [{"name": "SID", "value": "...", "domain": ".youtube.com", "path": "/", "secure": true, "httpOnly": false, "sameSite": "Lax"}],
  "userAgent": "Mozilla/5.0 ...",
  "script": "document.title"
}
```

Returns `{ status, url, data }` (with script) or `{ status, url, body }` (without).

Each request gets a fresh browser context — no state leaks between requests.

**GET /health** — `{ ok: true, proxy: "socks5://..." }`

## Upgrade Path: Envoy/Neko (persistent browser)

Current: stateless Playwright — inject cookies per request, destroy context after.

Next: replace `browser` service with Envoy's Neko container for a persistent "teleport browser":

1. Replace `browser` Dockerfile with Envoy's `neko/Dockerfile` (Chromium + extension + ws-bridge)
2. Mount a profile volume for persistent logins (`/home/neko/.config/chromium`)
3. Expose WebRTC port for visual access (debugging, manual auth)
4. Extension bridge at `:3000` replaces our `/browse` endpoint
5. Custom capabilities call `http://browser:3000/api/bridge` instead of `/browse`
6. Keep `openvpn-socks5` sidecar — Chromium launched with `--proxy-server=socks5://openvpn-socks5:1080`

Key files from envoy to crib:
- `neko/Dockerfile` — Neko + extension + bridge
- `neko/ws-bridge.js` — HTTP command bridge (extension polls, clients submit)
- `neko/chromium.conf` — supervisord config with proxy flags
- `extension/` — Chrome extension for undetectable automation
- `src/controller/bridge.ts` — WebSocket client for scripting

The switch is: stateless (inject cookies) → persistent (stay logged in). Same VPN sidecar, same compose slot.
