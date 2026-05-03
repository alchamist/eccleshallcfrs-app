// GET /api/submissions — aggregated list across all types for coordinator view

export async function onRequestGet({ request, env, data }) {
  const { user } = data;
  const isCoord  = user.roles?.includes('coordinator');
  if (!isCoord) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }

  const url  = new URL(request.url);
  const type = url.searchParams.get('type'); // duty|vshift|vdi|claim|monthly
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');

  const prefixes = type
    ? [{ prefix: `${type}:`, t: type }]
    : [
        { prefix: 'duty:',    t: 'duty'    },
        { prefix: 'vshift:',  t: 'vshift'  },
        { prefix: 'vdi:',     t: 'vdi'     },
        { prefix: 'claim:',   t: 'claim'   },
        { prefix: 'monthly:', t: 'monthly' },
      ];

  const allRecords = (await Promise.all(
    prefixes.map(async ({ prefix, t }) => {
      const { keys } = await env.CFR_DATA.list({ prefix });
      const relevant = keys
        .filter(k => k.name !== 'vshift:active')
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, 100);
      const records = (await Promise.all(relevant.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))))
        .filter(Boolean)
        .map(r => ({ ...r, type: t }));
      return records;
    })
  )).flat();

  const filtered = allRecords
    .filter(r => {
      const d = r.date || r.check_month || r.start_datetime?.slice(0, 10);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    })
    .sort((a, b) => {
      const da = a.date || a.check_month || a.start_datetime?.slice(0, 10) || '';
      const db = b.date || b.check_month || b.start_datetime?.slice(0, 10) || '';
      return db.localeCompare(da);
    })
    .slice(0, 200)
    .map(r => ({
      ...r,
      date: r.date || r.check_month || r.start_datetime?.slice(0, 10) || null,
    }));

  return Response.json({ items: filtered });
}
