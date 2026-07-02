// Auth middleware for all /api/* routes except /api/auth and /api/stats

const PUBLIC = ['/api/auth', '/api/stats', '/api/device-pin'];

// Routes that start with these prefixes are public
const PUBLIC_PREFIXES = ['/api/status/', '/api/wallboard'];

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  if (PUBLIC.includes(url.pathname)) return next();
  if (PUBLIC_PREFIXES.some(p => url.pathname.startsWith(p))) return next();

  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key  = auth.slice(7).trim();

  // Reject obviously bad keys (happens when access_key was stored as undefined string)
  if (!key || key === 'undefined' || key === 'null') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await env.CFR_USERS.get(`user:${key}`, { type: 'json' });

  if (!user) {
    return Response.json({ error: 'Invalid access key' }, { status: 401 });
  }
  // Treat missing active field as active (handles manually-created legacy accounts)
  if (user.active === false) {
    return Response.json({ error: 'Account disabled — contact your coordinator.' }, { status: 401 });
  }
  // Backfill access_key if absent (legacy accounts created without this field)
  if (!user.access_key) user.access_key = key;

  data.user = user;
  data.key  = key;
  return next();
}
