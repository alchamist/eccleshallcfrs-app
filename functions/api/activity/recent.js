// GET /api/activity/recent — responder's own recent submissions across all types

export async function onRequestGet({ env, data }) {
  const { user } = data;
  const uid      = user.id;

  const prefixes = [
    { prefix: 'duty:',    t: 'duty',   nameField: 'responder_id' },
    { prefix: 'vdi:',     t: 'vdi',    nameField: 'completed_by_id' },
    { prefix: 'claim:',   t: 'claim',  nameField: 'responder_id' },
  ];

  const allItems = (await Promise.all(
    prefixes.map(async ({ prefix, t, nameField }) => {
      const { keys } = await env.CFR_DATA.list({ prefix });
      const recent = keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 30);
      const records = (await Promise.all(recent.map(k => env.CFR_DATA.get(k.name, { type: 'json' }))))
        .filter(r => r && r[nameField] === uid)
        .map(r => ({ type: t, date: r.date || r.submitted_at?.slice(0, 10), id: r.id }));
      return records;
    })
  )).flat()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 10);

  return Response.json({ items: allItems });
}
