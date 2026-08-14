function canReadDefibs(user, features) {
  const roles = user.roles || [];
  if (roles.includes('coordinator') || roles.includes('defib_manager')) return true;
  if (roles.includes('compliance') && features?.defib_compliance_report) return true;
  return false;
}

function canCheck(user) {
  const roles = user.roles || [];
  return roles.includes('coordinator') || roles.includes('defib_manager');
}

function computeFaults(body) {
  const faults = [];
  if (body.defib_present === false) { faults.push('Defib not present'); return faults; }
  if (body.rescue_ready === false)   faults.push('Not rescue ready');
  if (body.prep_kit_present === false) faults.push('Prep kit missing');
  if (body.pads_expiry && body.pads_expiry < new Date().toISOString().slice(0, 7)) {
    faults.push('Pads expired');
  }
  return faults;
}

export async function onRequestGet({ params, request, env, data }) {
  const { user } = data;
  const features = await env.CFR_DATA.get('config:features', { type: 'json' }) || {};
  if (!canReadDefibs(user, features)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');

  const { keys } = await env.CFR_DATA.list({ prefix: 'defib_check:' });
  const relevant = keys
    .filter(k => k.name.includes(params.uuid))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, limit);
  const checks = (await Promise.all(relevant.map(k => env.CFR_DATA.get(k.name, { type: 'json' })))).filter(Boolean);

  return Response.json({ checks });
}

export async function onRequestPost({ request, params, env, data }) {
  const { user } = data;
  if (!canCheck(user)) {
    return Response.json({ error: 'Defib Manager or Coordinator role required' }, { status: 403 });
  }

  const defib = await env.CFR_DATA.get(`defib:${params.uuid}`, { type: 'json' });
  if (!defib) return Response.json({ error: 'Defib not found' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const faults = computeFaults(body);
  const id = crypto.randomUUID();
  const date = new Date().toISOString().slice(0, 10);

  const record = {
    uuid:              id,
    defib_uuid:        params.uuid,
    checked_by:        data.key,
    checker_name:      user.name,
    checked_at:        new Date().toISOString(),
    defib_present:     body.defib_present !== false,
    battery_expiry:    body.defib_present !== false ? (body.battery_expiry || null) : null,
    pads_expiry:       body.defib_present !== false ? (body.pads_expiry    || null) : null,
    rescue_ready:      body.defib_present !== false ? (body.rescue_ready   !== false) : null,
    prep_kit_present:  body.defib_present !== false ? (body.prep_kit_present !== false) : null,
    faults,
    notes:             body.notes?.trim() || '',
  };

  await env.CFR_DATA.put(
    `defib_check:${date}:${id}`,
    JSON.stringify(record),
    { metadata: { defib_uuid: params.uuid } }
  );

  return Response.json({ check: record }, { status: 201 });
}
