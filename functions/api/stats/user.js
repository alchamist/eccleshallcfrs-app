// GET /api/stats/user?id=xxx — per-responder stats for dashboard

export async function onRequestGet({ request, env, data }) {
  const { user }    = data;
  const url         = new URL(request.url);
  const requestedId = url.searchParams.get('id') || user.id;

  // Responders can only view their own; coordinator can view any
  if (requestedId !== user.id && !user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now       = new Date();
  const year      = now.getFullYear();
  const month     = String(now.getMonth() + 1).padStart(2, '0');
  const ytdPfx    = `${year}-`;
  const monthPfx  = `${year}-${month}-`;

  const [dutyKeys, claimKeys] = await Promise.all([
    env.CFR_DATA.list({ prefix: 'duty:' }),
    env.CFR_DATA.list({ prefix: 'claim:' }),
  ]);

  const [dutyRecords, claimRecords] = await Promise.all([
    fetchOwn(env.CFR_DATA, dutyKeys.keys,  'responder_id', requestedId),
    fetchOwn(env.CFR_DATA, claimKeys.keys, 'responder_id', requestedId),
  ]);

  const dutyYTD    = dutyRecords.filter(d => d.date?.startsWith(ytdPfx));
  const dutyMonth  = dutyRecords.filter(d => d.date?.startsWith(monthPfx));
  const claimYTD   = claimRecords.filter(c => c.date?.startsWith(ytdPfx));
  const claimMonth = claimRecords.filter(c => c.date?.startsWith(monthPfx));

  return Response.json({
    duty_mins_month:    dutyMonth.reduce((s, d) => s + (d.duration_mins || 0), 0),
    duty_mins_ytd:      dutyYTD.reduce((s, d) => s + (d.duration_mins || 0), 0),
    incidents_month:    claimMonth.filter(c => c.incident_type !== 'na').length,
    incidents_ytd:      claimYTD.filter(c => c.incident_type !== 'na').length,
    total_miles_ytd:    claimYTD.reduce((s, c) => s + (c.total_miles || 0), 0),
  });
}

async function fetchOwn(kv, keys, field, id) {
  const sorted = keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 500);
  const all    = (await Promise.all(sorted.map(k => kv.get(k.name, { type: 'json' })))).filter(Boolean);
  return all.filter(r => r[field] === id);
}
