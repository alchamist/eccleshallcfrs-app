// Public endpoint — returns current active duty status (on/off duty)
// Called by eccleshallcfrs-site.pages.dev

export async function onRequestGet({ env, request }) {
  try {
    const url        = new URL(request.url);
    const showNames  = url.searchParams.get('names') === 'true';

    const activeId = await env.CFR_DATA.get('vshift:active');
    if (!activeId) return jsonResponse({ active: false }, request);

    const { keys } = await env.CFR_DATA.list({ prefix: 'vshift:' });
    const k = keys.find(k => k.name !== 'vshift:active' && k.name.includes(activeId));
    if (!k) return jsonResponse({ active: false }, request);

    const shift = await env.CFR_DATA.get(k.name, { type: 'json' });
    if (!shift || shift.status !== 'active') return jsonResponse({ active: false }, request);

    const activeCrew = (shift.crew || []).filter(c => !c.signed_off);
    if (!activeCrew.length) return jsonResponse({ active: false }, request);

    const vcfg    = await env.CFR_DATA.get('config:vehicle', { type: 'json' });
    const payload = { active: true, vehicle: vcfg?.callsign || 'RC0681' };

    if (showNames) {
      payload.crew = activeCrew.map(c => ({ name: c.name, role: c.role }));
    }

    return jsonResponse(payload, request);
  } catch {
    return jsonResponse({ active: false }, request, 500);
  }
}

function allowedOrigin(origin) {
  return origin.endsWith('.pages.dev') ||
         origin.endsWith('.eccleshallcfrs.org.uk') ||
         origin === 'https://eccleshallcfrs.org.uk';
}

function jsonResponse(data, request, status = 200) {
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=30',
    ...(allowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
  return new Response(JSON.stringify(data), { status, headers });
}
