// GET /api/reports/monthly?year=YYYY&month=MM — monthly activity report (coordinator only)

export async function onRequestGet({ request, env, data }) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }

  const url  = new URL(request.url);
  const now  = new Date();
  const year = url.searchParams.get('year')  || String(now.getFullYear());
  const mm   = (url.searchParams.get('month') || String(now.getMonth() + 1)).padStart(2, '0');
  const dp   = `${year}-${mm}-`; // date prefix

  const [
    { keys: dutyKeys },
    { keys: claimKeys },
    { keys: vshiftKeys },
    userIndex,
  ] = await Promise.all([
    env.CFR_DATA.list({ prefix: `duty:${dp}` }),
    env.CFR_DATA.list({ prefix: `claim:${dp}` }),
    env.CFR_DATA.list({ prefix: `vshift:${dp}` }),
    env.CFR_USERS.get('users:index', { type: 'json' }),
  ]);

  const [dutyRecords, claimRecords, shiftRecords, rawUsers] = await Promise.all([
    fetchAll(env.CFR_DATA, dutyKeys),
    fetchAll(env.CFR_DATA, claimKeys),
    fetchAll(env.CFR_DATA, vshiftKeys.filter(k => k.name !== 'vshift:active')),
    userIndex
      ? Promise.all(userIndex.map(k => env.CFR_USERS.get(`user:${k}`, { type: 'json' })))
      : Promise.resolve([]),
  ]);

  const activeUsers = rawUsers.filter(Boolean).filter(u => u.active);

  // ── Per-responder duty hours ──────────────────────────────────────────────
  // Start with all active users at zero so everyone appears in the table
  const rMap = new Map(
    activeUsers.map(u => [u.id, {
      id: u.id, name: u.name,
      duty_mins: 0, duty_logs: 0,
      incidents_attended: 0, incidents_allocated: 0,
    }])
  );

  for (const d of dutyRecords) {
    if (!rMap.has(d.responder_id)) {
      rMap.set(d.responder_id, {
        id: d.responder_id, name: d.responder_name,
        duty_mins: 0, duty_logs: 0,
        incidents_attended: 0, incidents_allocated: 0,
      });
    }
    const r = rMap.get(d.responder_id);
    r.duty_mins           += d.duration_mins || 0;
    r.duty_logs++;
    r.incidents_attended  += d.incidents_attended  || 0;
    r.incidents_allocated += d.incidents_allocated || 0;
  }

  const responders = Array.from(rMap.values())
    .map(r => ({ ...r, duty_hours: Math.round(r.duty_mins / 6) / 10 }))
    .sort((a, b) => b.duty_mins - a.duty_mins);

  // ── Vehicle shifts ────────────────────────────────────────────────────────
  const completed = shiftRecords.filter(s => s.status === 'completed');
  let vehicleMins = 0;
  let totalJobs   = 0;
  for (const s of completed) {
    if (s.start_datetime && s.end_datetime) {
      vehicleMins += Math.round((new Date(s.end_datetime) - new Date(s.start_datetime)) / 60000);
    }
    totalJobs += s.number_of_jobs || 0;
  }

  // ── Incident breakdowns (claims where incident is not N/A) ────────────────
  const incidents = claimRecords.filter(c => c.incident_type !== 'na');

  return Response.json({
    period: { year, month: mm },
    responders,
    vehicle: {
      shifts:        completed.length,
      hours_on_duty: Math.round(vehicleMins / 6) / 10,
      total_jobs:    totalJobs,
    },
    incidents: {
      total:       incidents.length,
      by_category: tally(incidents, 'call_category'),
      by_type:     tally(incidents, 'incident_type'),
      by_age:      tally(incidents, 'patient_age'),
      by_location: tally(incidents, 'incident_location'),
    },
  });
}

function tally(records, field) {
  const counts = {};
  for (const r of records) {
    const val = r[field];
    if (!val || val === 'unknown' && field === 'incident_location') {
      // still count unknown/missing for non-location fields
    }
    if (val) counts[val] = (counts[val] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([, a], [, b]) => b - a));
}

async function fetchAll(kv, keys) {
  return (await Promise.all(keys.map(k => kv.get(k.name, { type: 'json' })))).filter(Boolean);
}
