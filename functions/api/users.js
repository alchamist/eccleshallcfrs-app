const ADJS = [
  'amber','bold','brave','bright','brisk','calm','clear','crisp','deft','eager',
  'fair','firm','fleet','fresh','gold','green','keen','kind','light','lime',
  'quick','quiet','rapid','sharp','silver','sleek','smart','smooth','solid','steady',
  'still','stone','strong','sure','swift','teal','warm','wise','young','zest',
  'blue','brave','clean','close','cool','dark','deep','east','free','grand',
];
const NOUNS = [
  'anchor','arrow','badge','beacon','birch','brook','cairn','cloud','coast','crest',
  'crown','dale','dawn','echo','elm','falcon','field','flint','ford','forge',
  'frost','glen','grove','haven','heath','helm','hill','holly','island','kite',
  'larch','ledge','maple','marsh','mast','moor','oak','peak','pine','pond',
  'raven','reed','ridge','river','robin','rowan','slate','trail','vale','willow',
];

function generateKey(prf_number) {
  const pick   = arr => arr[Math.floor(Math.random() * arr.length)];
  const suffix = prf_number ? String(prf_number).trim() : String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `cfr-${pick(ADJS)}-${pick(NOUNS)}-${suffix}`;
}

function randomPin() {
  // 4-digit PIN: 1000–9999 (never starts with 0)
  return String(Math.floor(Math.random() * 9000) + 1000);
}

async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function requireCoordinator(data) {
  const { user } = data;
  if (!user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }
  return null;
}

export async function onRequestGet({ env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  const index = await env.CFR_USERS.get('users:index', { type: 'json' }) || [];
  const users = (await Promise.all(
    index.map(async key => {
      const u = await env.CFR_USERS.get(`user:${key}`, { type: 'json' });
      if (u && !u.access_key) u.access_key = key; // backfill for manually-created entries
      return u;
    })
  )).filter(Boolean);

  return Response.json({ users });
}

export async function onRequestPost({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, prf_number, roles } = body;
  if (!name || !roles?.length) {
    return Response.json({ error: 'name and roles required' }, { status: 400 });
  }

  const access_key = generateKey(prf_number);
  const pin        = randomPin();
  const pin_salt   = crypto.randomUUID();
  const pin_hash   = await hashPin(pin, pin_salt);

  const user = {
    id:          crypto.randomUUID(),
    access_key,
    name:        name.trim(),
    prf_number:  (prf_number || '').trim(),
    roles:       roles.filter(r => ['responder','coordinator','compliance','fire_safety_officer'].includes(r)),
    active:      true,
    pin_hash,
    pin_salt,
    created_at:  new Date().toISOString(),
    created_by:  data.user.id,
  };

  const ops = [env.CFR_USERS.put(`user:${access_key}`, JSON.stringify(user))];
  if (user.prf_number) ops.push(env.CFR_USERS.put(`prf:${user.prf_number}`, access_key));

  const index = await env.CFR_USERS.get('users:index', { type: 'json' }) || [];
  index.push(access_key);
  ops.push(env.CFR_USERS.put('users:index', JSON.stringify(index)));
  await Promise.all(ops);

  // Return PIN and access key once — neither is stored in retrievable form
  return Response.json({ access_key, pin, user }, { status: 201 });
}

export async function onRequestPatch({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { access_key, active, roles, name, prf_number, regenerate_key, reset_pin } = body;
  if (!access_key) return Response.json({ error: 'access_key required' }, { status: 400 });

  const user = await env.CFR_USERS.get(`user:${access_key}`, { type: 'json' });
  if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

  if (regenerate_key) {
    const newKey = generateKey(user.prf_number);
    const updated = { ...user, access_key: newKey, updated_at: new Date().toISOString(), updated_by: data.user.id };

    const index    = await env.CFR_USERS.get('users:index', { type: 'json' }) || [];
    const newIndex = index.map(k => k === access_key ? newKey : k);

    const ops = [
      env.CFR_USERS.put(`user:${newKey}`, JSON.stringify(updated)),
      env.CFR_USERS.put('users:index', JSON.stringify(newIndex)),
      env.CFR_USERS.delete(`user:${access_key}`),
    ];
    if (updated.prf_number) ops.push(env.CFR_USERS.put(`prf:${updated.prf_number}`, newKey));
    await Promise.all(ops);

    return Response.json({ access_key: newKey, user: updated });
  }

  if (reset_pin) {
    const pin      = randomPin();
    const pin_salt = crypto.randomUUID();
    const pin_hash = await hashPin(pin, pin_salt);
    const updated  = { ...user, pin_hash, pin_salt, updated_at: new Date().toISOString(), updated_by: data.user.id };
    await env.CFR_USERS.put(`user:${access_key}`, JSON.stringify(updated));
    return Response.json({ pin });
  }

  const oldPrf = user.prf_number;
  if (active !== undefined)     user.active     = active;
  if (roles)                    user.roles      = roles;
  if (name)                     user.name       = name.trim();
  if (prf_number !== undefined) user.prf_number = prf_number.trim();
  user.updated_at = new Date().toISOString();
  user.updated_by = data.user.id;

  const patchOps = [env.CFR_USERS.put(`user:${access_key}`, JSON.stringify(user))];
  if (prf_number !== undefined && user.prf_number !== oldPrf) {
    if (oldPrf)          patchOps.push(env.CFR_USERS.delete(`prf:${oldPrf}`));
    if (user.prf_number) patchOps.push(env.CFR_USERS.put(`prf:${user.prf_number}`, access_key));
  }
  await Promise.all(patchOps);
  return Response.json({ user });
}
