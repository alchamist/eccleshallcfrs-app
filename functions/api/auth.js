async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${pin}`)
  );
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function allUsers(env) {
  const index = await env.CFR_USERS.get('users:index', { type: 'json' }) || [];
  const rows  = await Promise.all(index.map(k => env.CFR_USERS.get(`user:${k}`, { type: 'json' })));
  return rows.filter(Boolean);
}

async function findByPrf(env, prf) {
  const users = await allUsers(env);
  return users.find(u => String(u.prf_number || '').trim() === String(prf).trim());
}

async function verifyDevicePin(env, device_pin) {
  const config = await env.CFR_USERS.get('device:config', { type: 'json' });
  if (!config?.pin_hash) return { ok: false, code: 'NO_DEVICE_PIN' };
  const hash = await hashPin(device_pin, config.pin_salt);
  return { ok: hash === config.pin_hash };
}

async function getActiveShift(env) {
  try {
    const activeId = await env.CFR_DATA.get('vshift:active');
    if (!activeId) return { activeShiftId: null, activeCrew: [] };
    const { keys } = await env.CFR_DATA.list({ prefix: 'vshift:' });
    const k = keys.find(k => k.name !== 'vshift:active' && k.name.includes(activeId));
    if (!k) return { activeShiftId: null, activeCrew: [] };
    const shift = await env.CFR_DATA.get(k.name, { type: 'json' });
    if (!shift || shift.status !== 'active') return { activeShiftId: null, activeCrew: [] };
    return {
      activeShiftId: activeId,
      activeCrew: shift.crew.filter(c => !c.signed_off).map(c => ({
        responder_id: c.responder_id, role: c.role, signed_on: c.signed_on,
      })),
    };
  } catch { return { activeShiftId: null, activeCrew: [] }; }
}

function safeReturn(user) {
  const { pin_hash: _h, pin_salt: _s, ...rest } = user;
  return rest;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { prf_number, pin, access_key, new_pin, device_pin, user_id } = body;

  // ── Device mode 1: device PIN only → user list + active shift ──────────────
  if (device_pin && !user_id && !prf_number && !pin && !access_key) {
    const { ok, code } = await verifyDevicePin(env, device_pin);
    if (!ok) {
      return code === 'NO_DEVICE_PIN'
        ? Response.json({ error: 'No device PIN set. Ask your coordinator.', code }, { status: 503 })
        : Response.json({ error: 'Incorrect PIN.', code: 'WRONG_PIN' }, { status: 401 });
    }
    const users = (await allUsers(env))
      .filter(u => u.active)
      .map(u => ({ id: u.id, name: u.name, prf_number: u.prf_number || '', roles: u.roles || [] }));
    const { activeShiftId, activeCrew } = await getActiveShift(env);
    return Response.json({ users, activeShiftId, activeCrew });
  }

  // ── Device mode 2: device PIN + user_id → responder session ────────────────
  if (device_pin && user_id) {
    const { ok, code } = await verifyDevicePin(env, device_pin);
    if (!ok) {
      return code === 'NO_DEVICE_PIN'
        ? Response.json({ error: 'No device PIN set.', code }, { status: 503 })
        : Response.json({ error: 'Incorrect PIN.' }, { status: 401 });
    }
    const user = (await allUsers(env)).find(u => u.id === user_id && u.active);
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });
    const { pin_hash: _h, pin_salt: _s, ...safeUser } = user;
    // Device sessions are always responder-only — coordinator/compliance requires personal login
    return Response.json({
      user: { ...safeUser, roles: ['responder'], _device_mode: true },
      access_key: user.access_key,
    });
  }

  // ── Mode 1: PRF + PIN (personal daily login) ───────────────────────────────
  if (prf_number && pin && !access_key) {
    const user = await findByPrf(env, prf_number);
    if (!user || !user.active) return Response.json({ error: 'Invalid PRF number or PIN.' }, { status: 401 });
    if (!user.pin_hash) return Response.json({ error: 'No PIN set yet.', code: 'NO_PIN' }, { status: 401 });
    const hash = await hashPin(pin, user.pin_salt);
    if (hash !== user.pin_hash) return Response.json({ error: 'Invalid PRF number or PIN.' }, { status: 401 });
    return Response.json({ user: safeReturn(user), access_key: user.access_key });
  }

  // ── Mode 2: PRF + access key + new PIN (first login / forgot PIN) ──────────
  if (prf_number && access_key && new_pin) {
    if (!/^\d{4,6}$/.test(new_pin)) return Response.json({ error: 'PIN must be 4–6 digits.' }, { status: 400 });
    const user = await env.CFR_USERS.get(`user:${access_key.trim()}`, { type: 'json' });
    if (!user || !user.active) return Response.json({ error: 'Invalid access key.' }, { status: 401 });
    if (String(user.prf_number || '').trim() !== String(prf_number).trim()) {
      return Response.json({ error: 'PRF number does not match this access key.' }, { status: 401 });
    }
    const salt    = crypto.randomUUID();
    const hash    = await hashPin(new_pin, salt);
    const updated = { ...user, pin_hash: hash, pin_salt: salt, updated_at: new Date().toISOString() };
    await env.CFR_USERS.put(`user:${access_key.trim()}`, JSON.stringify(updated));
    return Response.json({ user: safeReturn(updated), access_key: updated.access_key });
  }

  // ── Mode 3: access key only (no PRF / personal fallback) ───────────────────
  if (access_key && !prf_number) {
    const user = await env.CFR_USERS.get(`user:${access_key.trim()}`, { type: 'json' });
    if (!user) return Response.json({ error: 'Invalid access key.' }, { status: 401 });
    if (!user.active) return Response.json({ error: 'Account disabled — contact your coordinator.' }, { status: 403 });
    return Response.json({ user: safeReturn(user), access_key: user.access_key || access_key.trim() });
  }

  return Response.json({ error: 'Invalid request.' }, { status: 400 });
}
