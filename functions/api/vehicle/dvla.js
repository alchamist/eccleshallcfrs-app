const CACHE_KEY  = 'dvla_cache';
const CACHE_TTL  = 23 * 60 * 60 * 1000; // 23 hours in ms

async function fetchDVLA(vrm, apiKey) {
  const res = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
    method:  'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ registrationNumber: vrm.replace(/\s+/g, '').toUpperCase() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.errors?.[0]?.detail || `DVLA API error ${res.status}`);
  }
  return res.json();
}

async function getCachedDVLA(env) {
  return env.CFR_DATA.get(CACHE_KEY, { type: 'json' });
}

async function refreshDVLACache(env) {
  const config = await env.CFR_DATA.get('config:vehicle', { type: 'json' }) || {};
  const vrm    = config.vrm;
  const apiKey = env.DVLA_API_KEY;

  if (!vrm)    throw new Error('No VRM configured. Add registration number in Admin → Vehicle.');
  if (!apiKey) throw new Error('DVLA_API_KEY environment variable not set.');

  const data = await fetchDVLA(vrm, apiKey);

  const cache = {
    vrm:          vrm.toUpperCase(),
    fetched_at:   new Date().toISOString(),
    mot_expiry:   data.motExpiryDate   || null,
    mot_status:   data.motStatus       || null,
    tax_due:      data.taxDueDate      || null,
    tax_status:   data.taxStatus       || null,
    make:         data.make            || null,
    colour:       data.colour          || null,
    fuel_type:    data.fuelType        || null,
    year:         data.yearOfManufacture || null,
  };

  await env.CFR_DATA.put(CACHE_KEY, JSON.stringify(cache));
  return cache;
}

function isStale(cache) {
  if (!cache?.fetched_at) return true;
  return Date.now() - new Date(cache.fetched_at).getTime() > CACHE_TTL;
}

// GET — returns cached data, fetching fresh if stale and credentials exist
export async function onRequestGet({ env, data }) {
  if (!data.user.roles?.includes('coordinator') && !data.user.roles?.includes('compliance')) {
    return Response.json({ error: 'Coordinator or compliance role required' }, { status: 403 });
  }

  let cache = await getCachedDVLA(env);

  if (isStale(cache) && env.DVLA_API_KEY) {
    const config = await env.CFR_DATA.get('config:vehicle', { type: 'json' }) || {};
    if (config.vrm) {
      try { cache = await refreshDVLACache(env); } catch { /* return stale cache */ }
    }
  }

  return Response.json({ dvla: cache || null });
}

// POST — force immediate refresh (coordinator only)
export async function onRequestPost({ env, data }) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  try {
    const cache = await refreshDVLACache(env);
    return Response.json({ dvla: cache });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
