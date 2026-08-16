// GET /api/rota/availability/summary — coordinator only
// Returns availability slots grouped by date for today through today+7 days.

export async function onRequestGet({ env, data }) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end   = new Date(today); end.setDate(end.getDate() + 7);

  const todayStr = today.toISOString().slice(0, 10);
  const endStr   = end.toISOString().slice(0, 10);

  // List all rota availability records (block_id is part of key, so prefix-by-date is not possible)
  const { keys } = await env.CFR_DATA.list({ prefix: 'rota_avail:', limit: 1000 });

  const records = (await Promise.all(
    keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))
  )).filter(r => r && r.date >= todayStr && r.date <= endStr);

  // Group by date
  const byDate = {};
  for (const r of records) {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push({ name: r.responder_name, start: r.start_time, end: r.end_time, notes: r.notes || '' });
  }

  // Build ordered day array (today through today+7)
  const days = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    days.push({ date: ds, slots: (byDate[ds] || []).sort((a, b) => (a.start || '').localeCompare(b.start || '')) });
  }

  return Response.json({ days });
}
