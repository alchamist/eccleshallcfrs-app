const ITEM_INDEX = 'uniform_item:index';

function canManage(data) {
  const roles = data.user.roles || [];
  return roles.includes('coordinator') || roles.includes('uniform_officer');
}

// GET /api/uniform/items — list all active item types
export async function onRequestGet({ env, data }) {
  if (!canManage(data)) {
    return Response.json({ error: 'Coordinator or uniform_officer role required' }, { status: 403 });
  }
  const index = await env.CFR_DATA.get(ITEM_INDEX, { type: 'json' }) || [];
  const items = (await Promise.all(index.map(id => env.CFR_DATA.get(`uniform_item:${id}`, { type: 'json' }))))
    .filter(i => i && i.active);
  items.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  return Response.json({ items });
}

// POST /api/uniform/items — create item type
export async function onRequestPost({ request, env, data }) {
  if (!canManage(data)) {
    return Response.json({ error: 'Coordinator or uniform_officer role required' }, { status: 403 });
  }
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { name, category, sizes } = body;
  if (!name?.trim()) return Response.json({ error: 'name required' }, { status: 400 });

  const id   = crypto.randomUUID();
  const item = {
    id,
    name:       name.trim(),
    category:   category?.trim() || 'other',
    sizes:      Array.isArray(sizes) ? sizes : [],
    active:     true,
    created_at: new Date().toISOString(),
    created_by: data.user.id,
  };

  const index = await env.CFR_DATA.get(ITEM_INDEX, { type: 'json' }) || [];
  index.push(id);
  await Promise.all([
    env.CFR_DATA.put(`uniform_item:${id}`, JSON.stringify(item)),
    env.CFR_DATA.put(ITEM_INDEX, JSON.stringify(index)),
  ]);
  return Response.json({ item }, { status: 201 });
}
