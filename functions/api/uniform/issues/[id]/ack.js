const AGREEMENT_TEXT = 'I acknowledge receipt of the listed uniform item(s) and agree to return them on request from the group coordinator.';

// POST /api/uniform/issues/:id/ack — responder acknowledges receipt
export async function onRequestPost({ env, data, params }) {
  const { id } = params;
  const issue = await env.CFR_DATA.get(`uniform_issue:index:${id}`, { type: 'json' });
  if (!issue) return Response.json({ error: 'Not found' }, { status: 404 });

  // Only the issue owner or a manager can acknowledge
  const roles = data.user.roles || [];
  const isOwner   = issue.responder_id === data.user.id || issue.responder_id === data.user.access_key;
  const isManager = roles.includes('coordinator') || roles.includes('uniform_officer');
  if (!isOwner && !isManager) {
    return Response.json({ error: 'You can only acknowledge your own uniform items.' }, { status: 403 });
  }

  const ack = {
    issue_uuid:       id,
    acknowledged_at:  new Date().toISOString(),
    responder_name:   issue.responder_name,
    agreement_text:   AGREEMENT_TEXT,
  };

  issue.status = 'acknowledged';
  issue.ack_record = ack;
  issue.updated_at = new Date().toISOString();

  await Promise.all([
    env.CFR_DATA.put(`uniform_ack:${id}`, JSON.stringify(ack)),
    env.CFR_DATA.put(`uniform_issue:index:${id}`, JSON.stringify(issue)),
  ]);
  if (issue._kv_key) {
    const stored = await env.CFR_DATA.get(issue._kv_key, { type: 'json' });
    if (stored) await env.CFR_DATA.put(issue._kv_key, JSON.stringify({ ...stored, ...issue }));
  }

  return Response.json({ ack });
}
