const DEFAULTS = {
  fire_safety: true,
  training: true,
  defib_tracker: false,
  defib_compliance_report: false,
};

export async function onRequestGet({ env }) {
  const stored = await env.CFR_DATA.get('config:features', { type: 'json' });
  return Response.json({ features: { ...DEFAULTS, ...(stored || {}) } });
}

export async function onRequestPost({ request, env, data }) {
  if (!data.user._is_support) {
    return Response.json({ error: 'Support role required' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { features } = body;
  if (!features || typeof features !== 'object') {
    return Response.json({ error: 'features object required' }, { status: 400 });
  }

  // Prevent disabling defib_tracker while defib_manager users exist
  if (features.defib_tracker === false) {
    const { keys } = await env.CFR_USERS.list({ prefix: 'user:' });
    const users = await Promise.all(keys.map(k => env.CFR_USERS.get(k.name, { type: 'json' })));
    const hasDefibManager = users.some(u => u?.active !== false && u?.roles?.includes('defib_manager'));
    if (hasDefibManager) {
      return Response.json({ error: 'Remove all Defib Manager role assignments before disabling.' }, { status: 409 });
    }
  }

  const sanitized = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (key in features) sanitized[key] = Boolean(features[key]);
  }

  await env.CFR_DATA.put('config:features', JSON.stringify(sanitized));
  return Response.json({ features: { ...DEFAULTS, ...sanitized } });
}
