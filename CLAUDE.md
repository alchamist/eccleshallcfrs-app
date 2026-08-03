# Eccleshall CFR App

PWA for Eccleshall Community First Responders (RC0681). Replaces Google Forms. Volunteers only, not public-facing.

## Tech stack

- Pure HTML/CSS/JS — no build step, no bundler, no framework
- **Hosting:** Cloudflare Pages (repo: `alchamist/eccleshallcfrs-app`, branch: `master`)
- **API:** Cloudflare Pages Functions — one file per route under `functions/api/`
- **Storage:** Cloudflare Workers KV — two namespaces: `CFR_USERS`, `CFR_DATA`
- **Secrets:** `DVLA_API_KEY` stored as Cloudflare Pages environment secret (never in code)
- **Service worker:** `sw.js` — bump `CACHE` version string on every deploy to force device updates (currently `cfr-v13`)

## Deployment

Push to `master` → Cloudflare Pages auto-deploys. No manual steps needed.
After bumping `sw.js` cache version, devices pick up changes on next visit.

## Roles

Stored as array in user profile. Current roles:
- `responder` — standard volunteer
- `coordinator` — full admin access
- `compliance` — read/resolve access for defects and compliance data
- `fire_safety_officer` — access to fire safety check forms and reports tab in coordinator dashboard

Users can hold multiple roles: `["responder", "fire_safety_officer"]`.

## KV key patterns

**CFR_USERS namespace:**
- `user:{access_key}` → user profile JSON
- `users:index` → array of all access keys

**CFR_DATA namespace:**
- `duty:{date}:{uuid}` — individual duty log entries
- `vshift:{date}:{uuid}` — vehicle shift records (crew sign-on/off)
- `vshift:active` → ID of currently active shift
- `vdi:{date}:{uuid}` — vehicle daily inspection
- `claim:{date}:{uuid}` — incident/mileage claims
- `monthly:{YYYY-MM}:{uuid}` — monthly load list checks
- `defect:{category}:{uuid}` — vehicle/equipment defects (`category` = `vehicle` or `equipment`)
- `maintenance_log:{timestamp}:{uuid}` — vehicle maintenance entries (MOT, service, insurance, etc.)
- `config:vehicle` — vehicle config (callsign, VRM, wallboard PIN, maintenance dates/intervals)
- `dvla_cache` — cached DVLA VES API response (23h TTL)
- `wallboard_cache` — cached wallboard payload (30min TTL, auto-expires via KV TTL)
- `fire_safety:alarm:{date}:{uuid}` — weekly fire alarm test
- `fire_safety:lighting:{date}:{uuid}` — monthly emergency lighting test
- `fire_safety:extinguisher:{date}:{uuid}` — annual fire extinguisher check

## Public endpoints

- `GET /api/stats` — aggregate stats for eccleshallcfrs-site.pages.dev (CORS, 5-min cache)
- `GET /api/wallboard?pin=XXXX` — compliance wallboard (PIN-authenticated, no user auth)
- `GET /api/status/active` — active duty status (public)

## Architecture notes

- `functions/api/_middleware.js` handles auth for all `/api/` routes except `PUBLIC_PREFIXES`
- Auth token stored in `localStorage` as `cfr_token` (access key)
- Offline queue in `app.js` uses IndexedDB; service worker background sync badge in header
- `CFR.submitForm(url, payload)` — handles online/offline transparently
- `CFR.hasRole(role)` — checks current user's roles array
- Wallboard has its own PIN auth (separate from app auth), PIN stored in `config:vehicle.wallboard_pin`

## Pages / forms

| Page | Purpose | Access |
|------|---------|--------|
| `dashboard.html` | Home after login | All |
| `duty-hours.html` | Individual duty log | responder |
| `vehicle-shift.html` | Live crew management | responder |
| `vehicle-inspection.html` | Daily vehicle check (49 items) | responder |
| `mileage-claim.html` | Incident/mileage claim for WMAS | responder |
| `monthly-check.html` | Monthly load list check (~75 items with expiry dates) | responder |
| `availability.html` | Rota availability | responder |
| `defects.html` | Vehicle/equipment defect register | all (resolve: compliance+) |
| `training.html` | Training log | responder |
| `fire-alarm-test.html` | Weekly fire alarm test | responder |
| `emergency-lighting-test.html` | Monthly emergency lighting test | responder |
| `extinguisher-test.html` | Annual fire extinguisher check | fire_safety_officer, coordinator |
| `compliance.html` | Compliance overview | compliance, coordinator |
| `coordinator.html` | Admin — users, settings, reports | coordinator, fire_safety_officer |
| `wallboard.html` | Compliance status display (PIN-only) | public (PIN) |

## Common gotchas

- Pages Functions only export `onRequest`, `onRequestGet`, `onRequestPost`, etc. — do NOT export helper functions (causes deploy errors)
- KV `list()` returns max 1000 keys by default — use date-prefixed queries to scope results
- The wallboard response is cached 30 min in KV; if testing changes, delete `wallboard_cache` key in KV dashboard or wait for TTL
- Service worker version must be bumped on every deploy or existing devices won't pick up JS/HTML changes
- `DVLA_API_KEY` must be set as a Pages Secret (not a plain env var) in the Cloudflare dashboard
