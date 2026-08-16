// GET /api/monthly-check/latest — returns the most recent monthly check record

export async function onRequestGet({ env, data }) {
  const roles = data.user.roles || [];
  if (!roles.includes('coordinator') && !roles.includes('compliance')) {
    return Response.json({ error: 'Coordinator or compliance role required' }, { status: 403 });
  }

  const { keys } = await env.CFR_DATA.list({ prefix: 'monthly:', limit: 1 });
  // KV list returns keys sorted lexicographically; for monthly:{YYYY-MM}:{uuid} the most
  // recent month sorts last — we need to sort descending and take the first.
  // Re-list without limit to sort properly (monthly checks are infrequent, typically ≤24/year).
  const all = await env.CFR_DATA.list({ prefix: 'monthly:', limit: 50 });
  all.keys.sort((a, b) => b.name.localeCompare(a.name));

  if (!all.keys.length) return Response.json({ check: null });

  const check = await env.CFR_DATA.get(all.keys[0].name, { type: 'json' });
  return Response.json({ check });
}
