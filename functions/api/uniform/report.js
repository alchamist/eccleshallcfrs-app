function canView(data) {
  const roles = data.user.roles || [];
  return roles.includes('coordinator') || roles.includes('uniform_officer');
}

// GET /api/uniform/report — summary stats for coordinator/uniform_officer
export async function onRequestGet({ env, data }) {
  if (!canView(data)) {
    return Response.json({ error: 'Coordinator or uniform_officer role required' }, { status: 403 });
  }

  const index = await env.CFR_DATA.get('uniform_issue:index', { type: 'json' }) || [];
  const issues = (await Promise.all(
    index.map(id => env.CFR_DATA.get(`uniform_issue:index:${id}`, { type: 'json' }))
  )).filter(Boolean);

  const total          = issues.length;
  const issued         = issues.filter(i => i.status === 'issued').length;
  const acknowledged   = issues.filter(i => i.status === 'acknowledged').length;
  const returned       = issues.filter(i => i.status === 'returned').length;
  const outstanding    = issued + acknowledged; // not yet returned

  return Response.json({ report: { total, issued, acknowledged, returned, outstanding } });
}
