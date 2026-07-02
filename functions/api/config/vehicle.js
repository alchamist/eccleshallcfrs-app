const DEFAULT = {
  callsign:      'RC0681',
  vrm:           null,
  tread_warn_mm: 3.0,
  wallboard_pin: null,
  maintenance: {
    mot:        { next_due: null, warn_days: 30 },
    service:    { next_due: null, warn_days: 14, interval_miles: 10000, interval_months: 12 },
    insurance:  { next_due: null, warn_days: 30 },
    deep_clean: { interval_days: 60, warn_days: 7 },
  },
};

export async function onRequestGet({ env }) {
  const stored = await env.CFR_DATA.get('config:vehicle', { type: 'json' });
  const config = { ...DEFAULT, ...stored, maintenance: { ...DEFAULT.maintenance, ...(stored?.maintenance || {}) } };
  return Response.json({ config });
}

export async function onRequestPatch({ env, data, request }) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const existing = await env.CFR_DATA.get('config:vehicle', { type: 'json' }) || {};
  const updated  = {
    ...DEFAULT,
    ...existing,
    ...body,
    maintenance: { ...DEFAULT.maintenance, ...(existing.maintenance || {}), ...(body.maintenance || {}) },
  };
  await env.CFR_DATA.put('config:vehicle', JSON.stringify(updated));
  return Response.json({ config: updated });
}
