// POST /api/duty-hours   — submit individual duty log
// GET  /api/duty-hours   — list (own for responder, all for coordinator)

export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const required = ['shift_start', 'shift_end', 'date'];
  for (const f of required) {
    if (!body[f]) return Response.json({ error: `${f} required` }, { status: 400 });
  }

  const id  = crypto.randomUUID();
  const now = new Date().toISOString();

  const record = {
    id,
    responder_id:        user.id,
    responder_name:      user.name,
    date:                body.date,
    shift_start:         body.shift_start,
    shift_end:           body.shift_end,
    duration_mins:       body.duration_mins ?? 0,
    incidents_attended:  body.incidents_attended ?? 0,
    incidents_allocated: body.incidents_allocated ?? 0,
    submitted_at:        now,
    type:                'duty',
  };

  await env.CFR_DATA.put(`duty:${body.date}:${id}`, JSON.stringify(record));
  await invalidateStatsCache(env);

  return Response.json({ record }, { status: 201 });
}

export async function onRequestGet({ request, env, data }) {
  const { user } = data;
  const url      = new URL(request.url);
  const from     = url.searchParams.get('from');
  const to       = url.searchParams.get('to');
  const limit    = parseInt(url.searchParams.get('limit') || '50');
  const isCoord  = user.roles?.includes('coordinator');

  const { keys } = await env.CFR_DATA.list({ prefix: 'duty:' });
  const sorted   = keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 200);

  const records = (await Promise.all(sorted.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))))
    .filter(Boolean)
    .filter(r => {
      if (!isCoord && r.responder_id !== user.id) return false;
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      return true;
    })
    .slice(0, limit);

  return Response.json({ items: records });
}

async function invalidateStatsCache(env) {
  await env.CFR_DATA.delete('stats:cache').catch(() => {});
}
