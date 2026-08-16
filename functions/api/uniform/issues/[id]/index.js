function canManage(data) {
  const roles = data.user.roles || [];
  return roles.includes('coordinator') || roles.includes('uniform_officer');
}

async function getIssue(env, id) {
  return env.CFR_DATA.get(`uniform_issue:index:${id}`, { type: 'json' });
}

// PATCH /api/uniform/issues/:id — update issue (return, status change)
export async function onRequestPatch({ request, env, data, params }) {
  if (!canManage(data)) {
    return Response.json({ error: 'Coordinator or uniform_officer role required' }, { status: 403 });
  }
  const { id } = params;
  const issue = await getIssue(env, id);
  if (!issue) return Response.json({ error: 'Not found' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.status !== undefined) issue.status = body.status;
  if (body.notes  !== undefined) issue.notes  = body.notes;

  if (body.status === 'returned') {
    const ret = {
      issue_uuid:          id,
      returned_at:         new Date().toISOString(),
      received_by_name:    data.user.name,
      condition_at_return: body.condition_at_return || 'good',
    };
    issue.return_record = ret;
    await env.CFR_DATA.put(`uniform_return:${id}`, JSON.stringify(ret));
  }

  issue.updated_at = new Date().toISOString();
  await env.CFR_DATA.put(`uniform_issue:index:${id}`, JSON.stringify(issue));
  if (issue._kv_key) {
    const stored = await env.CFR_DATA.get(issue._kv_key, { type: 'json' });
    if (stored) await env.CFR_DATA.put(issue._kv_key, JSON.stringify({ ...stored, ...issue }));
  }

  return Response.json({ issue });
}
