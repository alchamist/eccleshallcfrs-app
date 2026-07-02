const VALID_TYPES = ['mot', 'service', 'insurance', 'deep_clean'];

export async function onRequestGet({ env, data }) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  const { keys } = await env.CFR_DATA.list({ prefix: 'maintenance_log:' });
  keys.sort((a, b) => b.name.localeCompare(a.name));
  const entries = (await Promise.all(keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' })))).filter(Boolean);
  return Response.json({ entries });
}

export async function onRequestPost({ env, data, request }) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { type, done_at, notes, mileage } = body;
  if (!type || !VALID_TYPES.includes(type)) return Response.json({ error: 'Invalid type' }, { status: 400 });
  if (!done_at) return Response.json({ error: 'done_at required' }, { status: 400 });

  const entry = {
    id:          crypto.randomUUID(),
    type,
    done_at,
    notes:       notes || '',
    mileage:     mileage != null ? Number(mileage) : null,
    recorded_by: data.user.id,
    recorded_at: new Date().toISOString(),
  };
  await env.CFR_DATA.put(`maintenance_log:${done_at}:${entry.id}`, JSON.stringify(entry));
  return Response.json({ entry }, { status: 201 });
}
