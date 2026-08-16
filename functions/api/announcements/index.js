const ACTIVE_KEY = 'announcement:active';

function requireCoordinator(data) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  return null;
}

// GET — all active announcements (all authenticated users)
export async function onRequestGet({ env }) {
  const index = await env.CFR_DATA.get(ACTIVE_KEY, { type: 'json' }) || [];
  const announcements = (await Promise.all(
    index.map(id => env.CFR_DATA.get(`announcement:active:${id}`, { type: 'json' }))
  )).filter(Boolean);

  // Filter by expires_at and active flag
  const now = new Date().toISOString();
  const active = announcements.filter(a => a.active && (!a.expires_at || a.expires_at > now));

  return Response.json({ announcements: active });
}

// POST — create announcement (coordinator only)
export async function onRequestPost({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, announcement_body, expires_at } = body;
  if (!title?.trim() || !announcement_body?.trim()) {
    return Response.json({ error: 'title and body are required' }, { status: 400 });
  }

  const id  = crypto.randomUUID();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const kvKey = `announcement:${dateStr}:${id}`;

  const record = {
    id,
    title:            title.trim(),
    body:             announcement_body.trim(),
    created_by_name:  data.user.name,
    created_at:       now.toISOString(),
    expires_at:       expires_at || null,
    active:           true,
  };

  const index = await env.CFR_DATA.get(ACTIVE_KEY, { type: 'json' }) || [];
  index.push(id);

  await Promise.all([
    env.CFR_DATA.put(kvKey, JSON.stringify(record)),
    // Lookup key for the active index (stores id → full kv key mapping)
    env.CFR_DATA.put(`announcement:active:${id}`, JSON.stringify({ ...record, _kv_key: kvKey })),
    env.CFR_DATA.put(ACTIVE_KEY, JSON.stringify(index)),
  ]);

  return Response.json({ announcement: record }, { status: 201 });
}
