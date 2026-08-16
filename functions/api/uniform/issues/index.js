const ISSUE_INDEX = 'uniform_issue:index';

function canManage(data) {
  const roles = data.user.roles || [];
  return roles.includes('coordinator') || roles.includes('uniform_officer');
}

// GET /api/uniform/issues?responder_id=&status= — list issues (filterable)
export async function onRequestGet({ request, env, data }) {
  if (!canManage(data)) {
    return Response.json({ error: 'Coordinator or uniform_officer role required' }, { status: 403 });
  }
  const url    = new URL(request.url);
  const byUser = url.searchParams.get('responder_id');
  const byStatus = url.searchParams.get('status');

  const index  = await env.CFR_DATA.get(ISSUE_INDEX, { type: 'json' }) || [];
  let issues = (await Promise.all(
    index.map(id => env.CFR_DATA.get(`uniform_issue:index:${id}`, { type: 'json' }))
  )).filter(Boolean);

  if (byUser)   issues = issues.filter(i => i.responder_id === byUser || byUser === 'self' && i.responder_id === data.user.id);
  if (byStatus) issues = issues.filter(i => i.status === byStatus);

  issues.sort((a, b) => b.date_issued.localeCompare(a.date_issued));
  return Response.json({ issues });
}

// POST /api/uniform/issues — record a new issue
export async function onRequestPost({ request, env, data }) {
  if (!canManage(data)) {
    return Response.json({ error: 'Coordinator or uniform_officer role required' }, { status: 403 });
  }
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { item_uuid, responder_id, responder_name, size, quantity, date_issued, condition_at_issue, notes } = body;
  if (!item_uuid || !responder_id || !responder_name || !date_issued) {
    return Response.json({ error: 'item_uuid, responder_id, responder_name, date_issued required' }, { status: 400 });
  }

  // Verify item exists
  const item = await env.CFR_DATA.get(`uniform_item:${item_uuid}`, { type: 'json' });
  if (!item || !item.active) return Response.json({ error: 'Item not found or inactive' }, { status: 404 });

  const id    = crypto.randomUUID();
  const issue = {
    id,
    item_uuid,
    item_name:        item.name,
    responder_id,
    responder_name,
    size:             size || null,
    quantity:         quantity ? parseInt(quantity) : 1,
    date_issued,
    issued_by_name:   data.user.name,
    condition_at_issue: condition_at_issue || 'new',
    notes:            notes || '',
    status:           'issued',
    created_at:       new Date().toISOString(),
  };

  const index = await env.CFR_DATA.get(ISSUE_INDEX, { type: 'json' }) || [];
  index.push(id);

  await Promise.all([
    env.CFR_DATA.put(`uniform_issue:${date_issued}:${id}`, JSON.stringify(issue)),
    env.CFR_DATA.put(`uniform_issue:index:${id}`, JSON.stringify({ ...issue, _kv_key: `uniform_issue:${date_issued}:${id}` })),
    env.CFR_DATA.put(ISSUE_INDEX, JSON.stringify(index)),
  ]);

  return Response.json({ issue }, { status: 201 });
}
