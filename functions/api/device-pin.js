// GET  /api/device-pin  — check if device PIN is configured (public, no auth)
// POST /api/device-pin  — set or change device PIN (coordinator only)

async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${pin}`)
  );
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestGet({ env }) {
  const config = await env.CFR_USERS.get('device:config', { type: 'json' });
  return Response.json({ configured: !!(config?.pin_hash) });
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const key  = auth.slice(7).trim();
  const user = await env.CFR_USERS.get(`user:${key}`, { type: 'json' });
  if (!user || !user.active || !(user.roles || []).includes('coordinator')) {
    return Response.json({ error: 'Coordinator access required.' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { pin } = body;
  if (!pin || !/^\d{4,8}$/.test(String(pin))) {
    return Response.json({ error: 'PIN must be 4–8 digits.' }, { status: 400 });
  }

  const salt = crypto.randomUUID();
  const hash = await hashPin(String(pin), salt);
  await env.CFR_USERS.put('device:config', JSON.stringify({ pin_hash: hash, pin_salt: salt }));
  return Response.json({ ok: true });
}
