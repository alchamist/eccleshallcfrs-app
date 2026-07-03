const DVLA_CACHE_KEY = 'dvla_cache';
const DVLA_TTL       = 23 * 60 * 60 * 1000;

// Cache the full computed wallboard payload for 10 minutes so repeated refreshes
// from the wall tablet don't scan all KV records every 5 minutes.
const WB_CACHE_KEY = 'wallboard_cache';
const WB_CACHE_TTL = 10 * 60 * 1000;

async function getDVLAData(env, config) {
  let cache = await env.CFR_DATA.get(DVLA_CACHE_KEY, { type: 'json' });
  const stale = !cache?.fetched_at || Date.now() - new Date(cache.fetched_at).getTime() > DVLA_TTL;

  if (stale && env.DVLA_API_KEY && config.vrm) {
    try {
      const res = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
        method:  'POST',
        headers: { 'x-api-key': env.DVLA_API_KEY, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ registrationNumber: config.vrm.replace(/\s+/g, '').toUpperCase() }),
      });
      if (res.ok) {
        const d = await res.json();
        cache = {
          vrm:        config.vrm.toUpperCase(),
          fetched_at: new Date().toISOString(),
          mot_expiry: d.motExpiryDate || null,
          mot_status: d.motStatus     || null,
          tax_due:    d.taxDueDate    || null,
          tax_status: d.taxStatus     || null,
        };
        await env.CFR_DATA.put(DVLA_CACHE_KEY, JSON.stringify(cache));
      }
    } catch { /* keep stale cache */ }
  }
  return cache || null;
}

async function getDutyStatus(env) {
  const activeId = await env.CFR_DATA.get('vshift:active');
  if (!activeId) return { active: false, crew: [] };

  const { keys } = await env.CFR_DATA.list({ prefix: 'vshift:' });
  const k = keys.find(k => k.name !== 'vshift:active' && k.name.includes(activeId));
  if (!k) return { active: false, crew: [] };

  const shift = await env.CFR_DATA.get(k.name, { type: 'json' });
  if (!shift || shift.status !== 'active') return { active: false, crew: [] };

  const crew = (shift.crew || []).filter(c => !c.signed_off);
  if (!crew.length) return { active: false, crew: [] };

  return {
    active:     true,
    crew:       crew.map(c => ({ name: c.name, role: c.role })),
    started_at: shift.start_time || null,
    shift_date: shift.date       || null,
  };
}

async function getStats(env) {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const year  = now.getFullYear();
  const mm    = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${year}-${mm}-01`;

  // Scope to current year/month only — avoids scanning all-time records
  const [{ keys: claimKeys }, { keys: dutyKeys }] = await Promise.all([
    env.CFR_DATA.list({ prefix: `claim:${year}-` }),
    env.CFR_DATA.list({ prefix: `duty:${year}-${mm}-` }),
  ]);

  const [claimRecords, dutyRecords] = await Promise.all([
    Promise.all(claimKeys.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))).then(r => r.filter(Boolean)),
    Promise.all(dutyKeys.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))).then(r => r.filter(Boolean)),
  ]);

  const incidents = claimRecords.filter(c => c.incident_type && c.incident_type !== 'na');

  const incToday = incidents.filter(c => (c.date || '') === today).length;
  const incMonth = incidents.filter(c => (c.date || '') >= monthStart).length;
  const incYear  = incidents.length;

  const hoursThisMonth = Math.round(
    dutyRecords.reduce((s, d) => s + (d.duration_mins || 0), 0) / 6
  ) / 10;

  return { incToday, incMonth, incYear, hoursThisMonth };
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const pin = url.searchParams.get('pin');

  // PIN check first — read config only (2 reads total for a cache hit)
  const config = await env.CFR_DATA.get('config:vehicle', { type: 'json' }) || {};

  if (!config.wallboard_pin) {
    return Response.json({ error: 'Wallboard PIN not configured. Set one in Admin → Vehicle.' }, { status: 403 });
  }
  if (!pin || pin !== String(config.wallboard_pin)) {
    return Response.json({ error: 'Invalid PIN' }, { status: 401 });
  }

  // Serve cached payload if fresh (saves ~50+ KV reads per call)
  const cached = await env.CFR_DATA.get(WB_CACHE_KEY, { type: 'json' });
  if (cached?.cached_at && Date.now() - new Date(cached.cached_at).getTime() < WB_CACHE_TTL) {
    return Response.json(cached.payload);
  }

  // Full recompute — runs at most once per WB_CACHE_TTL window
  const { keys: vdiKeys } = await env.CFR_DATA.list({ prefix: 'vdi:' });
  vdiKeys.sort((a, b) => b.name.localeCompare(a.name));
  const latestVDI = vdiKeys.length
    ? await env.CFR_DATA.get(vdiKeys[0].name, { type: 'json' })
    : null;

  const { keys: maintKeys } = await env.CFR_DATA.list({ prefix: 'maintenance_log:' });
  maintKeys.sort((a, b) => b.name.localeCompare(a.name));
  const recentEntries = (
    await Promise.all(maintKeys.slice(0, 40).map(k => env.CFR_DATA.get(k.name, { type: 'json' })))
  ).filter(Boolean);

  const lastMaint = {};
  for (const e of recentEntries) {
    if (!lastMaint[e.type]) lastMaint[e.type] = e;
  }

  const DEFAULT_MAINT = {
    mot:        { next_due: null, warn_days: 30 },
    service:    { next_due: null, warn_days: 14, interval_miles: 10000, interval_months: 12 },
    insurance:  { next_due: null, warn_days: 30 },
    deep_clean: { interval_days: 60, warn_days: 7 },
  };

  const [dvla, duty, stats] = await Promise.all([
    getDVLAData(env, config),
    getDutyStatus(env),
    getStats(env),
  ]);

  const payload = {
    callsign:             config.callsign || 'RC0681',
    maintenance:          { ...DEFAULT_MAINT, ...(config.maintenance || {}) },
    current_mileage:      latestVDI?.starting_mileage ?? null,
    current_mileage_date: latestVDI?.date ?? null,
    last_maintenance:     lastMaint,
    dvla,
    duty,
    stats,
  };

  // Store with a 10-minute TTL (also set KV expiration so it self-cleans)
  await env.CFR_DATA.put(WB_CACHE_KEY, JSON.stringify({ cached_at: new Date().toISOString(), payload }),
    { expirationTtl: 600 });

  return Response.json(payload);
}
