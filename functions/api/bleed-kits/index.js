function canReadBleedKits(user, features) {
  const roles = user.roles || [];
  if (roles.includes('coordinator') || roles.includes('defib_manager')) return true;
  if (roles.includes('compliance') && features?.defib_compliance_report) return true;
  return false;
}

export async function onRequestGet({ env, data }) {
  const { user } = data;
  const features = await env.CFR_DATA.get('config:features', { type: 'json' }) || {};
  if (!canReadBleedKits(user, features)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const index = await env.CFR_DATA.get('bleed_kits:index', { type: 'json' }) || [];
  const kits = (await Promise.all(
    index.map(id => env.CFR_DATA.get(`bleed_kit:${id}`, { type: 'json' }))
  )).filter(Boolean);

  const withLastCheck = await Promise.all(kits.map(async k => {
    const { keys } = await env.CFR_DATA.list({ prefix: 'bleed_kit_check:' });
    const relevant = keys
      .filter(key => key.metadata?.bleed_kit_uuid === k.uuid || key.name.includes(k.uuid))
      .sort((a, b) => b.name.localeCompare(a.name));
    let last_check = null;
    if (relevant.length) {
      last_check = await env.CFR_DATA.get(relevant[0].name, { type: 'json' });
    }
    return { ...k, last_check };
  }));

  return Response.json({ bleed_kits: withLastCheck });
}

export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  const roles = user.roles || [];
  if (!roles.includes('coordinator') && !roles.includes('defib_manager')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { group_id, location } = body;
  if (!group_id || !location) {
    return Response.json({ error: 'group_id and location are required' }, { status: 400 });
  }

  const uuid = crypto.randomUUID();
  const kit = {
    uuid,
    group_id:           group_id.trim(),
    location:           location.trim(),
    cabinet_lock_code:  body.cabinet_lock_code?.trim() || '',
    responsible_person: body.responsible_person?.trim() || '',
    contact_number:     body.contact_number?.trim()    || '',
    active: true,
    created_at: new Date().toISOString(),
  };

  const index = await env.CFR_DATA.get('bleed_kits:index', { type: 'json' }) || [];
  index.push(uuid);
  await Promise.all([
    env.CFR_DATA.put(`bleed_kit:${uuid}`, JSON.stringify(kit)),
    env.CFR_DATA.put('bleed_kits:index', JSON.stringify(index)),
  ]);

  return Response.json({ bleed_kit: kit }, { status: 201 });
}
