// Public endpoint — returns hours on duty and incidents attended for a timespan
// Query params: period=TODAY|WEEK|MONTH|YEAR or from=YYYY-MM-DD&to=YYYY-MM-DD
// Called by eccleshallcfrs-site.pages.dev

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || 'MONTH';
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let startDate, endDate;

    if (from && to) {
      // Custom date range
      startDate = new Date(from);
      endDate = new Date(to);
    } else {
      // Period-based
      const now = new Date();
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      switch (period.toUpperCase()) {
        case 'TODAY':
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'WEEK':
          startDate = new Date(now);
          const day = startDate.getDay();
          startDate.setDate(startDate.getDate() - day); // Start of week (Sunday)
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'YEAR':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'MONTH':
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
    }

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Fetch all duty and incident records for the date range
    const [dutyKeys, claimKeys] = await Promise.all([
      env.CFR_DATA.list({ prefix: 'duty:' }),
      env.CFR_DATA.list({ prefix: 'claim:' }),
    ]);

    const [dutyRecords, claimRecords] = await Promise.all([
      fetchAll(env.CFR_DATA, dutyKeys.keys),
      fetchAll(env.CFR_DATA, claimKeys.keys),
    ]);

    // Filter by date range
    const dutyInRange = dutyRecords.filter(d => {
      const dDate = d.date || '';
      return dDate >= startStr && dDate <= endStr;
    });

    const claimsInRange = claimRecords.filter(c => {
      const cDate = c.date || '';
      return cDate >= startStr && cDate <= endStr;
    });

    const totalDutyMins = dutyInRange.reduce((s, d) => s + (d.duration_mins || 0), 0);
    const totalIncidents = claimsInRange.filter(c => c.incident_type && c.incident_type !== 'na').length;

    return jsonResponse({
      period: period.toUpperCase(),
      from: startStr,
      to: endStr,
      hours: Math.round((totalDutyMins / 60) * 10) / 10, // 1 decimal place
      incidents: totalIncidents,
    }, request);
  } catch (e) {
    console.error('Status metrics error:', e);
    return jsonResponse({
      period: 'ERROR',
      hours: 0,
      incidents: 0,
      error: 'Could not compute metrics',
    }, request, 500);
  }
}

async function fetchAll(kv, keys) {
  return (await Promise.all(keys.map(k => kv.get(k.name, { type: 'json' }))))
    .filter(Boolean);
}

function jsonResponse(data, request, status = 200) {
  const origin  = request.headers.get('Origin') || '';
  const allowed = 'https://eccleshallcfrs-site.pages.dev';
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60',
    ...(origin === allowed || origin.endsWith('.pages.dev')
      ? { 'Access-Control-Allow-Origin': origin }
      : {}),
  };
  return new Response(JSON.stringify(data), { status, headers });
}
