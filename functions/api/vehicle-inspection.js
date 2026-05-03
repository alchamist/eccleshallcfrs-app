// POST /api/vehicle-inspection   — submit daily VDI
// GET  /api/vehicle-inspection   — list (all for coordinator/compliance, own for responder)

export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.date) return Response.json({ error: 'date required' }, { status: 400 });

  const id     = crypto.randomUUID();
  const record = {
    id,
    type:               'vdi',
    completed_by_id:    user.id,
    completed_by_name:  user.name,
    date:               body.date,
    vehicle:            'RC0681',
    starting_mileage:   body.starting_mileage ?? null,
    fuel_level:         body.fuel_level ?? null,
    oil_level:          body.oil_level ?? null,
    checks:             body.checks ?? {},
    defects_notes:      body.defects_notes ?? '',
    overall_pass:       body.overall_pass ?? true,
    submitted_at:       new Date().toISOString(),
  };

  await env.CFR_DATA.put(`vdi:${body.date}:${id}`, JSON.stringify(record));
  await env.CFR_DATA.delete('stats:cache').catch(() => {});

  return Response.json({ record }, { status: 201 });
}

export async function onRequestGet({ request, env, data }) {
  const { user } = data;
  const url      = new URL(request.url);
  const from     = url.searchParams.get('from');
  const to       = url.searchParams.get('to');
  const limit    = parseInt(url.searchParams.get('limit') || '50');

  const canViewAll = user.roles?.includes('coordinator') || user.roles?.includes('compliance');

  const { keys } = await env.CFR_DATA.list({ prefix: 'vdi:' });
  const sorted   = keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 200);

  const records = (await Promise.all(sorted.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))))
    .filter(Boolean)
    .filter(r => {
      if (!canViewAll && r.completed_by_id !== user.id) return false;
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      return true;
    })
    .slice(0, limit);

  return Response.json({ items: records });
}
