function canResolve(data) {
  const roles = data.user.roles || [];
  return roles.includes('coordinator') || roles.includes('compliance');
}

export async function onRequestGet({ request, env }) {
  const url              = new URL(request.url);
  const category         = url.searchParams.get('category');
  const include_resolved = url.searchParams.get('include_resolved') === 'true';

  const prefix = category ? `defect:${category}:` : 'defect:';
  const { keys } = await env.CFR_DATA.list({ prefix });
  let defects = (await Promise.all(keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' })))).filter(Boolean);

  if (!include_resolved) defects = defects.filter(d => d.status === 'open');

  defects.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.last_reported_at.localeCompare(a.last_reported_at);
  });

  return Response.json({ defects });
}

export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { category, description, id } = body;

  if (!category || !['vehicle', 'equipment'].includes(category)) {
    return Response.json({ error: 'category must be vehicle or equipment' }, { status: 400 });
  }

  if (id) {
    const defect = await env.CFR_DATA.get(`defect:${category}:${id}`, { type: 'json' });
    if (!defect) return Response.json({ error: 'Defect not found' }, { status: 404 });
    if (defect.status === 'resolved') return Response.json({ error: 'Defect is already resolved' }, { status: 409 });

    defect.last_reported_at   = new Date().toISOString();
    defect.last_reported_by   = user.id;
    defect.last_reported_by_name = user.name || '';
    defect.report_count       = (defect.report_count || 1) + 1;

    await env.CFR_DATA.put(`defect:${category}:${id}`, JSON.stringify(defect));
    return Response.json({ defect });
  }

  if (!description?.trim()) {
    return Response.json({ error: 'description required for new defect' }, { status: 400 });
  }

  const newId = crypto.randomUUID();
  const now   = new Date().toISOString();
  const defect = {
    id:                     newId,
    category,
    description:            description.trim(),
    status:                 'open',
    report_count:           1,
    first_reported_at:      now,
    first_reported_by:      user.id,
    first_reported_by_name: user.name || '',
    last_reported_at:       now,
    last_reported_by:       user.id,
    last_reported_by_name:  user.name || '',
  };

  await env.CFR_DATA.put(`defect:${category}:${newId}`, JSON.stringify(defect));
  return Response.json({ defect }, { status: 201 });
}

export async function onRequestPatch({ request, env, data }) {
  if (!canResolve(data)) {
    return Response.json({ error: 'Coordinator or compliance role required' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, category, resolution_notes } = body;
  if (!id || !category) return Response.json({ error: 'id and category required' }, { status: 400 });

  const defect = await env.CFR_DATA.get(`defect:${category}:${id}`, { type: 'json' });
  if (!defect) return Response.json({ error: 'Defect not found' }, { status: 404 });

  defect.status           = 'resolved';
  defect.resolved_at      = new Date().toISOString();
  defect.resolved_by      = data.user.id;
  defect.resolved_by_name = data.user.name || '';
  defect.resolution_notes = resolution_notes || '';

  await env.CFR_DATA.put(`defect:${category}:${id}`, JSON.stringify(defect));
  return Response.json({ defect });
}
