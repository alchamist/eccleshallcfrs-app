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
    index.map(key => env.CFR_USERS.get(`user:${key}`, { type: 'json' }))
  )).filter(Boolean).map(u => {
    // Return the access_key so coordinator can disable/enable by key
    return u;
  });

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

  // Generate a readable access key: cfr-XXXX-XXXX-XXXX
  const rand = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  const access_key = `cfr-${rand()}-${rand()}-${rand()}`;

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

  const { access_key, active, roles, name, prf_number } = body;
  if (!access_key) return Response.json({ error: 'access_key required' }, { status: 400 });

  const user = await env.CFR_USERS.get(`user:${access_key}`, { type: 'json' });
  if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

  if (active !== undefined) user.active     = active;
  if (roles)                user.roles      = roles;
  if (name)                 user.name       = name.trim();
  if (prf_number !== undefined) user.prf_number = prf_number.trim();
  user.updated_at = new Date().toISOString();
  user.updated_by = data.user.id;

  await env.CFR_USERS.put(`user:${access_key}`, JSON.stringify(user));
  return Response.json({ user });
}
