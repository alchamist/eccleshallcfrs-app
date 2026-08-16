// POST /api/maintenance/alert — coordinator only
// Sends an email summarising overdue/upcoming maintenance items.
// Recipient: config:vehicle.coordinator_email (set via coordinator settings), falling back to COORDINATOR_EMAIL env secret.

export async function onRequestPost({ env, data }) {
  if (!data.user.roles?.includes('coordinator')) {
    return Response.json({ error: 'Coordinator role required' }, { status: 403 });
  }

  const config = await env.CFR_DATA.get('config:vehicle', { type: 'json' }) || {};
  const email  = config.coordinator_email || env.COORDINATOR_EMAIL;
  if (!email) {
    return Response.json({ error: 'No coordinator email configured. Set one in Vehicle Settings.' }, { status: 503 });
  }
  const schemeName = config.scheme_name || 'CFR';
  const callsign   = config.callsign   || '';
  const m = config.maintenance || {};

  const today      = new Date(); today.setHours(0, 0, 0, 0);
  const daysUntil  = d => Math.floor((new Date(d) - today) / 86400000);

  const { keys } = await env.CFR_DATA.list({ prefix: 'maintenance_log:' });
  keys.sort((a, b) => b.name.localeCompare(a.name));
  const entries = (await Promise.all(keys.map(k => env.CFR_DATA.get(k.name, { type: 'json' })))).filter(Boolean);
  const lastDone = type => { const e = entries.find(x => x.type === type); return e ? e.done_at : null; };

  const alerts = [];

  for (const [type, label] of [['mot', 'MOT'], ['service', 'Service'], ['insurance', 'Insurance']]) {
    const due  = m[type]?.next_due;
    if (!due) continue;
    const days = daysUntil(due);
    const warn = m[type]?.warn_days ?? 30;
    if (days <= warn) {
      const status = days < 0 ? `OVERDUE by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}` : `due in ${days} day${days !== 1 ? 's' : ''} (${due})`;
      alerts.push(`• ${label}: ${status}`);
    }
  }

  const cleanInterval = m.deep_clean?.interval_days ?? 60;
  const cleanWarn     = m.deep_clean?.warn_days ?? 7;
  const lastClean     = lastDone('deep_clean');
  if (lastClean) {
    const nextClean = new Date(lastClean);
    nextClean.setDate(nextClean.getDate() + cleanInterval);
    const days = daysUntil(nextClean.toISOString().slice(0, 10));
    if (days <= cleanWarn) {
      const status = days < 0 ? `OVERDUE by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}` : `due in ${days} day${days !== 1 ? 's' : ''}`;
      alerts.push(`• Deep Clean: ${status}`);
    }
  }

  if (!alerts.length) {
    return Response.json({ message: 'No maintenance items are currently due — no email sent.' });
  }

  const subject = `[${callsign}] Maintenance Alert — ${alerts.length} item${alerts.length !== 1 ? 's' : ''} require attention`;
  const body = [
    `${schemeName} — Maintenance Alert`,
    '',
    'The following maintenance items require attention:',
    '',
    ...alerts,
    '',
    `Sent automatically from the ${schemeName} CFR App.`,
  ].join('\n');

  const mailRes = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: 'noreply@romeocharlie.co.uk', name: schemeName },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });

  if (!mailRes.ok && mailRes.status !== 202) {
    const err = await mailRes.text().catch(() => '');
    console.error('Mailchannels error:', mailRes.status, err);
    return Response.json({ error: `Email delivery failed (${mailRes.status})` }, { status: 502 });
  }

  return Response.json({ sent: true, alerts_count: alerts.length, recipient: email });
}
