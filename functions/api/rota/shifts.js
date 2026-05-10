function requireCoordinator(data) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  return null;
}

export async function onRequestGet({ request, env, data }) {
  const { user } = data;
  const url      = new URL(request.url);
  const block_id = url.searchParams.get('block_id');
  const isCoord  = user.roles?.includes('coordinator');

  if (!block_id) return Response.json({ error: 'block_id required' }, { status: 400 });

  const { keys } = await env.CFR_DATA.list({ prefix: `rota_shift:${block_id}:` });
  const shifts   = (await Promise.all(keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))))
    .filter(Boolean)
    .filter(s => isCoord || s.responder_id === user.id);

  shifts.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  return Response.json({ shifts });
}

export async function onRequestPost({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { block_id, date, start_time, end_time, responder_id, responder_name, type, notes } = body;
  if (!block_id || !date || !start_time || !end_time || !responder_id) {
    return Response.json({ error: 'block_id, date, start_time, end_time, responder_id required' }, { status: 400 });
  }

  const block = await env.CFR_DATA.get(`rota_block:${block_id}`, { type: 'json' });
  if (!block) return Response.json({ error: 'Block not found' }, { status: 404 });

  // Check vehicle unavailability overlap
  const { keys: unavailKeys } = await env.CFR_DATA.list({ prefix: 'vehicle_unavail:' });
  const unavailPeriods = (await Promise.all(unavailKeys.map(k => env.CFR_DATA.get(k.name, { type: 'json' })))).filter(Boolean);
  const shiftStart = new Date(`${date}T${start_time}`);
  const shiftEnd   = new Date(`${date}T${end_time}`);
  const clash = unavailPeriods.find(p => shiftStart < new Date(p.end_datetime) && shiftEnd > new Date(p.start_datetime));
  if (clash) {
    return Response.json({
      error: `Vehicle unavailable during this time (${clash.reason}${clash.notes ? ': ' + clash.notes : ''}).`,
      code: 'VEHICLE_UNAVAILABLE',
    }, { status: 409 });
  }

  const id    = crypto.randomUUID();
  const shift = {
    id,
    block_id,
    date,
    start_time,
    end_time,
    responder_id,
    responder_name: responder_name || '',
    type:           type || 'car',
    status:         'allocated',
    notes:          notes || '',
    created_by:     data.user.id,
    created_at:     new Date().toISOString(),
  };

  await env.CFR_DATA.put(`rota_shift:${block_id}:${id}`, JSON.stringify(shift));
  return Response.json({ shift }, { status: 201 });
}

export async function onRequestPatch({ request, env, data }) {
  const { user } = data;
  const isCoord  = user.roles?.includes('coordinator');

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, block_id, status, notes, start_time, end_time, date, responder_id, responder_name, type } = body;
  if (!id || !block_id) return Response.json({ error: 'id and block_id required' }, { status: 400 });

  const shift = await env.CFR_DATA.get(`rota_shift:${block_id}:${id}`, { type: 'json' });
  if (!shift) return Response.json({ error: 'Shift not found' }, { status: 404 });

  if (!isCoord) {
    if (shift.responder_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (status && status !== 'declined')
      return Response.json({ error: 'Responders may only decline shifts' }, { status: 403 });
  }

  if (status)              shift.status         = status;
  if (notes !== undefined) shift.notes          = notes;
  if (isCoord) {
    if (start_time)      shift.start_time     = start_time;
    if (end_time)        shift.end_time       = end_time;
    if (date)            shift.date           = date;
    if (responder_id)    shift.responder_id   = responder_id;
    if (responder_name)  shift.responder_name = responder_name;
    if (type)            shift.type           = type;
  }
  shift.updated_at = new Date().toISOString();
  shift.updated_by = user.id;

  await env.CFR_DATA.put(`rota_shift:${block_id}:${id}`, JSON.stringify(shift));
  return Response.json({ shift });
}

export async function onRequestDelete({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  const url      = new URL(request.url);
  const id       = url.searchParams.get('id');
  const block_id = url.searchParams.get('block_id');

  if (!id || !block_id) return Response.json({ error: 'id and block_id required' }, { status: 400 });

  const shift = await env.CFR_DATA.get(`rota_shift:${block_id}:${id}`, { type: 'json' });
  if (!shift) return Response.json({ error: 'Shift not found' }, { status: 404 });

  await env.CFR_DATA.delete(`rota_shift:${block_id}:${id}`);
  return Response.json({ ok: true });
}
