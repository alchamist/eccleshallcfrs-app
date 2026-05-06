export async function onRequestGet({ request, env, data }) {
  const { user } = data;
  const url      = new URL(request.url);
  const block_id = url.searchParams.get('block_id');
  const isCoord  = user.roles?.includes('coordinator');

  if (!block_id) return Response.json({ error: 'block_id required' }, { status: 400 });

  const { keys } = await env.CFR_DATA.list({ prefix: `rota_avail:${block_id}:` });
  const entries  = (await Promise.all(keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))))
    .filter(Boolean)
    .filter(e => isCoord || e.responder_id === user.id);

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  return Response.json({ entries });
}

export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { block_id, date, start_time, end_time, notes } = body;
  if (!block_id || !date || !start_time || !end_time) {
    return Response.json({ error: 'block_id, date, start_time, end_time required' }, { status: 400 });
  }

  const block = await env.CFR_DATA.get(`rota_block:${block_id}`, { type: 'json' });
  if (!block) return Response.json({ error: 'Block not found' }, { status: 404 });
  if (!['open', 'published'].includes(block.status)) {
    return Response.json({ error: 'Block is not open for submissions' }, { status: 409 });
  }
  if (date < block.start_date || date > block.end_date) {
    return Response.json({ error: 'Date is outside this block\'s range' }, { status: 400 });
  }

  const id    = crypto.randomUUID();
  const entry = {
    id,
    block_id,
    responder_id:   user.id,
    responder_name: user.name,
    date,
    start_time,
    end_time,
    notes:        notes || '',
    submitted_at: new Date().toISOString(),
  };

  await env.CFR_DATA.put(`rota_avail:${block_id}:${id}`, JSON.stringify(entry));
  return Response.json({ entry }, { status: 201 });
}

export async function onRequestDelete({ request, env, data }) {
  const { user } = data;
  const url      = new URL(request.url);
  const id       = url.searchParams.get('id');
  const block_id = url.searchParams.get('block_id');
  const isCoord  = user.roles?.includes('coordinator');

  if (!id || !block_id) return Response.json({ error: 'id and block_id required' }, { status: 400 });

  const entry = await env.CFR_DATA.get(`rota_avail:${block_id}:${id}`, { type: 'json' });
  if (!entry) return Response.json({ error: 'Entry not found' }, { status: 404 });

  if (!isCoord && entry.responder_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const block = await env.CFR_DATA.get(`rota_block:${block_id}`, { type: 'json' });
  if (block?.status === 'published' && !isCoord) {
    return Response.json({ error: 'Cannot remove availability after rota is published' }, { status: 409 });
  }

  await env.CFR_DATA.delete(`rota_avail:${block_id}:${id}`);
  return Response.json({ ok: true });
}
