function requireRoles(data) {
  const hasRole = data.user.roles?.includes('fire_safety_officer') || data.user.roles?.includes('coordinator');
  if (!hasRole) {
    return Response.json({ error: 'Fire Safety Officer or Coordinator role required' }, { status: 403 });
  }
  return null;
}

export async function onRequestPost({ request, env, data }) {
  const deny = requireRoles(data);
  if (deny) return deny;

  const { user } = data;
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { date, num_extinguishers, status, locations, tested_by, notes } = body;
  if (!date || !num_extinguishers || !status) {
    return Response.json({ error: 'date, num_extinguishers, and status required' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const record = {
    id,
    type: 'fire_safety_extinguisher_test',
    responder_id: user.id,
    responder_name: user.name,
    date,
    num_extinguishers,
    status,
    locations: locations || '',
    tested_by: tested_by || user.name,
    notes: notes || '',
    submitted_at: new Date().toISOString(),
  };

  await env.CFR_DATA.put(`fire_safety:extinguisher:${date}:${id}`, JSON.stringify(record));
  return Response.json({ record }, { status: 201 });
}

export async function onRequestGet({ request, env, data }) {
  const { user } = data;
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const isCoord = user.roles?.includes('coordinator') || user.roles?.includes('fire_safety_officer');

  const { keys } = await env.CFR_DATA.list({ prefix: 'fire_safety:extinguisher:' });
  const records = (await Promise.all(
    keys.sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, 200)
      .map(k => env.CFR_DATA.get(k.name, { type: 'json' }))
  ))
    .filter(Boolean)
    .filter(r => {
      if (!isCoord && r.responder_id !== user.id) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      return true;
    })
    .slice(0, limit);

  return Response.json({ items: records });
}
