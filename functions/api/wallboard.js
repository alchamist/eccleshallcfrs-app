const DVLA_CACHE_KEY = 'dvla_cache';
const DVLA_TTL       = 23 * 60 * 60 * 1000;

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
          mot_expiry: d.motExpiryDate    || null,
          mot_status: d.motStatus        || null,
          tax_due:    d.taxDueDate       || null,
          tax_status: d.taxStatus        || null,
        };
        await env.CFR_DATA.put(DVLA_CACHE_KEY, JSON.stringify(cache));
      }
    } catch { /* keep stale cache */ }
  }
  return cache || null;
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const pin = url.searchParams.get('pin');

  const config = await env.CFR_DATA.get('config:vehicle', { type: 'json' }) || {};

  if (!config.wallboard_pin) {
    return Response.json({ error: 'Wallboard PIN not configured. Set one in Admin → Vehicle.' }, { status: 403 });
  }
  if (!pin || pin !== String(config.wallboard_pin)) {
    return Response.json({ error: 'Invalid PIN' }, { status: 401 });
  }

  // Latest VDI for current mileage
  const { keys: vdiKeys } = await env.CFR_DATA.list({ prefix: 'vdi:' });
  vdiKeys.sort((a, b) => b.name.localeCompare(a.name));
  const latestVDI = vdiKeys.length
    ? await env.CFR_DATA.get(vdiKeys[0].name, { type: 'json' })
    : null;

  // Recent maintenance log — find last entry per type
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

  const dvla = await getDVLAData(env, config);

  return Response.json({
    callsign:             config.callsign || 'RC0681',
    maintenance:          { ...DEFAULT_MAINT, ...(config.maintenance || {}) },
    current_mileage:      latestVDI?.starting_mileage ?? null,
    current_mileage_date: latestVDI?.date ?? null,
    last_maintenance:     lastMaint,
    dvla,
  });
}
