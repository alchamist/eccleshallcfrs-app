function requireCoordinator(data) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  return null;
}

export async function onRequestGet({ env, data }) {
  const { user } = data;
  const isCoord = user.roles?.includes('coordinator');

  const index  = await env.CFR_DATA.get('rota_blocks:index', { type: 'json' }) || [];
  const blocks = (await Promise.all(
    index.map(id => env.CFR_DATA.get(`rota_block:${id}`, { type: 'json' }))
  )).filter(Boolean);

  const visible = isCoord ? blocks : blocks.filter(b => ['open', 'published'].includes(b.status));
  visible.sort((a, b) => b.start_date.localeCompare(a.start_date));

  return Response.json({ blocks: visible });
}

export async function onRequestPost({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { start_date, end_date, notes } = body;
  if (!start_date || !end_date) {
    return Response.json({ error: 'start_date and end_date required' }, { status: 400 });
  }
  if (end_date < start_date) {
    return Response.json({ error: 'end_date must be after start_date' }, { status: 400 });
  }

  const id    = crypto.randomUUID();
  const block = {
    id,
    start_date,
    end_date,
    status:     'draft',
    notes:      notes || '',
    created_by: data.user.id,
    created_at: new Date().toISOString(),
  };

  await env.CFR_DATA.put(`rota_block:${id}`, JSON.stringify(block));

  const index = await env.CFR_DATA.get('rota_blocks:index', { type: 'json' }) || [];
  index.push(id);
  await env.CFR_DATA.put('rota_blocks:index', JSON.stringify(index));

  return Response.json({ block }, { status: 201 });
}

export async function onRequestDelete({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const block = await env.CFR_DATA.get(`rota_block:${id}`, { type: 'json' });
  if (!block) return Response.json({ error: 'Block not found' }, { status: 404 });
  if (block.status !== 'draft') {
    return Response.json({ error: 'Only draft blocks can be deleted.' }, { status: 409 });
  }

  await env.CFR_DATA.delete(`rota_block:${id}`);

  const index = (await env.CFR_DATA.get('rota_blocks:index', { type: 'json' }) || [])
    .filter(i => i !== id);
  await env.CFR_DATA.put('rota_blocks:index', JSON.stringify(index));

  return Response.json({ ok: true });
}

export async function onRequestPatch({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, status, start_date, end_date, notes } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const block = await env.CFR_DATA.get(`rota_block:${id}`, { type: 'json' });
  if (!block) return Response.json({ error: 'Block not found' }, { status: 404 });

  const VALID = ['draft', 'open', 'published', 'closed'];
  if (status && !VALID.includes(status)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 });
  }

  if (status)               block.status     = status;
  if (start_date)           block.start_date = start_date;
  if (end_date)             block.end_date   = end_date;
  if (notes !== undefined)  block.notes      = notes;
  block.updated_at = new Date().toISOString();
  block.updated_by = data.user.id;

  await env.CFR_DATA.put(`rota_block:${id}`, JSON.stringify(block));
  return Response.json({ block });
}
