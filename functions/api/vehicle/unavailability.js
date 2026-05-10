function requireCoordinator(data) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  return null;
}

// Does shift (date + start_time + end_time) overlap with an unavailability period?
function shiftOverlaps(shift, unavail) {
  const sStart = new Date(`${shift.date}T${shift.start_time}`);
  const sEnd   = new Date(`${shift.date}T${shift.end_time}`);
  const uStart = new Date(unavail.start_datetime);
  const uEnd   = new Date(unavail.end_datetime);
  return sStart < uEnd && sEnd > uStart;
}

async function cancelOverlappingShifts(env, unavail) {
  const index = await env.CFR_DATA.get('rota_blocks:index', { type: 'json' }) || [];
  const blocks = (await Promise.all(index.map(id => env.CFR_DATA.get(`rota_block:${id}`, { type: 'json' }))))
    .filter(b => b && ['open', 'published'].includes(b.status));

  const uStart = new Date(unavail.start_datetime);
  const uEnd   = new Date(unavail.end_datetime);

  const cancelled = [];

  for (const block of blocks) {
    // Only process blocks whose date range overlaps the unavailability period
    const bStart = new Date(block.start_date);
    const bEnd   = new Date(block.end_date + 'T23:59:59');
    if (bStart >= uEnd || bEnd <= uStart) continue;

    const { keys } = await env.CFR_DATA.list({ prefix: `rota_shift:${block.id}:` });
    const shifts   = (await Promise.all(keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))))
      .filter(s => s && ['allocated', 'confirmed'].includes(s.status));

    for (const shift of shifts) {
      if (!shiftOverlaps(shift, unavail)) continue;
      shift.status             = 'cancelled';
      shift.cancellation_reason = `Vehicle unavailable — ${unavail.reason}`;
      shift.updated_at          = new Date().toISOString();
      await env.CFR_DATA.put(`rota_shift:${block.id}:${shift.id}`, JSON.stringify(shift));
      cancelled.push({ shift_id: shift.id, block_id: block.id, responder_name: shift.responder_name, date: shift.date, start_time: shift.start_time });
    }
  }

  return cancelled;
}

export async function onRequestGet({ env, request }) {
  const url  = new URL(request.url);
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');

  const { keys } = await env.CFR_DATA.list({ prefix: 'vehicle_unavail:' });
  let periods = (await Promise.all(keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' })))).filter(Boolean);

  if (from) periods = periods.filter(p => p.end_datetime >= from);
  if (to)   periods = periods.filter(p => p.start_datetime <= to + 'T23:59:59');

  periods.sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
  return Response.json({ periods });
}

export async function onRequestPost({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { start_datetime, end_datetime, reason, notes } = body;
  if (!start_datetime || !end_datetime) {
    return Response.json({ error: 'start_datetime and end_datetime required' }, { status: 400 });
  }
  if (end_datetime <= start_datetime) {
    return Response.json({ error: 'end_datetime must be after start_datetime' }, { status: 400 });
  }

  const VALID_REASONS = ['mot', 'service', 'deep_clean', 'other'];
  const id = crypto.randomUUID();
  const period = {
    id,
    start_datetime,
    end_datetime,
    reason: VALID_REASONS.includes(reason) ? reason : 'other',
    notes:  notes || '',
    created_by: data.user.id,
    created_at: new Date().toISOString(),
  };

  const dateKey = start_datetime.slice(0, 10);
  await env.CFR_DATA.put(`vehicle_unavail:${dateKey}:${id}`, JSON.stringify(period));

  const cancelled = await cancelOverlappingShifts(env, period);

  return Response.json({ period, cancelled }, { status: 201 });
}

export async function onRequestDelete({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const { keys } = await env.CFR_DATA.list({ prefix: 'vehicle_unavail:' });
  const key = keys.find(k => k.name.endsWith(id));
  if (!key) return Response.json({ error: 'Period not found' }, { status: 404 });

  await env.CFR_DATA.delete(key.name);
  return Response.json({ ok: true });
}
