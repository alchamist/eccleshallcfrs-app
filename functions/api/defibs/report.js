const OVERDUE_DAYS = 30;
const EXPIRY_WARN_DAYS = 30;

function canReadReport(user, features) {
  const roles = user.roles || [];
  if (roles.includes('coordinator') || roles.includes('defib_manager')) return true;
  if (roles.includes('compliance') && features?.defib_compliance_report) return true;
  return false;
}

function expiryFlag(yyyyMM) {
  if (!yyyyMM) return null;
  const now = new Date();
  const exp = new Date(`${yyyyMM}-01`);
  const diffDays = (exp - now) / 86400000;
  if (diffDays < 0)              return 'expired';
  if (diffDays < 7)              return 'critical';
  if (diffDays < EXPIRY_WARN_DAYS) return 'warn';
  return 'ok';
}

function overdueFlag(checkedAt) {
  if (!checkedAt) return true;
  const diffDays = (Date.now() - new Date(checkedAt)) / 86400000;
  return diffDays > OVERDUE_DAYS;
}

export async function onRequestGet({ env, data }) {
  const { user } = data;
  const features = await env.CFR_DATA.get('config:features', { type: 'json' }) || {};
  if (!canReadReport(user, features)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [defibIndex, bkIndex, allChecks] = await Promise.all([
    env.CFR_DATA.get('defibs:index', { type: 'json' }),
    env.CFR_DATA.get('bleed_kits:index', { type: 'json' }),
    env.CFR_DATA.list({ prefix: 'defib_check:' }),
  ]);
  const [allBkChecks] = await Promise.all([
    env.CFR_DATA.list({ prefix: 'bleed_kit_check:' }),
  ]);

  const defibs = (await Promise.all(
    (defibIndex || []).map(id => env.CFR_DATA.get(`defib:${id}`, { type: 'json' }))
  )).filter(d => d?.active);

  const bleedKits = (await Promise.all(
    (bkIndex || []).map(id => env.CFR_DATA.get(`bleed_kit:${id}`, { type: 'json' }))
  )).filter(b => b?.active);

  // Build last-check map for defibs
  const defibLastCheck = {};
  const sortedDefibChecks = allChecks.keys.sort((a, b) => b.name.localeCompare(a.name));
  for (const k of sortedDefibChecks) {
    const uuid = k.metadata?.defib_uuid;
    if (uuid && !defibLastCheck[uuid]) {
      defibLastCheck[uuid] = await env.CFR_DATA.get(k.name, { type: 'json' });
    }
  }

  // Build last-check map for bleed kits
  const bkLastCheck = {};
  const sortedBkChecks = allBkChecks.keys.sort((a, b) => b.name.localeCompare(a.name));
  for (const k of sortedBkChecks) {
    const uuid = k.metadata?.bleed_kit_uuid;
    if (uuid && !bkLastCheck[uuid]) {
      bkLastCheck[uuid] = await env.CFR_DATA.get(k.name, { type: 'json' });
    }
  }

  const defibReport = defibs.map(d => {
    const lc = defibLastCheck[d.uuid] || null;
    return {
      ...d,
      last_check: lc,
      overdue: overdueFlag(lc?.checked_at),
      open_faults: lc?.faults?.length ? lc.faults : [],
      pads_expiry_flag:    expiryFlag(lc?.pads_expiry),
      battery_expiry_flag: expiryFlag(lc?.battery_expiry),
    };
  });

  const bkReport = bleedKits.map(b => {
    const lc = bkLastCheck[b.uuid] || null;
    return {
      ...b,
      last_check: lc,
      overdue: overdueFlag(lc?.checked_at),
      open_faults: lc?.faults?.length ? lc.faults : [],
      kit_expiry_flag: expiryFlag(lc?.kit_expiry),
    };
  });

  return Response.json({ defibs: defibReport, bleed_kits: bkReport });
}
