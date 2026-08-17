export async function onRequestGet({ request, env, data }) {
  const url      = new URL(request.url);
  const user     = data.user;
  const isCoord  = user.roles?.includes('coordinator');
  const from     = url.searchParams.get('from');
  const to       = url.searchParams.get('to');
  const userId   = url.searchParams.get('user_id');

  const { keys } = await env.CFR_DATA.list({ prefix: 'training:' });
  let entries = (await Promise.all(keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' })))).filter(Boolean);

  // Responders see only their own records; coordinators can see all or filter by user_id
  if (!isCoord) {
    entries = entries.filter(e => e.user_id === user.id);
  } else if (userId) {
    entries = entries.filter(e => e.user_id === userId);
  }

  if (from) entries = entries.filter(e => e.date >= from);
  if (to)   entries = entries.filter(e => e.date <= to);

  entries.sort((a, b) => b.date.localeCompare(a.date));
  return Response.json({ entries });
}

export async function onRequestPost({ request, env, data }) {
  const { user } = data;
  const isCoord = user.roles?.includes('coordinator');
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { date, hours, type, description, target_user_id, target_user_name } = body;
  if (!date || !hours) {
    return Response.json({ error: 'date and hours required' }, { status: 400 });
  }
  if (hours <= 0 || hours > 24) {
    return Response.json({ error: 'hours must be between 0 and 24' }, { status: 400 });
  }
  if (!['mandatory', 'optional', 'refresher'].includes(type)) {
    return Response.json({ error: 'type must be mandatory, optional, or refresher' }, { status: 400 });
  }

  // Coordinators can log on behalf of another responder
  const logUserId   = (isCoord && target_user_id)   ? target_user_id   : user.id;
  const logUserName = (isCoord && target_user_name)  ? target_user_name : (user.name || '');

  const id    = crypto.randomUUID();
  const entry = {
    id,
    user_id:          logUserId,
    user_name:        logUserName,
    date,
    hours,
    type:             type || 'optional',
    description:      description || '',
    recorded_by:      user.id,
    recorded_by_name: user.name || '',
    created_at:       new Date().toISOString(),
  };

  await env.CFR_DATA.put(`training:${date}:${id}`, JSON.stringify(entry));
  return Response.json({ entry }, { status: 201 });
}

export async function onRequestDelete({ request, env, data }) {
  const { user } = data;
  const isCoord = user.roles?.includes('coordinator');
  const url = new URL(request.url);
  const id   = url.searchParams.get('id');
  const date = url.searchParams.get('date');
  if (!id || !date) return Response.json({ error: 'id and date required' }, { status: 400 });

  const key   = `training:${date}:${id}`;
  const entry = await env.CFR_DATA.get(key, { type: 'json' });
  if (!entry) return Response.json({ error: 'Entry not found' }, { status: 404 });

  if (!isCoord && entry.user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await env.CFR_DATA.delete(key);
  return Response.json({ ok: true });
}
