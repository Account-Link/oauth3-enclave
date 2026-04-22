# Anatomy of a Persistent Demo

A case study of one permit (`yt-shorts-v3`) that stayed live and logged-in for weeks while 41 sibling permits on the same enclave went stale within days. This doc reverse-engineers why, and turns the answer into a recipe.

## The live demo

A static HTML page on GitHub Pages calls a custom capability on the enclave every five minutes:

```
https://account-link.github.io/oauth3-extension-page/query.html#p=yt-shorts-v3&t=<bearer>
```

The page asks the enclave a single question — "Is this user watching YouTube Shorts right now?" — and renders the answer alongside a live list of recent shorts with titles. No backend, no auth state on the page itself, no session to refresh. The full client is 108 lines of vanilla JS.

Under the hood, the capability hits YouTube's `/feed/history` via a headless Playwright browser running inside the TEE (see [browser/README.md](../browser/README.md)), authenticating with cookies the enclave holds as a secret. It diffs the shorts count against a per-permit KV store, returns `{watching, shortsCount, videosToday, newShorts, shorts[]}`, and leaves.

## Why it survives

Five decoupled ingredients. Drop any one and the demo dies in days rather than weeks.

### 1. The permit's capability code is immutable

The `/permit` endpoint ([proxy/src/server.ts:454](../proxy/src/server.ts)) stores the capability's JavaScript body as a row in SQLite. You cannot update code on an existing permit — you can expand capabilities, but the executor picks the first match, so the only way to change behavior is to create a new `permit_id`. That constraint turns out to be a feature: the thing agents call is pinned. Nothing downstream can drift it.

### 2. The bearer token outlives everything else

Permits created by the custom-plugin flow get an `expires_at` one year out ([proxy/src/database.ts](../proxy/src/database.ts), schema migration). The bearer is 64 hex characters of cryptographic randomness generated at approval time and returned once. `/invoke/:permit_id` authenticates by bearer only — no JWT, no refresh, no session state to rotate. The URL hash `#p=<permit>&t=<bearer>` is the entire credential.

### 3. Cookies refresh out-of-band — the real answer

This is the ingredient that distinguishes working demos from dead ones. A companion Chrome extension (source: `Account-Link/oauth3-extension-1`) maintains a live cookie-sync loop for every tracked domain:

- A `chrome.alarms` alarm named `cookie-sync` fires every 30 minutes.
- A `chrome.cookies.onChanged` listener fires whenever any cookie for a tracked domain mutates (debounced 500 ms).
- Both paths call `uploadCookies(domain)` which POSTs the current cookies to `/cookies/upload` on the enclave.

The `/cookies/upload` endpoint ([proxy/src/server.ts:150-157](../proxy/src/server.ts)) stores the payload as secret `COOKIES_<DOMAIN>` scoped to the owner. Each `/invoke` call resolves secrets fresh from the DB before building the capability's endowment ([proxy/src/server.ts:704-721](../proxy/src/server.ts)), so the JS body reads the newest cookies on every call:

```js
const raw = JSON.parse(secrets.COOKIES_YOUTUBE_COM);
const cookies = raw.cookies;  // /cookies/upload wraps as {cookies, user_agent}
```

YouTube's auth cookies (`SIDCC`, `__Secure-1PSIDTS`, `__Secure-3PSIDTS`) rotate on every authenticated request. Without continuous refresh they drift out of validity in days. With it, the enclave sees the exact same set Chrome is using right now.

#### Caveat: the extension only runs in developer mode

The author of the working demo is also the author of the extension, loaded unpacked from source into one Chrome profile on one laptop. **There is no production install path today.** Specifically:

- The extension has not been submitted to the Chrome Web Store. It has no publisher verification, no signed `.crx` distribution, no auto-update channel.
- The `manifest.json` declares `host_permissions` only for `https://tee.oauth3-stage.monerolink.com/*`, plus `optional_host_permissions: ["<all_urls>"]` that the user has to grant per-domain at runtime.
- To reproduce the demo someone else needs to clone `Account-Link/oauth3-extension-1`, open `chrome://extensions`, enable Developer Mode, and "Load unpacked" against the cloned directory. That is the current install documentation.
- Unpacked extensions get disabled on every Chrome update in some managed environments, and their background service worker can be killed more aggressively than a Web Store extension. Treat the observed "weeks of uptime" as an existence proof on one machine, not a general guarantee.

The production path — Web Store submission, signed builds, an auto-update URL, and an install flow users can follow without a GitHub account — is unbuilt. The working demo is an N=1 of what happens when the author personally keeps the loop running. That is still informative: it confirms that **given** a healthy refresh loop, the rest of the architecture holds up for weeks. The open question is how to make the refresh loop itself reliably available to anyone else.

### 4. GitHub Pages as the UI host

`query.html` is a static file in a separate public repo (`Account-Link/oauth3-extension-page`). All state lives in the URL hash fragment, which never leaves the browser — GitHub's servers see no token. Nothing to deploy, nothing to expire, no CORS surprises. The page is the permit's own mini-frontend and it costs zero operational overhead.

### 5. The enclave itself hasn't been touched

The Phala CVM running `oauth3-proxy-staging` has a 26-day uptime at the time of writing, with six containers all `Up 3 weeks`. Volumes persist across redeploys (see [dstack/DEPLOY.md](../dstack/DEPLOY.md)) so DB state would survive a restart anyway. The stable substrate under the whole thing is just... not moving.

## Evidence: the mortality correlation

The `secrets` table has an `updated_at` column that bumps on every `/cookies/upload`. A snapshot taken directly from the enclave DB tells the story in one table.

| Owner | `COOKIES_YOUTUBE_COM` age | Demo status |
|---|---|---|
| the working demo's owner | 27 minutes | live |
| (and `COOKIES_GITHUB_COM`) | 3 minutes | live |
| next-freshest tenant | ~19 days | dead |
| 3 tenants | ~26–30 days | dead |
| 36 more tenants | 36–42 days | dead |

The freshest non-working tenant is three weeks behind. Everyone else froze the day they last opened Chrome with the extension active. The 27-minute interval on the working owner is exactly one `cookie-sync` alarm period, and the 3-minute GitHub entry is a `chrome.cookies.onChanged` event that fired when they browsed GitHub earlier in the hour.

This is the full causal chain, empirically:

```
Chrome rotates cookies on every YouTube request
         │
         ▼
  onChanged listener (debounced) ─┐
                                   ├──► uploadCookies() ──► POST /cookies/upload ──► secrets.updated_at
  cookie-sync alarm (30 min) ─────┘                                                        │
                                                                                           ▼
                                                            /invoke re-reads secrets on every call
                                                                         │
                                                                         ▼
                                                            capability sees current cookies
                                                                         │
                                                                         ▼
                                                            YouTube treats request as logged-in
```

Remove any step and the chain breaks. What actually broke for every dead demo in the table was the top step — the user stopped running the extension, so nothing uploaded, so cookies froze at whatever timestamp the last sync wrote.

## Recipe: clone this pattern

To build a similar long-lived demo for a different site:

1. **Create a custom-plugin permit** with a capability that reads `secrets.COOKIES_<DOMAIN>` and hands cookies to the browser service. Template in [proxy/src/plugins/custom.ts](../proxy/src/plugins/custom.ts); working example in `yt-testing/setup_short_check.sh` (at project root) which extracts Chrome cookies, creates the permit, approves it, and prints the query URL. Capture the bearer token.

2. **Install the extension in developer mode** from `Account-Link/oauth3-extension-1`: clone the repo, open `chrome://extensions`, enable Developer Mode, click "Load unpacked" and point it at the clone. Then open the extension's popup, add the target domain to tracked sites, and flip the `syncEnabled` toggle. The extension stores a `trackedSites` list in `chrome.storage.local`; with `syncEnabled: true` on a domain, it calls `/cookies/upload` every 30 minutes and on every cookie change for that domain. See the caveat above — there is no Web Store distribution yet, and the author's single dev-mode install is the only place this loop is currently known to run for weeks.

3. **Write a static HTML page** that calls `POST /invoke/<permit_id>` with the bearer. Host it wherever — GitHub Pages works well because it's free, CORS-friendly, and invisible to the end user. Pattern: `const { result } = await fetch(...)` in a `setInterval` loop. `query.html` in the extension-page repo is the reference implementation (108 lines).

4. **Verify the loop is running.** Open the extension's service worker console and check `syncHealth.lastCookieSync` and `trackedSites[].lastUpload` in `chrome.storage.local`. Both should tick forward within 30 minutes of browsing activity.

## Debugging checklist — is the refresh actually happening?

The extension-side signals above are useful but the authoritative answer lives in the enclave DB. SSH in through the CVM's sidecar container:

```bash
cat <<'EOF' | phala ssh <app_id> -- docker exec -i -w /app dstack-oauth3-proxy-1 node
const db = require('better-sqlite3')('/data/proxy.db', { readonly: true });
const now = Date.now();
const rows = db.prepare(
  "SELECT name, owner_id, updated_at FROM secrets WHERE name LIKE 'COOKIES_%' ORDER BY updated_at DESC"
).all();
console.log(JSON.stringify(rows.map(r => ({
  name: r.name,
  owner: r.owner_id.slice(0, 8),
  age_min: Math.round((now - r.updated_at) / 60000)
}))));
EOF
```

Notes on this incantation:

- `phala ssh` connects you to the `dstack-ssh-1` sidecar, which has access to `/var/run/docker.sock`. The proxy container's `/data` volume is not visible from the sidecar itself — you have to `docker exec` in.
- The proxy image is distroless-ish, but `node` is at `/usr/local/bin/node` and `better-sqlite3` is already installed. No need to install tools.
- The `phala ssh` argv parser strips quote characters, which makes multi-layer shell quoting painful. Feeding the script on stdin through a heredoc (as above) sidesteps the problem entirely.
- What you want to see: your tenant's `age_min` value bouncing around 0–30 on every query. If it grows past 30 and keeps growing, the extension isn't calling `/cookies/upload` anymore, and you have a day or two before the demo dies.

If the refresh is healthy and the demo still fails, the failure is elsewhere: the cookies themselves may have been invalidated server-side (YouTube "Sign out from all other sessions" etc), or the capability may be hitting a page-structure change (YouTube renames the fields it parses periodically — see [yt_capabilities_2026_03_12.md](../yt_capabilities_2026_03_12.md) for past examples).

## Generalization

The recipe isn't about YouTube or about shorts. It's a pattern for long-lived cookie-authenticated agent capabilities:

- **Secrets that can go stale need a refresh channel separate from the permit itself.** The permit is a pinned, signed, approved thing; the cookies are live material. Conflating the two means every cookie rotation would require re-approval.
- **An out-of-band agent the user already runs is the simplest refresh source.** A browser extension has privileged access to live cookies; uploading them to the enclave on a timer is trivially cheap.
- **One year is about right as a bearer TTL for custom capabilities.** Shorter and you'll see demos die for trivial reasons. Longer and you're asking the enclave to keep a lot of old sessions around.
- **The UI surface can be static.** Any page that accepts a bearer in the URL hash can drive the permit without its own backend.

The enclave's job in this picture is narrow but essential: hold the bearer, hold the code, hold the cookies, and re-assemble them on every call. The rest is just making sure the cookies stay fresh.

## Open questions

- **Distribution of the refresh agent.** The extension works beautifully on the author's machine. Getting it onto other users' machines in a durable way means Web Store submission, signed builds, an auto-update URL, and an onboarding flow — none of which exists yet. This is the gating problem between "an interesting N=1" and "a demo anyone can stand up."
- **Fallbacks for sites that don't play well with refreshed cookies.** Some platforms invalidate sessions if they see cookies arriving from unexpected contexts. YouTube and TikTok have tolerated the pattern; not every site will.
- **Cookie-refresh failure detection.** Today the capability throws "Not logged in — cookies may be expired" and the UI surfaces an error. A healthier loop would detect staleness proactively and notify the owner (via push, email, or the extension itself) before the next demo call fails.
