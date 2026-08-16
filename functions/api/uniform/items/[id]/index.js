function canManage(data) {
  const roles = data.user.roles || [];
  return roles.includes('coordinator') || roles.includes('uniform_officer');
}

// PATCH /api/uniform/items/:id — edit or deactivate item type
export async function onRequestPatch({ request, env, data, params }) {
  if (!canManage(data)) {
    return Response.json({ error: 'Coordinator or uniform_officer role required' }, { status: 403 });
  }
  const { id } = params;
  const item = await env.CFR_DATA.get(`uniform_item:${id}`, { type: 'json' });
  if (!item) return Response.json({ error: 'Not found' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.name     !== undefined) item.name     = body.name.trim();
  if (body.category !== undefined) item.category = body.category.trim();
  if (body.sizes    !== undefined) item.sizes    = body.sizes;
  if (body.active   !== undefined) item.active   = body.active;
  item.updated_at = new Date().toISOString();
  item.updated_by = data.user.id;

  await env.CFR_DATA.put(`uniform_item:${id}`, JSON.stringify(item));
  return Response.json({ item });
}
