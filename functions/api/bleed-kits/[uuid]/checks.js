function canReadBleedKits(user, features) {
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
  if (body.cabinet_accessible === false) { faults.push('Cabinet not accessible'); return faults; }
  if (body.kit_present === false) faults.push('Kit not present');
  if (body.kit_expiry && body.kit_expiry < new Date().toISOString().slice(0, 7)) {
    faults.push('Kit expired');
  }
  return faults;
}

export async function onRequestGet({ params, request, env, data }) {
  const { user } = data;
  const features = await env.CFR_DATA.get('config:features', { type: 'json' }) || {};
  if (!canReadBleedKits(user, features)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');

  const { keys } = await env.CFR_DATA.list({ prefix: 'bleed_kit_check:' });
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

  const kit = await env.CFR_DATA.get(`bleed_kit:${params.uuid}`, { type: 'json' });
  if (!kit) return Response.json({ error: 'Bleed kit not found' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const faults = computeFaults(body);
  const id = crypto.randomUUID();
  const date = new Date().toISOString().slice(0, 10);

  const record = {
    uuid:               id,
    bleed_kit_uuid:     params.uuid,
    checked_by:         data.key,
    checker_name:       user.name,
    checked_at:         new Date().toISOString(),
    cabinet_accessible: body.cabinet_accessible !== false,
    kit_present:        body.cabinet_accessible !== false ? (body.kit_present !== false) : null,
    kit_expiry:         body.cabinet_accessible !== false ? (body.kit_expiry || null) : null,
    faults,
    notes:              body.notes?.trim() || '',
  };

  await env.CFR_DATA.put(
    `bleed_kit_check:${date}:${id}`,
    JSON.stringify(record),
    { metadata: { bleed_kit_uuid: params.uuid } }
  );

  return Response.json({ check: record }, { status: 201 });
}
