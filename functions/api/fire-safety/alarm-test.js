export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { date, status, notes } = body;
  if (!date || !status) {
    return Response.json({ error: 'date and status required' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const record = {
    id,
    type: 'fire_safety_alarm_test',
    responder_id: user.id,
    responder_name: user.name,
    date,
    status,
    notes: notes || '',
    submitted_at: new Date().toISOString(),
  };

  await env.CFR_DATA.put(`fire_safety:alarm:${date}:${id}`, JSON.stringify(record));
  return Response.json({ record }, { status: 201 });
}

export async function onRequestGet({ request, env, data }) {
  const { user } = data;
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const isCoord = user.roles?.includes('coordinator') || user.roles?.includes('fire_safety_officer');

  const { keys } = await env.CFR_DATA.list({ prefix: 'fire_safety:alarm:' });
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
