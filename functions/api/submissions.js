// GET    /api/submissions — aggregated list across all types for coordinator view
// DELETE /api/submissions?key=KV_KEY — delete a specific record (coordinator only)

const ALL_PREFIXES = [
  { prefix: 'duty:',                         t: 'duty'              },
  { prefix: 'vshift:',                        t: 'vshift'            },
  { prefix: 'vdi:',                           t: 'vdi'               },
  { prefix: 'claim:',                         t: 'claim'             },
  { prefix: 'monthly:',                       t: 'monthly'           },
  { prefix: 'fire_safety:alarm:',             t: 'fire_alarm'        },
  { prefix: 'fire_safety:lighting:',          t: 'fire_lighting'     },
  { prefix: 'fire_safety:extinguisher:',      t: 'fire_extinguisher' },
];

const TYPE_TO_PREFIX = Object.fromEntries(ALL_PREFIXES.map(p => [p.t, p.prefix]));
const FSO_TYPES = new Set(['fire_alarm', 'fire_lighting', 'fire_extinguisher']);

function requireCoordinator(data) {
  const roles = data.user.roles || [];
  if (!roles.includes('coordinator') && !roles.includes('fire_safety_officer')) {
    return Response.json({ error: 'Coordinator or Fire Safety Officer role required' }, { status: 403 });
  }
  return null;
}

export async function onRequestGet({ request, env, data }) {
  const deny = requireCoordinator(data);
  if (deny) return deny;

  const { user } = data;
  const isFullCoord = user.roles?.includes('coordinator');
  const url  = new URL(request.url);
  const type = url.searchParams.get('type'); // duty|vshift|vdi|claim|monthly|fire_alarm|fire_lighting|fire_extinguisher
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');

  // FSO without coordinator role is restricted to fire safety record types only
  if (!isFullCoord && type && !FSO_TYPES.has(type)) {
    return Response.json({ error: 'Access restricted to fire safety records' }, { status: 403 });
  }

  let prefixes;
  if (type) {
    const prefix = TYPE_TO_PREFIX[type];
    if (!prefix) return Response.json({ error: 'Unknown type' }, { status: 400 });
    prefixes = [{ prefix, t: type }];
  } else {
    prefixes = isFullCoord ? ALL_PREFIXES : ALL_PREFIXES.filter(p => FSO_TYPES.has(p.t));
  }

  const allRecords = (await Promise.all(
    prefixes.map(async ({ prefix, t }) => {
      const { keys } = await env.CFR_DATA.list({ prefix });
      const relevant = keys
        .filter(k => k.name !== 'vshift:active')
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, 100);
      const records = (await Promise.all(
        relevant.map(async k => {
          const r = await env.CFR_DATA.get(k.name, { type: 'json' });
          if (!r) return null;
          return { ...r, type: t, _key: k.name };
        })
      )).filter(Boolean);
      return records;
    })
  )).flat();

  const filtered = allRecords
    .filter(r => {
      const d = r.date || r.check_month || r.start_datetime?.slice(0, 10);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    })
    .sort((a, b) => {
      const da = a.date || a.check_month || a.start_datetime?.slice(0, 10) || '';
      const db = b.date || b.check_month || b.start_datetime?.slice(0, 10) || '';
      return db.localeCompare(da);
    })
    .slice(0, 200)
    .map(r => ({
      ...r,
      date: r.date || r.check_month || r.start_datetime?.slice(0, 10) || null,
    }));

  return Response.json({ items: filtered });
}

export async function onRequestDelete({ request, env, data }) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key || key === 'vshift:active' || !key.match(/^(duty|vshift|vdi|claim|monthly|fire_safety):/)) {
    return Response.json({ error: 'Invalid key' }, { status: 400 });
  }

  const record = await env.CFR_DATA.get(key, { type: 'json' });
  if (!record) return Response.json({ error: 'Record not found' }, { status: 404 });

  // If deleting an active shift, also clear the active pointer
  if (key.startsWith('vshift:') && record.status === 'active') {
    await env.CFR_DATA.delete('vshift:active');
  }

  await env.CFR_DATA.delete(key);
  return Response.json({ ok: true });
}
