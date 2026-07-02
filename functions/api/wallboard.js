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

  return Response.json({
    callsign:             config.callsign || 'RC0681',
    maintenance:          { ...DEFAULT_MAINT, ...(config.maintenance || {}) },
    current_mileage:      latestVDI?.starting_mileage ?? null,
    current_mileage_date: latestVDI?.date ?? null,
    last_maintenance:     lastMaint,
  });
}
