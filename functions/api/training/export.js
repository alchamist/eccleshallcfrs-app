// GET /api/training/export?from=YYYY-MM-DD&to=YYYY-MM-DD — coordinator only
// Returns a CSV of all training records in the date range.

export async function onRequestGet({ request, env, data }) {
  const { user } = data;
  if (!user.roles?.includes('coordinator')) {
    return new Response('Forbidden', { status: 403 });
  }

  const url  = new URL(request.url);
  const from = url.searchParams.get('from') || '';
  const to   = url.searchParams.get('to')   || '';

  const { keys } = await env.CFR_DATA.list({ prefix: 'training:' });
  let entries = (await Promise.all(keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' })))).filter(Boolean);

  if (from) entries = entries.filter(e => e.date >= from);
  if (to)   entries = entries.filter(e => e.date <= to);
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.user_name.localeCompare(b.user_name));

  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cols = ['Date', 'Name', 'PRF', 'Hours', 'Type', 'Description', 'Recorded By'];
  const rows = entries.map(e => [
    e.date, e.user_name, e.prf_number || '', e.hours,
    e.type, e.description || '', e.recorded_by_name || '',
  ].map(escape).join(','));

  const csv  = [cols.join(','), ...rows].join('\r\n');
  const name = `training-${from || 'all'}-to-${to || 'all'}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
