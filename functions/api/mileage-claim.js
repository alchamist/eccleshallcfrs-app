// POST /api/mileage-claim   — submit incident & mileage record
// GET  /api/mileage-claim   — list (own for responder, all for coordinator)

export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const required = ['date', 'callout_time', 'call_category', 'incident_type', 'journey_details', 'total_miles'];
  for (const f of required) {
    if (body[f] === undefined || body[f] === '') {
      return Response.json({ error: `${f} required` }, { status: 400 });
    }
  }

  const id     = crypto.randomUUID();
  const record = {
    id,
    type:            'claim',
    responder_id:    user.id,
    responder_name:  user.name,
    callsign:        user.callsign || '',
    date:            body.date,
    callout_time:    body.callout_time,
    job_number:        body.job_number        || '',
    call_category:     body.call_category,
    patient_age:       body.patient_age       || 'unknown',
    incident_type:     body.incident_type,
    incident_location: body.incident_location || '',
    journey_details:   body.journey_details,
    total_miles:     parseFloat(body.total_miles),
    comments:        body.comments     || '',
    submitted_at:    new Date().toISOString(),
  };

  await env.CFR_DATA.put(`claim:${body.date}:${id}`, JSON.stringify(record));
  await env.CFR_DATA.delete('stats:cache').catch(() => {});

  return Response.json({ record }, { status: 201 });
}

export async function onRequestGet({ request, env, data }) {
  const { user } = data;
  const url      = new URL(request.url);
  const from     = url.searchParams.get('from');
  const to       = url.searchParams.get('to');
  const limit    = parseInt(url.searchParams.get('limit') || '50');
  const isCoord  = user.roles?.includes('coordinator');

  const { keys } = await env.CFR_DATA.list({ prefix: 'claim:' });
  const sorted   = keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 500);

  const records = (await Promise.all(sorted.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))))
    .filter(Boolean)
    .filter(r => {
      if (!isCoord && r.responder_id !== user.id) return false;
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      return true;
    })
    .slice(0, limit);

  return Response.json({ items: records });
}
