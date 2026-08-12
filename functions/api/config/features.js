const DEFAULTS = { fire_safety: true, training: true };

export async function onRequestGet({ env }) {
  const stored = await env.CFR_DATA.get('config:features', { type: 'json' });
  return Response.json({ features: { ...DEFAULTS, ...(stored || {}) } });
}

export async function onRequestPost({ request, env, data }) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { features } = body;
  if (!features || typeof features !== 'object') {
    return Response.json({ error: 'features object required' }, { status: 400 });
  }

  const sanitized = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (key in features) sanitized[key] = Boolean(features[key]);
  }

  await env.CFR_DATA.put('config:features', JSON.stringify(sanitized));
  return Response.json({ features: { ...DEFAULTS, ...sanitized } });
}
