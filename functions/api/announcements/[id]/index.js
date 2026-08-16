function requireCoordinator(data) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  return null;
}

async function getRecord(env, id) {
  return env.CFR_DATA.get(`announcement:active:${id}`, { type: 'json' });
}

async function removeFromIndex(env, id) {
  const index = await env.CFR_DATA.get('announcement:active', { type: 'json' }) || [];
  const updated = index.filter(i => i !== id);
  await env.CFR_DATA.put('announcement:active', JSON.stringify(updated));
}

// PATCH — update title/body/expires_at (coordinator only)
export async function onRequestPatch({ request, env, data, params }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  const { id } = params;
  const record = await getRecord(env, id);
  if (!record) return Response.json({ error: 'Not found' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.title !== undefined)       record.title      = body.title.trim();
  if (body.announcement_body !== undefined) record.body  = body.announcement_body.trim();
  if (body.expires_at !== undefined)  record.expires_at = body.expires_at || null;
  record.updated_at = new Date().toISOString();

  await env.CFR_DATA.put(`announcement:active:${id}`, JSON.stringify(record));
  if (record._kv_key) {
    const stored = await env.CFR_DATA.get(record._kv_key, { type: 'json' });
    if (stored) await env.CFR_DATA.put(record._kv_key, JSON.stringify({ ...stored, ...record }));
  }

  return Response.json({ announcement: record });
}

// DELETE — deactivate announcement (coordinator only)
export async function onRequestDelete({ env, data, params }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  const { id } = params;
  const record = await getRecord(env, id);
  if (!record) return Response.json({ error: 'Not found' }, { status: 404 });

  record.active = false;
  record.deleted_at = new Date().toISOString();

  await Promise.all([
    env.CFR_DATA.put(`announcement:active:${id}`, JSON.stringify(record)),
    removeFromIndex(env, id),
  ]);

  return Response.json({ ok: true });
}
