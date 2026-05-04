async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${pin}`)
  );
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function findByPrf(env, prf) {
  const index = await env.CFR_USERS.get('users:index', { type: 'json' }) || [];
  const users = await Promise.all(index.map(k => env.CFR_USERS.get(`user:${k}`, { type: 'json' })));
  return users.filter(Boolean).find(u => String(u.prf_number || '').trim() === String(prf).trim());
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

  const { prf_number, pin, access_key, new_pin } = body;

  // ── Mode 1: PRF + PIN (normal daily login) ─────────────────────────────────
  if (prf_number && pin && !access_key) {
    const user = await findByPrf(env, prf_number);
    if (!user || !user.active) {
      return Response.json({ error: 'Invalid PRF number or PIN.' }, { status: 401 });
    }
    if (!user.pin_hash) {
      return Response.json({ error: 'No PIN set yet.', code: 'NO_PIN' }, { status: 401 });
    }
    const hash = await hashPin(pin, user.pin_salt);
    if (hash !== user.pin_hash) {
      return Response.json({ error: 'Invalid PRF number or PIN.' }, { status: 401 });
    }
    return Response.json({ user: safeReturn(user), access_key: user.access_key });
  }

  // ── Mode 2: PRF + access key + new PIN (first login / forgot PIN) ──────────
  if (prf_number && access_key && new_pin) {
    if (!/^\d{4,6}$/.test(new_pin)) {
      return Response.json({ error: 'PIN must be 4–6 digits.' }, { status: 400 });
    }
    const user = await env.CFR_USERS.get(`user:${access_key.trim()}`, { type: 'json' });
    if (!user || !user.active) {
      return Response.json({ error: 'Invalid access key.' }, { status: 401 });
    }
    if (String(user.prf_number || '').trim() !== String(prf_number).trim()) {
      return Response.json({ error: 'PRF number does not match this access key.' }, { status: 401 });
    }
    const salt    = crypto.randomUUID();
    const hash    = await hashPin(new_pin, salt);
    const updated = { ...user, pin_hash: hash, pin_salt: salt, updated_at: new Date().toISOString() };
    await env.CFR_USERS.put(`user:${access_key.trim()}`, JSON.stringify(updated));
    return Response.json({ user: safeReturn(updated), access_key: updated.access_key });
  }

  // ── Mode 3: access key only (coordinator / no PRF number) ──────────────────
  if (access_key && !prf_number) {
    const user = await env.CFR_USERS.get(`user:${access_key.trim()}`, { type: 'json' });
    if (!user) {
      return Response.json({ error: 'Invalid access key.' }, { status: 401 });
    }
    if (!user.active) {
      return Response.json({ error: 'Account disabled — contact your coordinator.' }, { status: 403 });
    }
    const key = user.access_key || access_key.trim();
    return Response.json({ user: safeReturn(user), access_key: key });
  }

  return Response.json({ error: 'Invalid request.' }, { status: 400 });
}
