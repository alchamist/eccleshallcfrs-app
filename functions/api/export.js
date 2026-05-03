// CSV export for coordinator — mileage claims and duty hours

function requireCoordinator(data) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  return null;
}

export async function onRequestGet({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  const url  = new URL(request.url);
  const type = url.searchParams.get('type');
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');
  const rid  = url.searchParams.get('responder_id');

  if (type === 'mileage-claims') return exportMileageClaims(env, from, to, rid);
  if (type === 'duty-hours')     return exportDutyHours(env, from, to);
  return Response.json({ error: 'Unknown export type' }, { status: 400 });
}

async function exportMileageClaims(env, from, to, responder_id) {
  const { keys } = await env.CFR_DATA.list({ prefix: 'claim:' });
  const records  = (await Promise.all(
    keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))
  )).filter(Boolean);

  const filtered = records.filter(r => {
    if (from && r.date < from) return false;
    if (to   && r.date > to)   return false;
    if (responder_id && r.responder_id !== responder_id) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const CATEGORY_LABELS = {
    cat1: 'Category 1', cat2: 'Category 2', cat3: 'Category 3', cat4: 'Category 4',
    unknown: 'Unknown', backup: 'Backup', movement: 'Movement/Travel only',
  };
  const INCIDENT_LABELS = {
    cardiac_arrest: 'Cardiac Arrest', unconscious: 'Unconscious/Not Responding',
    breathing_difficulty: 'Breathing Difficulty/Asthma/COPD',
    anaphylaxis: 'Anaphylaxis', rtc: 'Road Traffic Collision', trauma: 'Trauma',
    chest_pain: 'Chest Pain', fall: 'Fall', stroke: 'Stroke/TIA/Neurological',
    mental_health: 'Mental Health', concern_welfare: 'Concern for Welfare',
    sepsis: 'Sepsis', major_incident: 'Major Incident', other: 'Other', na: 'Not Applicable',
  };
  const AGE_LABELS = { adult: 'Adult', paediatric: 'Paediatric', unknown: 'Unknown', na: 'Not Applicable' };

  const cols = [
    'Responder Name', 'Callsign', 'Date', 'Call Out Time', 'WMAS Job Number',
    'Call Category', 'Patient Age', 'Incident Type', 'Journey Details',
    'Total Miles', 'Comments',
  ];

  const rows = filtered.map(r => [
    r.responder_name   || '',
    r.callsign         || '',
    r.date             || '',
    r.callout_time     || '',
    r.job_number       || '',
    CATEGORY_LABELS[r.call_category] || r.call_category || '',
    AGE_LABELS[r.patient_age]        || r.patient_age   || '',
    INCIDENT_LABELS[r.incident_type] || r.incident_type || '',
    r.journey_details  || '',
    r.total_miles      || 0,
    r.comments         || '',
  ]);

  const csv = [cols, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mileage-claims.csv"`,
    },
  });
}

async function exportDutyHours(env, from, to) {
  const { keys } = await env.CFR_DATA.list({ prefix: 'duty:' });
  const records  = (await Promise.all(
    keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))
  )).filter(Boolean);

  const filtered = records.filter(r => {
    if (from && r.date < from) return false;
    if (to   && r.date > to)   return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const cols = [
    'Responder Name', 'Shift Start', 'Shift End',
    'Duration (mins)', 'Duration (hours)', 'Incidents Attended', 'Incidents Allocated',
  ];

  const rows = filtered.map(r => [
    r.responder_name  || '',
    r.shift_start     || '',
    r.shift_end       || '',
    r.duration_mins   || 0,
    r.duration_mins ? (r.duration_mins / 60).toFixed(2) : 0,
    r.incidents_attended  || 0,
    r.incidents_allocated || 0,
  ]);

  const csv = [cols, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="duty-hours.csv"`,
    },
  });
}
