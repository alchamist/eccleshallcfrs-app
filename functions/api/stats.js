// Public endpoint — no auth required. Called by eccleshallcfrs-site.pages.dev.
// Returns aggregate stats, cached for 5 minutes.

const CACHE_TTL_SECS = 300;

export async function onRequestGet({ env, request }) {
  // Check cache
  const cached = await env.CFR_DATA.get('stats:cache', { type: 'json' });
  if (cached) {
    const age = (Date.now() - new Date(cached.generated_at)) / 1000;
    if (age < CACHE_TTL_SECS) {
      return jsonResponse(cached, request);
    }
  }

  // Compute fresh stats
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ytdPrefix   = `${year}-`;
  const monthPrefix = `${year}-${month}-`;

  const [dutyKeys, claimKeys, vdiKeys, userIndex] = await Promise.all([
    env.CFR_DATA.list({ prefix: 'duty:' }),
    env.CFR_DATA.list({ prefix: 'claim:' }),
    env.CFR_DATA.list({ prefix: 'vdi:' }),
    env.CFR_USERS.get('users:index', { type: 'json' }),
  ]);

  // Fetch all duty and claim records
  const [dutyRecords, claimRecords] = await Promise.all([
    fetchAll(env.CFR_DATA, dutyKeys.keys),
    fetchAll(env.CFR_DATA, claimKeys.keys),
  ]);

  const dutyYTD   = dutyRecords.filter(d => d.date?.startsWith(ytdPrefix));
  const claimYTD  = claimRecords.filter(c => c.date?.startsWith(ytdPrefix));
  const claimMonth = claimRecords.filter(c => c.date?.startsWith(monthPrefix));

  const totalDutyMinsYTD = dutyYTD.reduce((s, d) => s + (d.duration_mins || 0), 0);
  const totalMilesYTD    = claimYTD.reduce((s, c) => s + (c.total_miles || 0), 0);

  // Last VDI
  const vdiSorted = vdiKeys.keys
    .filter(k => !k.name.includes('active'))
    .sort((a, b) => b.name.localeCompare(a.name));
  let lastVDIDate = null, lastVDIPass = null;
  if (vdiSorted.length > 0) {
    const lastVDI = await env.CFR_DATA.get(vdiSorted[0].name, { type: 'json' });
    lastVDIDate = lastVDI?.date ?? null;
    lastVDIPass = lastVDI?.overall_pass ?? null;
  }

  // Active responders
  const activeCount = userIndex
    ? (await Promise.all(
        userIndex.map(k => env.CFR_USERS.get(`user:${k}`, { type: 'json' }))
      )).filter(u => u?.active).length
    : 0;

  const stats = {
    generated_at:           now.toISOString(),
    total_duty_hours_ytd:   Math.round(totalDutyMinsYTD / 60),
    total_duty_mins_ytd:    totalDutyMinsYTD,
    incidents_ytd:          claimYTD.filter(c => c.incident_type !== 'na').length,
    incidents_this_month:   claimMonth.filter(c => c.incident_type !== 'na').length,
    total_miles_ytd:        Math.round(totalMilesYTD * 10) / 10,
    active_responders:      activeCount,
    last_vdi_date:          lastVDIDate,
    last_vdi_pass:          lastVDIPass,
  };

  await env.CFR_DATA.put('stats:cache', JSON.stringify(stats), { expirationTtl: CACHE_TTL_SECS * 2 });
  return jsonResponse(stats, request);
}

// Per-user stats (authenticated)
export async function onRequestGet_user({ env, data, request }) {
  // This sub-path is handled by /api/stats/user — not reachable here
  return Response.json({ error: 'Not found' }, { status: 404 });
}

async function fetchAll(kv, keys) {
  return (await Promise.all(keys.map(k => kv.get(k.name, { type: 'json' }))))
    .filter(Boolean);
}

function jsonResponse(data, request) {
  const origin  = request.headers.get('Origin') || '';
  const allowed = 'https://eccleshallcfrs-site.pages.dev';
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300',
    ...(origin === allowed || origin.endsWith('.pages.dev')
      ? { 'Access-Control-Allow-Origin': origin }
      : {}),
  };
  return new Response(JSON.stringify(data), { headers });
}
