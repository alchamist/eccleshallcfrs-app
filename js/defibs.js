CFR.requireAuth();

if (!CFR.hasFeature('defib_tracker')) { location.href = '/dashboard.html'; }

const canCheck    = CFR.hasRole('defib_manager') || CFR.hasRole('coordinator');
const canReport   = canCheck || (CFR.hasRole('compliance') && CFR.hasFeature('defib_compliance_report'));

let _activeTab = 'defibs';

function switchTab(tab) {
  _activeTab = tab;
  document.getElementById('tab-defibs').classList.toggle('hidden', tab !== 'defibs');
  document.getElementById('tab-bleed-kits').classList.toggle('hidden', tab !== 'bleed-kits');
  document.getElementById('tab-btn-defibs').className    = tab === 'defibs'      ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  document.getElementById('tab-btn-bleed-kits').className = tab === 'bleed-kits' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  if (tab === 'defibs')      loadDefibs();
  if (tab === 'bleed-kits')  loadBleedKits();
}

// ── Status chip ───────────────────────────────────────────────────────────────

function statusChip(lastCheck) {
  if (!lastCheck) return '<span class="badge badge-grey">Never checked</span>';

  const hasFault = lastCheck.faults?.length > 0;
  if (hasFault) return '<span class="badge badge-red">Fault</span>';

  const daysSince = (Date.now() - new Date(lastCheck.checked_at)) / 86400000;
  if (daysSince > 30) return '<span class="badge badge-amber">Overdue</span>';

  // Check for expiring consumables
  const now = new Date();
  const warn = date => {
    if (!date) return false;
    const d = new Date(`${date}-01`);
    return (d - now) / 86400000 < 30;
  };
  if (warn(lastCheck.pads_expiry) || warn(lastCheck.battery_expiry) || warn(lastCheck.kit_expiry)) {
    return '<span class="badge badge-amber">Expiring soon</span>';
  }

  return '<span class="badge badge-green">OK</span>';
}

function fmtChecked(lastCheck) {
  if (!lastCheck) return 'Never';
  return CFR.fmtDateTime(lastCheck.checked_at);
}

// ── Defibs ────────────────────────────────────────────────────────────────────

async function loadDefibs() {
  const el = document.getElementById('defibs-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
  try {
    const { defibs } = await CFR.apiGet('/api/defibs');
    const active = defibs.filter(d => d.active);
    if (!active.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❤️</div><h3>No defibrillators registered</h3><p>Ask your coordinator to add devices.</p></div>`;
      return;
    }
    el.innerHTML = active.map(d => `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div>
            <div style="font-weight:700; font-size:16px;">${d.group_id}</div>
            <div style="color:var(--text-muted); font-size:13px; margin:2px 0;">${d.location}</div>
            <div style="font-size:12px; color:var(--text-muted);">Checked: ${fmtChecked(d.last_check)}</div>
          </div>
          <div style="flex-shrink:0;">${statusChip(d.last_check)}</div>
        </div>
        ${canCheck ? `<div style="margin-top:10px;"><a href="/defib-check.html?id=${d.uuid}" class="btn btn-primary btn-sm btn-block">Record Check</a></div>` : ''}
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span>${e.message}</div>`;
  }
}

// ── Bleed kits ────────────────────────────────────────────────────────────────

async function loadBleedKits() {
  const el = document.getElementById('bleed-kits-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
  try {
    const { bleed_kits } = await CFR.apiGet('/api/bleed-kits');
    const active = bleed_kits.filter(b => b.active);
    if (!active.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🩸</div><h3>No bleed kits registered</h3><p>Ask your coordinator to add devices.</p></div>`;
      return;
    }
    el.innerHTML = active.map(b => `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div>
            <div style="font-weight:700; font-size:16px;">${b.group_id}</div>
            <div style="color:var(--text-muted); font-size:13px; margin:2px 0;">${b.location}</div>
            <div style="font-size:12px; color:var(--text-muted);">Checked: ${fmtChecked(b.last_check)}</div>
          </div>
          <div style="flex-shrink:0;">${statusChip(b.last_check)}</div>
        </div>
        ${canCheck ? `<div style="margin-top:10px;"><a href="/bleed-kit-check.html?id=${b.uuid}" class="btn btn-primary btn-sm btn-block">Record Check</a></div>` : ''}
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span>${e.message}</div>`;
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

async function loadReport() {
  const el = document.getElementById('report-content');
  try {
    const { defibs, bleed_kits } = await CFR.apiGet('/api/defibs/report');

    const alerts = [];

    for (const d of defibs) {
      if (d.open_faults?.length) {
        alerts.push(`<div class="alert alert-danger" style="margin-bottom:6px;"><span class="alert-icon">⚠</span><div><strong>${d.group_id}</strong> — ${d.open_faults.join(', ')}</div></div>`);
      } else if (d.overdue) {
        alerts.push(`<div class="alert alert-warning" style="margin-bottom:6px;"><span class="alert-icon">🕐</span><div><strong>${d.group_id}</strong> — Overdue for check (${d.location})</div></div>`);
      } else if (d.pads_expiry_flag === 'expired' || d.pads_expiry_flag === 'critical') {
        alerts.push(`<div class="alert alert-danger" style="margin-bottom:6px;"><span class="alert-icon">📅</span><div><strong>${d.group_id}</strong> — Pads expiry: ${d.last_check?.pads_expiry || '?'}</div></div>`);
      } else if (d.pads_expiry_flag === 'warn') {
        alerts.push(`<div class="alert alert-warning" style="margin-bottom:6px;"><span class="alert-icon">📅</span><div><strong>${d.group_id}</strong> — Pads expiring: ${d.last_check?.pads_expiry || '?'}</div></div>`);
      } else if (d.battery_expiry_flag === 'expired' || d.battery_expiry_flag === 'critical') {
        alerts.push(`<div class="alert alert-danger" style="margin-bottom:6px;"><span class="alert-icon">🔋</span><div><strong>${d.group_id}</strong> — Battery expiry: ${d.last_check?.battery_expiry || '?'}</div></div>`);
      } else if (d.battery_expiry_flag === 'warn') {
        alerts.push(`<div class="alert alert-warning" style="margin-bottom:6px;"><span class="alert-icon">🔋</span><div><strong>${d.group_id}</strong> — Battery expiring: ${d.last_check?.battery_expiry || '?'}</div></div>`);
      }
    }

    for (const b of bleed_kits) {
      if (b.open_faults?.length) {
        alerts.push(`<div class="alert alert-danger" style="margin-bottom:6px;"><span class="alert-icon">⚠</span><div><strong>${b.group_id}</strong> (bleed kit) — ${b.open_faults.join(', ')}</div></div>`);
      } else if (b.overdue) {
        alerts.push(`<div class="alert alert-warning" style="margin-bottom:6px;"><span class="alert-icon">🕐</span><div><strong>${b.group_id}</strong> (bleed kit) — Overdue for check</div></div>`);
      } else if (b.kit_expiry_flag === 'expired' || b.kit_expiry_flag === 'critical') {
        alerts.push(`<div class="alert alert-danger" style="margin-bottom:6px;"><span class="alert-icon">📅</span><div><strong>${b.group_id}</strong> (bleed kit) — Kit expiry: ${b.last_check?.kit_expiry || '?'}</div></div>`);
      } else if (b.kit_expiry_flag === 'warn') {
        alerts.push(`<div class="alert alert-warning" style="margin-bottom:6px;"><span class="alert-icon">📅</span><div><strong>${b.group_id}</strong> (bleed kit) — Kit expiring: ${b.last_check?.kit_expiry || '?'}</div></div>`);
      }
    }

    if (!alerts.length) {
      el.innerHTML = '<p style="color:var(--text-muted); font-size:14px; margin:0;">All equipment is OK — no faults or upcoming expiries.</p>';
      document.getElementById('report-panel').classList.remove('hidden');
    } else {
      el.innerHTML = alerts.join('');
      document.getElementById('report-panel').classList.remove('hidden');
    }
  } catch (e) {
    // Silently hide report panel if not authorised (e.g. compliance without flag)
    document.getElementById('report-panel').classList.add('hidden');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

if (canReport) loadReport();

const initTab = new URLSearchParams(location.search).get('tab');
if (initTab === 'bleed-kits') switchTab('bleed-kits');
else loadDefibs();
