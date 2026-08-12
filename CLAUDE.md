# Eccleshall CFR App

PWA for Eccleshall Community First Responders (RC0681). Replaces Google Forms. Volunteers only, not public-facing.

## Tech stack

- Pure HTML/CSS/JS — no build step, no bundler, no framework
- **Hosting:** Cloudflare Pages (repo: `alchamist/eccleshallcfrs-app`, branch: `master`)
- **API:** Cloudflare Pages Functions — one file per route under `functions/api/`
- **Storage:** Cloudflare Workers KV — two namespaces: `CFR_USERS`, `CFR_DATA`
- **Secrets:** `DVLA_API_KEY` stored as Cloudflare Pages environment secret (never in code)
- **Service worker:** `sw.js` — bump `CACHE` version string on every deploy to force device updates (currently `cfr-v16`)

## Deployment

Push to `master` → Cloudflare Pages auto-deploys Eccleshall. A GitHub Action (`deploy-secondary-groups.yml`) also fires and deploys all secondary groups (currently Lichfield CFRs) using their own wrangler config files.

## Multi-group deployment

This single codebase serves multiple CFR groups, each with their own Cloudflare Pages project and KV namespaces. **Scheme name and callsign are stored in `config:vehicle` KV key, not hardcoded.**

### Existing groups

| Group | Pages project | CFR_USERS namespace | CFR_DATA namespace |
|-------|-------------|--------------------|--------------------|
| Eccleshall CFR (RC0681) | `eccleshallcfrs-app` | `fcfebe7bf9ea43daa2eb48965d4cfb19` | `8848e48f5a004647afb6973c78093f22` |
| Lichfield CFRs (RC602) | `lichfieldcfrs-app` | `8c905d5cbd3a4de1aeda7576017246c1` | `e3d8939db30e4423b99ab817f28c9642` |

### How KV bindings work (critical)

Cloudflare Pages treats `wrangler.toml` as authoritative for KV bindings on every deploy:
- `wrangler.toml` has Eccleshall's KV IDs → Eccleshall always gets the right namespaces via GitHub auto-deploy
- **Secondary groups must NOT be in `wrangler.toml`** — the GitHub Action deploys them by copying their own `wrangler.{group}.toml` over `wrangler.toml` before running `wrangler pages deploy`
- Do NOT add KV IDs for secondary groups to the main `wrangler.toml` (breaks everything)
- Do NOT re-run old GitHub Action jobs — each push auto-triggers a fresh run

### Adding a new CFR group (step by step)

1. **Create KV namespaces** (Cloudflare dashboard → Workers & Pages → KV, or via wrangler):
   ```
   wrangler kv namespace create "NEWGROUP_CFR_USERS" --remote
   wrangler kv namespace create "NEWGROUP_CFR_DATA" --remote
   ```
   Note the namespace IDs.

2. **Create Pages project** (Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → `alchamist/eccleshallcfrs-app` branch `master`). Set project name e.g. `newgroupcfrs-app`. No build command needed.

3. **Create `wrangler.newgroup.toml`** in project root:
   ```toml
   name = "newgroupcfrs-app"
   compatibility_date = "2024-09-23"
   pages_build_output_dir = "."

   [[kv_namespaces]]
   binding = "CFR_USERS"
   id = "<NEWGROUP_CFR_USERS namespace ID>"

   [[kv_namespaces]]
   binding = "CFR_DATA"
   id = "<NEWGROUP_CFR_DATA namespace ID>"
   ```

4. **Add deploy step to `.github/workflows/deploy-secondary-groups.yml`**:
   ```yaml
   - name: Deploy to newgroupcfrs-app
     env:
       CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
       CLOUDFLARE_ACCOUNT_ID: 91e87a1af94c50755b19f07943df567c
     run: |
       cp wrangler.newgroup.toml wrangler.toml
       wrangler pages deploy . --project-name newgroupcfrs-app
   ```

5. **Write initial KV data** — the new site needs a `config:vehicle` entry or it will show "Eccleshall CFR" as fallback:
   ```
   wrangler kv key put "config:vehicle" '{"scheme_name":"New Group CFRs","callsign":"RCXXXX","vrm":"","wallboard_pin":"","tread_warn_mm":3}' --namespace-id <CFR_DATA namespace ID> --remote
   ```

6. **Create initial coordinator user**:
   ```
   wrangler kv key put "users:index" '["cfr-word-word-1234"]' --namespace-id <CFR_USERS namespace ID> --remote
   wrangler kv key put "user:cfr-word-word-1234" '{"id":"<uuid>","access_key":"cfr-word-word-1234","name":"Coordinator Name","roles":["coordinator"],"active":true}' --namespace-id <CFR_USERS namespace ID> --remote
   ```
   Use `crypto.randomUUID()` in browser console for the UUID.

7. **Add DVLA_API_KEY secret** to the new Pages project in the Cloudflare dashboard (can reuse the same key — it's account-level).

8. **Bump `sw.js` CACHE version** and push.

### The `support` role

A user with `roles: ["support"]` gets coordinator access across ALL groups without appearing as a coordinator in any group's user list. The middleware injects `coordinator` into their roles at request time. Support accounts are created via wrangler only (the app UI blocks editing them). Useful for cross-group admin (e.g. the person managing the whole platform).

## Roles

Stored as array in user profile. Current roles:
- `responder` — standard volunteer
- `coordinator` — full admin access
- `compliance` — read/resolve access for defects and compliance data
- `fire_safety_officer` — access to fire safety check forms and reports tab in coordinator dashboard
- `support` — cross-group platform admin; middleware injects `coordinator` at runtime

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
- `config:vehicle` — vehicle config (scheme_name, callsign, VRM, wallboard PIN, maintenance dates/intervals)
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
- `CFR.hasRole(role)` — checks current user's roles array; `support` role passes all role checks
- Wallboard has its own PIN auth (separate from app auth), PIN stored in `config:vehicle.wallboard_pin`
- `scheme_name` in `config:vehicle` drives the group name shown across all pages and the wallboard

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
- `wrangler pages deploy` does NOT support `--config` or `--account-id` flags; use `CLOUDFLARE_ACCOUNT_ID` env var and copy the toml file instead
- The GitHub Actions secret `CLOUDFLARE_API_TOKEN` must be a proper Cloudflare API token (created in dash.cloudflare.com → My Profile → API Tokens → Create Custom Token with Account → Cloudflare Pages → Edit permission) — NOT the wrangler OAuth token (`cfoat_...`)
