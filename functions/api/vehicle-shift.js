// GET  /api/vehicle-shift          — active shift + recent completed
// POST /api/vehicle-shift          — start new shift (first crew member)
// PATCH /api/vehicle-shift         — crew join/leave/set-driver/complete

export async function onRequestGet({ env }) {
  const today    = new Date().toISOString().slice(0, 10);
  const activeId = await env.CFR_DATA.get('vshift:active');
  let active = null;

  if (activeId) {
    active = await getShiftById(env, activeId);
    if (!active || active.status !== 'active') {
      await env.CFR_DATA.delete('vshift:active');
      active = null;
    }
  }

  const [{ keys }, { keys: vdiKeys }] = await Promise.all([
    env.CFR_DATA.list({ prefix: 'vshift:' }),
    env.CFR_DATA.list({ prefix: `vdi:${today}:` }),
  ]);

  const shiftKeys = keys
    .filter(k => k.name !== 'vshift:active')
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 20);

  const all = (await Promise.all(shiftKeys.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))))
    .filter(Boolean);

  const recent = all
    .filter(s => s.status === 'completed')
    .sort((a, b) => new Date(b.start_datetime) - new Date(a.start_datetime))
    .slice(0, 10);

  return Response.json({ active, recent, vdiToday: vdiKeys.length > 0 });
}

export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { start_mileage } = body;
  if (!start_mileage || start_mileage < 0) {
    return Response.json({ error: 'start_mileage required' }, { status: 400 });
  }

  // Require a VDI for today before starting a shift
  const today = new Date().toISOString().slice(0, 10);
  const { keys: vdiKeys } = await env.CFR_DATA.list({ prefix: `vdi:${today}:` });
  if (vdiKeys.length === 0) {
    return Response.json({
      error: 'A Vehicle Daily Inspection must be completed before starting a shift.',
      code: 'NO_VDI_TODAY',
    }, { status: 409 });
  }

  // Prevent duplicate active shifts
  const existingId = await env.CFR_DATA.get('vshift:active');
  if (existingId) {
    const existing = await getShiftById(env, existingId);
    if (existing?.status === 'active') {
      return Response.json({ error: 'A shift is already active. Join it instead.', existing }, { status: 409 });
    }
  }

  const id       = crypto.randomUUID();
  const now      = new Date().toISOString();
  const dateStr  = now.slice(0, 10);

  const shift = {
    id,
    vehicle:        'RC0681',
    status:         'active',
    start_datetime: now,
    end_datetime:   null,
    start_mileage,
    end_mileage:    null,
    crew: [{
      responder_id: user.id,
      name:         user.name,
      role:         'driver',
      signed_on:    now,
      signed_off:   null,
    }],
    number_of_jobs: null,
    comments:       null,
    created_by:     user.id,
  };

  await env.CFR_DATA.put(`vshift:${dateStr}:${id}`, JSON.stringify(shift));
  await env.CFR_DATA.put('vshift:active', id);

  return Response.json({ shift }, { status: 201 });
}

export async function onRequestPatch({ request, env, data }) {
  const { user } = data;
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, action } = body;
  if (!id || !action) {
    return Response.json({ error: 'id and action required' }, { status: 400 });
  }

  const { key, shift } = await getShiftWithKey(env, id);
  if (!shift) return Response.json({ error: 'Shift not found' }, { status: 404 });
  if (shift.status !== 'active') return Response.json({ error: 'Shift is no longer active' }, { status: 409 });

  const now = new Date().toISOString();

  if (action === 'join') {
    const existing = shift.crew.find(c => c.responder_id === user.id);
    if (existing) {
      if (existing.signed_off) {
        existing.signed_off = null;
        existing.signed_on  = now;
      }
      // already on shift — no-op
    } else {
      shift.crew.push({ responder_id: user.id, name: user.name, role: 'crew', signed_on: now, signed_off: null });
    }

  } else if (action === 'leave') {
    const member = shift.crew.find(c => c.responder_id === user.id);
    if (member) member.signed_off = now;

    const stillActive = shift.crew.some(c => !c.signed_off);
    if (!stillActive) {
      // Last person — complete the shift
      shift.status        = 'completed';
      shift.end_datetime  = now;
      shift.end_mileage   = body.end_mileage ?? null;
      shift.number_of_jobs = body.number_of_jobs ?? 0;
      shift.comments      = body.comments ?? '';
      await env.CFR_DATA.delete('vshift:active');
    }

  } else if (action === 'set_driver') {
    const { driver_id } = body;
    shift.crew.forEach(c => {
      if (c.signed_off) return;
      c.role = c.responder_id === driver_id ? 'driver' : 'crew';
    });

  } else if (action === 'complete') {
    shift.status        = 'completed';
    shift.end_datetime  = now;
    shift.end_mileage   = body.end_mileage ?? null;
    shift.number_of_jobs = body.number_of_jobs ?? 0;
    shift.comments      = body.comments ?? '';
    shift.crew.forEach(c => { if (!c.signed_off) c.signed_off = now; });
    await env.CFR_DATA.delete('vshift:active');

  } else {
    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  await env.CFR_DATA.put(key, JSON.stringify(shift));
  return Response.json({ shift });
}

async function getShiftById(env, id) {
  const { key, shift } = await getShiftWithKey(env, id);
  return shift;
}

async function getShiftWithKey(env, id) {
  const { keys } = await env.CFR_DATA.list({ prefix: 'vshift:' });
  const k = keys.find(k => k.name !== 'vshift:active' && k.name.includes(id));
  if (!k) return { key: null, shift: null };
  const shift = await env.CFR_DATA.get(k.name, { type: 'json' });
  return { key: k.name, shift };
}
