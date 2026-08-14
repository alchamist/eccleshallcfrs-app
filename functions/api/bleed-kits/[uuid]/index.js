function canReadBleedKits(user, features) {
  const roles = user.roles || [];
  if (roles.includes('coordinator') || roles.includes('defib_manager')) return true;
  if (roles.includes('compliance') && features?.defib_compliance_report) return true;
  return false;
}

export async function onRequestGet({ params, env, data }) {
  const { user } = data;
  const features = await env.CFR_DATA.get('config:features', { type: 'json' }) || {};
  if (!canReadBleedKits(user, features)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const kit = await env.CFR_DATA.get(`bleed_kit:${params.uuid}`, { type: 'json' });
  if (!kit) return Response.json({ error: 'Not found' }, { status: 404 });

  const { keys } = await env.CFR_DATA.list({ prefix: 'bleed_kit_check:' });
  const relevant = keys
    .filter(k => k.metadata?.bleed_kit_uuid === params.uuid || k.name.includes(params.uuid))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 5);
  const checks = (await Promise.all(relevant.map(k => env.CFR_DATA.get(k.name, { type: 'json' })))).filter(Boolean);

  return Response.json({ bleed_kit: kit, checks });
}

export async function onRequestPatch({ request, params, env, data }) {
  const { user } = data;
  if (!(user.roles || []).includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }

  const kit = await env.CFR_DATA.get(`bleed_kit:${params.uuid}`, { type: 'json' });
  if (!kit) return Response.json({ error: 'Not found' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fields = ['group_id','location','cabinet_lock_code','responsible_person','contact_number','active'];
  const updated = { ...kit };
  for (const f of fields) {
    if (f in body) updated[f] = body[f];
  }

  await env.CFR_DATA.put(`bleed_kit:${params.uuid}`, JSON.stringify(updated));
  return Response.json({ bleed_kit: updated });
}
