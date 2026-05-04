// Auth middleware for all /api/* routes except /api/auth and /api/stats

const PUBLIC = ['/api/auth', '/api/stats', '/api/device-pin'];

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  if (PUBLIC.includes(url.pathname)) return next();

  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key  = auth.slice(7).trim();
  const user = await env.CFR_USERS.get(`user:${key}`, { type: 'json' });

  if (!user || !user.active) {
    return Response.json({ error: 'Invalid or disabled access key' }, { status: 401 });
  }

  data.user = user;
  data.key  = key;
  return next();
}
