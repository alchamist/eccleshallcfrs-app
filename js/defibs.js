CFR.requireAuth();

if (!CFR.hasFeature('defib_tracker')) { location.href = '/dashboard.html'; }

const canCheck    = CFR.hasRole('defib_manager') || CFR.hasRole('coordinator');
const canReport   = canCheck || (CFR.hasRole('compliance') && CFR.hasFeature('defib_compliance_report'));

let _activeTab = 'defibs';
let _defibs = [];
let _bleedKits = [];

if (canCheck) {
  document.getElementById('add-defib-btn-row').classList.remove('hidden');
  document.getElementById('add-bk-btn-row').classList.remove('hidden');
}

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
    _defibs = defibs;
    const active = defibs.filter(d => d.active);
    if (!active.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❤️</div><h3>No defibrillators registered</h3>${canCheck ? '<p>Use the button above to add the first device.</p>' : '<p>Ask your coordinator to add devices.</p>'}</div>`;
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
        ${canCheck ? `<div style="display:flex; gap:6px; margin-top:10px;">
          <a href="/defib-check.html?id=${d.uuid}" class="btn btn-primary btn-sm" style="flex:1;">Record Check</a>
          <button class="btn btn-ghost btn-sm" onclick="openDefibModal('${d.uuid}')">Edit</button>
        </div>` : ''}
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
    _bleedKits = bleed_kits;
    const active = bleed_kits.filter(b => b.active);
    if (!active.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🩸</div><h3>No bleed kits registered</h3>${canCheck ? '<p>Use the button above to add the first device.</p>' : '<p>Ask your coordinator to add devices.</p>'}</div>`;
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
        ${canCheck ? `<div style="display:flex; gap:6px; margin-top:10px;">
          <a href="/bleed-kit-check.html?id=${b.uuid}" class="btn btn-primary btn-sm" style="flex:1;">Record Check</a>
          <button class="btn btn-ghost btn-sm" onclick="openBleedKitModal('${b.uuid}')">Edit</button>
        </div>` : ''}
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

// ── Device management modals (defib_manager + coordinator) ───────────────────

function openDefibModal(uuid) {
  const d = uuid ? _defibs.find(x => x.uuid === uuid) : null;
  document.getElementById('defib-modal-title').textContent = d ? 'Edit Defibrillator' : 'Add Defibrillator';
  document.getElementById('defib-modal-uuid').value        = uuid || '';
  document.getElementById('defib-group-id').value          = d?.group_id             || '';
  document.getElementById('defib-location').value          = d?.location             || '';
  document.getElementById('defib-make').value              = d?.make                 || '';
  document.getElementById('defib-model').value             = d?.model                || '';
  document.getElementById('defib-serial').value            = d?.serial_number        || '';
  document.getElementById('defib-lock-code').value         = d?.case_lock_code       || '';
  document.getElementById('defib-install-date').value      = d?.installation_date    || '';
  document.getElementById('defib-responsible').value       = d?.responsible_person   || '';
  document.getElementById('defib-contact').value           = d?.contact_number       || '';
  document.getElementById('defib-on-circuit').checked      = d?.registered_on_circuit || false;
  document.getElementById('defib-deactivate-row').classList.toggle('hidden', !uuid);
  document.getElementById('defib-modal').classList.remove('hidden');
}

function closeDefibModal(e) {
  if (e && e.target !== document.getElementById('defib-modal')) return;
  document.getElementById('defib-modal').classList.add('hidden');
}

async function saveDefib() {
  const uuid     = document.getElementById('defib-modal-uuid').value;
  const group_id = document.getElementById('defib-group-id').value.trim();
  const location = document.getElementById('defib-location').value.trim();
  if (!group_id || !location) { CFR.toast('Group ID and location are required.', 'warning'); return; }

  const body = {
    group_id, location,
    make:               document.getElementById('defib-make').value.trim(),
    model:              document.getElementById('defib-model').value.trim(),
    serial_number:      document.getElementById('defib-serial').value.trim(),
    case_lock_code:     document.getElementById('defib-lock-code').value.trim(),
    installation_date:  document.getElementById('defib-install-date').value || null,
    responsible_person: document.getElementById('defib-responsible').value.trim(),
    contact_number:     document.getElementById('defib-contact').value.trim(),
    registered_on_circuit: document.getElementById('defib-on-circuit').checked,
  };

  try {
    if (uuid) {
      await CFR.apiPatch(`/api/defibs/${uuid}`, body);
    } else {
      await CFR.apiPost('/api/defibs', body);
    }
    document.getElementById('defib-modal').classList.add('hidden');
    CFR.toast(uuid ? 'Defib updated.' : 'Defib added.', 'success');
    await loadDefibs();
    loadReport();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function deactivateDefib() {
  const uuid = document.getElementById('defib-modal-uuid').value;
  if (!uuid || !confirm('Deactivate this defibrillator? It will no longer appear in the active list.')) return;
  try {
    await CFR.apiPatch(`/api/defibs/${uuid}`, { active: false });
    document.getElementById('defib-modal').classList.add('hidden');
    CFR.toast('Defib deactivated.', 'success');
    loadDefibs();
    loadReport();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

function openBleedKitModal(uuid) {
  const b = uuid ? _bleedKits.find(x => x.uuid === uuid) : null;
  document.getElementById('bleed-kit-modal-title').textContent = b ? 'Edit Bleed Kit' : 'Add Bleed Kit';
  document.getElementById('bleed-kit-modal-uuid').value        = uuid || '';
  document.getElementById('bk-group-id').value                 = b?.group_id           || '';
  document.getElementById('bk-location').value                 = b?.location           || '';
  document.getElementById('bk-lock-code').value                = b?.cabinet_lock_code  || '';
  document.getElementById('bk-responsible').value              = b?.responsible_person || '';
  document.getElementById('bk-contact').value                  = b?.contact_number     || '';
  document.getElementById('bleed-kit-deactivate-row').classList.toggle('hidden', !uuid);
  document.getElementById('bleed-kit-modal').classList.remove('hidden');
}

function closeBleedKitModal(e) {
  if (e && e.target !== document.getElementById('bleed-kit-modal')) return;
  document.getElementById('bleed-kit-modal').classList.add('hidden');
}

async function saveBleedKit() {
  const uuid     = document.getElementById('bleed-kit-modal-uuid').value;
  const group_id = document.getElementById('bk-group-id').value.trim();
  const location = document.getElementById('bk-location').value.trim();
  if (!group_id || !location) { CFR.toast('Group ID and location are required.', 'warning'); return; }

  const body = {
    group_id, location,
    cabinet_lock_code:  document.getElementById('bk-lock-code').value.trim(),
    responsible_person: document.getElementById('bk-responsible').value.trim(),
    contact_number:     document.getElementById('bk-contact').value.trim(),
  };

  try {
    if (uuid) {
      await CFR.apiPatch(`/api/bleed-kits/${uuid}`, body);
    } else {
      await CFR.apiPost('/api/bleed-kits', body);
    }
    document.getElementById('bleed-kit-modal').classList.add('hidden');
    CFR.toast(uuid ? 'Bleed kit updated.' : 'Bleed kit added.', 'success');
    await loadBleedKits();
    loadReport();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function deactivateBleedKit() {
  const uuid = document.getElementById('bleed-kit-modal-uuid').value;
  if (!uuid || !confirm('Deactivate this bleed kit? It will no longer appear in the active list.')) return;
  try {
    await CFR.apiPatch(`/api/bleed-kits/${uuid}`, { active: false });
    document.getElementById('bleed-kit-modal').classList.add('hidden');
    CFR.toast('Bleed kit deactivated.', 'success');
    loadBleedKits();
    loadReport();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}
