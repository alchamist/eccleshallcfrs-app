# Admin Portal Interface Changes

Tracks all CFR app changes that affect what the admin portal (`admin.romeocharlie.co.uk`)
needs to display or manage. Update this file when any phase adds new KV keys, roles,
feature flags, or public APIs that the admin portal code agent needs to account for.

---

## Phase 1 — Responder Profile Extension

### New user profile fields (CFR_USERS)

`user:{access_key}` in `CFR_USERS` now carries four optional nullable fields:

```json
{
  "start_date": "YYYY-MM-DD | null",
  "phone": "string | null",
  "email": "string | null",
  "emergency_contact": {
    "name": "string | null",
    "phone": "string | null",
    "relationship": "string | null"
  }
}
```

**Admin portal impact:**
- User detail / roster views should display these fields if present.
- `start_date` is useful for calculating tenure per group.
- `email` and `phone` are useful for coordinator contact lists.
- `emergency_contact` is internal operational data; display behind a "show more" toggle.

### No new feature flags, KV patterns, or API endpoints.

---

## Phase 2 — Coordinator Announcements

### New KV patterns (CFR_DATA)

| Key pattern | Value |
|-------------|-------|
| `announcement:{YYYY-MM-DD}:{uuid}` | Announcement record JSON |
| `announcement:active` | JSON array of active announcement UUIDs |

**Announcement record shape:**
```json
{
  "id": "uuid",
  "title": "string",
  "body": "string",
  "created_by_name": "string",
  "created_at": "ISO timestamp",
  "expires_at": "ISO timestamp | null",
  "active": true
}
```

### New feature flag

`announcements` in `config:features` (CFR_DATA, key `config:features`). When `false`, the feature is disabled for that group.

**Admin portal impact:**
- Feature flag management panel should include the `announcements` toggle.
- Group health view could surface active announcement count from `announcement:active`.

### New API endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/announcements` | Any authenticated user | Returns active announcements |
| `POST /api/announcements` | coordinator | Create announcement |
| `PATCH /api/announcements/{id}` | coordinator | Update announcement |
| `DELETE /api/announcements/{id}` | coordinator | Deactivate announcement |

---

## Phase 3 — Maintenance Alerts

### New `wrangler.toml` section

A Cloudflare Cron Trigger is added to `wrangler.toml`:

```toml
[triggers]
crons = ["0 7 * * *"]
```

This calls `functions/api/maintenance/alert.js` (POST) once daily at 07:00 UTC to send
the maintenance alert email.

### New Pages secret

`COORDINATOR_EMAIL` — the coordinator's email address. Must be added to each group's
Cloudflare Pages project under Settings → Environment Variables (Production).

**Admin portal impact:**
- Provisioning wizard should prompt for `COORDINATOR_EMAIL` and document it as a required secret.
- Group detail view should indicate whether `COORDINATOR_EMAIL` is set (the Cloudflare Pages API
  exposes secret names but not values — just show whether the key exists).

### New API endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/maintenance/alert` | coordinator | Trigger maintenance alert email manually |

---

## Phase 5 — Load List Expiry + Restocking List

### New API endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/monthly-check/latest` | coordinator, compliance | Returns most recent monthly check record |
| `GET /api/monthly-check/restock` | coordinator, compliance | Returns flagged/expiring items for restocking |

No new KV key patterns — expiry data is already embedded in existing `monthly:{date}:{uuid}` records.

---

## Phase 6 — Uniform Tracker

### New role

`uniform_officer` — manages uniform issue/return records. Cannot access vehicle or responder forms.

**Admin portal impact:**
- User roster views should display `uniform_officer` in the role chip list.
- Role filter/search should include `uniform_officer`.

### New feature flag

`uniform_tracker` in `config:features`. Defaults to `false`. When `true`, enables the uniform
tracker page, nav item, and API endpoints.

**Admin portal impact:**
- Feature flag management panel should include the `uniform_tracker` toggle.

### New KV patterns (CFR_DATA)

| Key pattern | Value |
|-------------|-------|
| `uniform_item:{uuid}` | Uniform item type definition |
| `uniform_item:index` | Array of all item UUIDs |
| `uniform_issue:{YYYY-MM-DD}:{uuid}` | Issue record |
| `uniform_issue:index` | Array of all issue UUIDs (for person-search) |
| `uniform_ack:{issue_uuid}` | Acknowledgement record |
| `uniform_return:{issue_uuid}` | Return record |

**uniform_item shape:**
```json
{ "id": "uuid", "name": "Polo Shirt", "category": "top", "sizes": ["S","M","L","XL"], "active": true }
```

**uniform_issue shape:**
```json
{
  "id": "uuid",
  "item_uuid": "uuid",
  "responder_id": "user-access-key",
  "responder_name": "string",
  "size": "M",
  "quantity": 1,
  "date_issued": "YYYY-MM-DD",
  "issued_by_name": "string",
  "condition_at_issue": "new|good|fair",
  "notes": "string",
  "status": "issued|acknowledged|returned"
}
```

### New API endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/uniform/items` | coordinator, uniform_officer | List item types |
| `POST /api/uniform/items` | coordinator, uniform_officer | Create item type |
| `PATCH /api/uniform/items/{id}` | coordinator, uniform_officer | Edit/deactivate item type |
| `GET /api/uniform/issues` | coordinator, uniform_officer | List issues (filterable by responder_id) |
| `POST /api/uniform/issues` | coordinator, uniform_officer | Record new issue |
| `PATCH /api/uniform/issues/{id}` | coordinator, uniform_officer | Update issue (return, etc.) |
| `POST /api/uniform/issues/{id}/ack` | Any authenticated user | Responder acknowledges receipt |
| `GET /api/uniform/report` | coordinator, uniform_officer | Summary stats |

---

## Phase 8 — Public API Expansion

### `/api/stats` — expanded fields

The public `GET /api/stats` response now includes additional fields cached in `stats:cache`:

```json
{
  "scheme_name": "Eccleshall CFR",
  "callsign": "RC0681",
  "defibs_on_circuit": 3,
  "responders_total": 15,
  "checks_completed_this_month": 2
}
```

**Admin portal impact:**
- Group health dashboard can pull richer stats from each group's `/api/stats` endpoint.
- The `defibs_on_circuit`, `responders_total`, and `checks_completed_this_month` fields
  enable at-a-glance operational health per group.

### `/api/status/active` — enriched crew data

The public `GET /api/status/active` response now includes:

```json
{
  "active": true,
  "crew": [{ "name": "Jo Smith", "role": "crew" }],
  "shift_start": "ISO timestamp",
  "vehicle": "RC0681"
}
```

**Admin portal impact:**
- Cross-group live status view can show crew names per active shift.
