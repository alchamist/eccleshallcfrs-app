function canReadDefibs(user, features) {
  const roles = user.roles || [];
  if (roles.includes('coordinator') || roles.includes('defib_manager')) return true;
  if (roles.includes('compliance') && features?.defib_compliance_report) return true;
  return false;
}

export async function onRequestGet({ env, data }) {
  const { user } = data;
  const features = await env.CFR_DATA.get('config:features', { type: 'json' }) || {};
  if (!canReadDefibs(user, features)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const indexRaw = await env.CFR_DATA.get('defibs:index', { type: 'json' });
  const uuids = indexRaw || [];
  const defibs = (await Promise.all(
    uuids.map(id => env.CFR_DATA.get(`defib:${id}`, { type: 'json' }))
  )).filter(Boolean);

  // For each defib, attach the most recent check summary
  const withLastCheck = await Promise.all(defibs.map(async d => {
    const { keys } = await env.CFR_DATA.list({ prefix: `defib_check:` });
    const relevant = keys
      .filter(k => k.metadata?.defib_uuid === d.uuid || k.name.includes(d.uuid))
      .sort((a, b) => b.name.localeCompare(a.name));
    let last_check = null;
    if (relevant.length) {
      last_check = await env.CFR_DATA.get(relevant[0].name, { type: 'json' });
    }
    return { ...d, last_check };
  }));

  return Response.json({ defibs: withLastCheck });
}

export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  if (!(user.roles || []).includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
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
  const defib = {
    uuid,
    group_id:             group_id.trim(),
    location:             location.trim(),
    make:                 body.make?.trim()             || '',
    model:                body.model?.trim()            || '',
    serial_number:        body.serial_number?.trim()    || '',
    case_lock_code:       body.case_lock_code?.trim()   || '',
    installation_date:    body.installation_date        || null,
    responsible_person:   body.responsible_person?.trim() || '',
    contact_number:       body.contact_number?.trim()   || '',
    registered_on_circuit: Boolean(body.registered_on_circuit),
    active: true,
    created_at: new Date().toISOString(),
  };

  const index = await env.CFR_DATA.get('defibs:index', { type: 'json' }) || [];
  index.push(uuid);
  await Promise.all([
    env.CFR_DATA.put(`defib:${uuid}`, JSON.stringify(defib)),
    env.CFR_DATA.put('defibs:index', JSON.stringify(index)),
  ]);

  return Response.json({ defib }, { status: 201 });
}
