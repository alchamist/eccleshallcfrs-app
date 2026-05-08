// Public endpoint — returns current active duty status (on/off duty)
// Called by eccleshallcfrs-site.pages.dev

export async function onRequestGet({ env, request }) {
  try {
    const activeId = await env.CFR_DATA.get('vshift:active');

    if (!activeId) {
      return jsonResponse({ active: false }, request);
    }

    // Find the active shift record
    const { keys } = await env.CFR_DATA.list({ prefix: 'vshift:' });
    const k = keys.find(k => k.name !== 'vshift:active' && k.name.includes(activeId));

    if (!k) {
      return jsonResponse({ active: false }, request);
    }

    const shift = await env.CFR_DATA.get(k.name, { type: 'json' });

    if (!shift || shift.status !== 'active') {
      return jsonResponse({ active: false }, request);
    }

    // Check if there's any crew not signed off
    const hasActiveCrew = shift.crew && shift.crew.some(c => !c.signed_off);

    return jsonResponse({
      active: hasActiveCrew,
      vehicle: 'RC0681',
    }, request);
  } catch {
    return jsonResponse({ active: false }, request, 500);
  }
}

function jsonResponse(data, request, status = 200) {
  const origin  = request.headers.get('Origin') || '';
  const allowed = 'https://eccleshallcfrs-site.pages.dev';
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=30',
    ...(origin === allowed || origin.endsWith('.pages.dev')
      ? { 'Access-Control-Allow-Origin': origin }
      : {}),
  };
  return new Response(JSON.stringify(data), { status, headers });
}
