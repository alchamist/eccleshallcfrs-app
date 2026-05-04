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

  const user = {
    id:          crypto.randomUUID(),
    access_key,
    name:        name.trim(),
    prf_number:  (prf_number || '').trim(),
    roles:       roles.filter(r => ['responder','coordinator','compliance'].includes(r)),
    active:      true,
    created_at:  new Date().toISOString(),
    created_by:  data.user.id,
  };

  await env.CFR_USERS.put(`user:${access_key}`, JSON.stringify(user));

  // Update index
  const index = await env.CFR_USERS.get('users:index', { type: 'json' }) || [];
  index.push(access_key);
  await env.CFR_USERS.put('users:index', JSON.stringify(index));

  // Return the access key once — not stored in plaintext anywhere user can retrieve later
  return Response.json({ access_key, user }, { status: 201 });
}

export async function onRequestPatch({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { access_key, active, roles, name, prf_number, regenerate_key } = body;
  if (!access_key) return Response.json({ error: 'access_key required' }, { status: 400 });

  const user = await env.CFR_USERS.get(`user:${access_key}`, { type: 'json' });
  if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

  if (regenerate_key) {
    const newKey = generateKey(user.prf_number);
    const updated = { ...user, access_key: newKey, updated_at: new Date().toISOString(), updated_by: data.user.id };

    const index    = await env.CFR_USERS.get('users:index', { type: 'json' }) || [];
    const newIndex = index.map(k => k === access_key ? newKey : k);

    await Promise.all([
      env.CFR_USERS.put(`user:${newKey}`, JSON.stringify(updated)),
      env.CFR_USERS.put('users:index', JSON.stringify(newIndex)),
      env.CFR_USERS.delete(`user:${access_key}`),
    ]);

    return Response.json({ access_key: newKey, user: updated });
  }

  if (active !== undefined)     user.active     = active;
  if (roles)                    user.roles      = roles;
  if (name)                     user.name       = name.trim();
  if (prf_number !== undefined) user.prf_number = prf_number.trim();
  user.updated_at = new Date().toISOString();
  user.updated_by = data.user.id;

  await env.CFR_USERS.put(`user:${access_key}`, JSON.stringify(user));
  return Response.json({ user });
}
