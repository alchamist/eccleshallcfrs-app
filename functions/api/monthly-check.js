// POST /api/monthly-check   — submit monthly load list check
// GET  /api/monthly-check   — list (coordinator/compliance only)

export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.check_month) {
    return Response.json({ error: 'check_month required' }, { status: 400 });
  }

  const id     = crypto.randomUUID();
  const record = {
    id,
    type:               'monthly',
    completed_by_id:    user.id,
    completed_by_name:  user.name,
    check_month:        body.check_month,
    vehicle:            'RC0681',
    items:              body.items ?? {},
    notes:              body.notes ?? '',
    overall_pass:       body.overall_pass ?? true,
    submitted_at:       new Date().toISOString(),
  };

  await env.CFR_DATA.put(`monthly:${body.check_month}:${id}`, JSON.stringify(record));

  return Response.json({ record }, { status: 201 });
}

export async function onRequestGet({ request, env, data }) {
  const { user } = data;
  const canView  = user.roles?.includes('coordinator') || user.roles?.includes('compliance');
  if (!canView) {
    return Response.json({ error: 'Coordinator or compliance role required' }, { status: 403 });
  }

  const url   = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '12');

  const { keys } = await env.CFR_DATA.list({ prefix: 'monthly:' });
  const sorted   = keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, limit);

  const records = (await Promise.all(sorted.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))))
    .filter(Boolean);

  return Response.json({ items: records });
}
