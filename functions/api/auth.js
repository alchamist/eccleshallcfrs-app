export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { access_key } = body;
  if (!access_key || typeof access_key !== 'string') {
    return Response.json({ error: 'Access key required' }, { status: 400 });
  }

  const user = await env.CFR_USERS.get(`user:${access_key.trim()}`, { type: 'json' });
  if (!user) {
    return Response.json({ error: 'Invalid access key' }, { status: 401 });
  }
  if (!user.active) {
    return Response.json({ error: 'Account disabled — contact your coordinator' }, { status: 403 });
  }

  // Never return the access key in the response
  const { access_key: _k, ...safeUser } = user;
  return Response.json({ user: safeUser });
}
