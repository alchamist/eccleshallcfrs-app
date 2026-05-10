export async function onRequestGet({ env, data }) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }

  const { keys } = await env.CFR_DATA.list({ prefix: 'audit_login:' });

  // Most recent first — keys are ISO-prefixed so reverse lexicographic = newest first
  keys.sort((a, b) => b.name.localeCompare(a.name));
  const recent = keys.slice(0, 200);

  const entries = (await Promise.all(
    recent.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))
  )).filter(Boolean);

  return Response.json({ entries });
}
