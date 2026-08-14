# Eccleshall CFR App

PWA for Eccleshall Community First Responders (RC0681). Replaces Google Forms. Volunteers only, not public-facing.

## Tech stack

- Pure HTML/CSS/JS — no build step, no bundler, no framework
- **Hosting:** Cloudflare Pages (repo: `alchamist/eccleshallcfrs-app`, branch: `master`)
- **API:** Cloudflare Pages Functions — one file per route under `functions/api/`
- **Storage:** Cloudflare Workers KV — two namespaces: `CFR_USERS`, `CFR_DATA`
- **Secrets:** `DVLA_API_KEY` stored as Cloudflare Pages environment secret (never in code)
- **Service worker:** `sw.js` — bump `CACHE` version string on every deploy to force device updates (currently `cfr-v22`)

## Deployment

Push to `master` → GitHub Action (`.github/workflows/deploy-secondary-groups.yml`) deploys **all groups in parallel**: Eccleshall (using `wrangler.toml` directly) and each secondary group (file-swapping its own `wrangler.{slug}.toml`). No Cloudflare dashboard GitHub integration needed — the Action handles everything.

## Multi-group deployment

This single codebase serves multiple CFR groups, each with their own Cloudflare Pages project and KV namespaces. **Scheme name and callsign are stored in `config:vehicle` KV key, not hardcoded.**

### Existing groups

| Group | Pages project | CFR_USERS namespace | CFR_DATA namespace |
|-------|-------------|--------------------|--------------------|
| Eccleshall CFR (RC0681) | `eccleshallcfrs-app` | `fcfebe7bf9ea43daa2eb48965d4cfb19` | `8848e48f5a004647afb6973c78093f22` |
| Lichfield CFRs (RC602) | `lichfieldcfrs-app` | `8c905d5cbd3a4de1aeda7576017246c1` | `e3d8939db30e4423b99ab817f28c9642` |

### How KV bindings work (critical)

Cloudflare Pages treats `wrangler.toml` as authoritative for KV bindings on every deploy:
- `wrangler.toml` always holds Eccleshall's KV IDs — the GitHub Action uses it directly
- Secondary groups each have their own `wrangler.{slug}.toml`; the Action file-swaps it before deploying
- Do NOT add secondary group KV IDs to the main `wrangler.toml`
- **Never manually run `wrangler pages deploy` while `wrangler.toml` is in a swapped state** — it will wire the wrong KV to Eccleshall

### Adding a new CFR group (automated — preferred)

Run the setup script from the repo root. It handles steps 1–4 and 6 automatically:

```bash
./scripts/new-group.sh <slug> "<Scheme Name>" <CALLSIGN> "<Coordinator Name>" <prf_number>
# Example:
./scripts/new-group.sh cannock "Cannock CFRs" RC0999 "Jane Smith" 9001
```

The script:
1. Creates CFR_USERS and CFR_DATA KV namespaces via wrangler
2. Generates `wrangler.<slug>.toml`
3. Seeds `config:vehicle` KV key
4. Creates the coordinator user (access key `cfr-CORD-0001-INIT`, roles: coordinator + support)
5. Adds the deploy job to the GitHub Action

Then do the two remaining manual steps it prints:
- **Create the Pages project** in Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → repo `alchamist/eccleshallcfrs-app`, branch `master`, name `{slug}cfrs-app`, no build command
- **Add DVLA_API_KEY secret** → Pages project → Settings → Environment Variables (same key as other projects)

Finally commit and push:
```bash
git add wrangler.<slug>.toml .github/workflows/deploy-secondary-groups.yml
git commit -m "Add <Scheme Name> group"
git push
```
The push triggers the Action which deploys all groups including the new one.

### Adding a new CFR group (manual — fallback)

If the script can't run (Windows without bash, etc.):

1. Create KV namespaces: `wrangler kv namespace create "SLUG_CFR_USERS" --remote` and `..._CFR_DATA`
2. Create `wrangler.slug.toml` (copy from `wrangler.lichfield.toml`, update name and KV IDs)
3. Seed config: `wrangler kv key put "config:vehicle" '{...}' --namespace-id <DATA_ID> --remote`
4. Create coordinator: `wrangler kv key put "user:cfr-CORD-0001-INIT" '{...}' --namespace-id <USERS_ID> --remote` and seed `users:index`
5. Add a `deploy-{slug}` job to the GitHub Action (parallel job, same pattern as `deploy-lichfield`)
6. Create Pages project and add DVLA_API_KEY (manual, dashboard only)
7. Commit and push — Action deploys everything

### The `support` role

A user with `roles: ["support"]` gets coordinator access across ALL groups without appearing as a coordinator in any group's user list. The middleware injects `coordinator` into their roles at request time. Support accounts are created via wrangler only (the app UI blocks editing them). Useful for cross-group admin (e.g. the person managing the whole platform).

## Roles

Stored as array in user profile. Current roles:
- `responder` — standard volunteer
- `coordinator` — full admin access
- `compliance` — read/resolve access for defects and compliance data
- `fire_safety_officer` — access to fire safety check forms and reports tab in coordinator dashboard
- `defib_manager` — access to defib/bleed kit checks only; cannot access responder pages (vehicle shift, inspection, mileage, monthly check, availability); CAN access duty hours
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
- `defib:{uuid}` — defibrillator device record (group_id, location, make, model, serial, lock code, install date, responsible person, contact, on-circuit, active)
- `defib:index` — array of all defib UUIDs
- `defib_check:{date}:{uuid}` — defib check record; metadata: `{ defib_uuid }` for per-device listing
- `bleed_kit:{uuid}` — bleed kit device record (group_id, location, lock code, responsible person, contact, active)
- `bleed_kit:index` — array of all bleed kit UUIDs
- `bleed_kit_check:{date}:{uuid}` — bleed kit check record; metadata: `{ bleed_kit_uuid }` for per-device listing

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
| `defibs.html` | Defib & bleed kit list + report | defib_manager, coordinator, compliance (if defib_compliance_report enabled) |
| `defib-check.html` | Record a defib check | defib_manager, coordinator |
| `bleed-kit-check.html` | Record a bleed kit check | defib_manager, coordinator |
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
