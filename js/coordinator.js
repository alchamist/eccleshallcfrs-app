CFR.requireAuth();
CFR.requireRole('coordinator');

let activeTab = 'submissions';
let _users    = [];

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.className = b.dataset.tab === tab
      ? 'btn btn-primary btn-sm tab-btn'
      : 'btn btn-ghost btn-sm tab-btn';
  });
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  activeTab = tab;

  if (tab === 'submissions') loadSubmissions();
  if (tab === 'report')      initReportPickers();
  if (tab === 'users')       loadUsers();
  if (tab === 'stats')       loadStats();
}

// ── Submissions ───────────────────────────────────────────────────────────────

async function loadSubmissions() {
  const list = document.getElementById('submissions-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  const type = document.getElementById('filter-type').value;
  const from = document.getElementById('filter-from').value;
  const to   = document.getElementById('filter-to').value;

  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  try {
    const { items } = await CFR.apiGet(`/api/submissions?${params}`);
    if (!items || items.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h3>No submissions found</h3>
          <p>Try adjusting your filters.</p>
        </div>`;
      return;
    }

    const typeIcons  = { duty:'⏱', vshift:'🚗', vdi:'✔', claim:'📄', monthly:'📋' };
    const typeLabels = { duty:'Duty Log', vshift:'Vehicle Shift', vdi:'Inspection', claim:'Mileage Claim', monthly:'Monthly Check' };

    list.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Type</th><th>Date</th><th>Responder</th><th>Summary</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => {
              const summary = formatSummary(item);
              const keyAttr = item._key ? ` data-key="${item._key}"` : '';
              return `
                <tr>
                  <td>${typeIcons[item.type] || ''} ${typeLabels[item.type] || item.type}</td>
                  <td>${CFR.fmtDate(item.date)}</td>
                  <td>${item.responder_name || item.completed_by_name || '—'}</td>
                  <td class="text-muted">${summary}</td>
                  <td><button class="btn btn-sm btn-ghost" style="color:var(--red);"
                       onclick="deleteSubmission('${item._key || ''}', '${typeLabels[item.type] || item.type}', '${CFR.fmtDate(item.date)}')">Delete</button></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    list.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span>${e.message}</div>`;
  }
}

function formatSummary(item) {
  if (item.type === 'duty') return `${CFR.fmtDuration(item.duration_mins)} · ${item.incidents_attended} attended`;
  if (item.type === 'vshift') {
    const crew = (item.crew || []).map(c => c.name).join(', ');
    return `${crew} · ${item.number_of_jobs ?? '?'} jobs`;
  }
  if (item.type === 'vdi')     return item.overall_pass ? '✓ Pass' : '⚠ Issues flagged';
  if (item.type === 'claim')   return `${item.total_miles} miles · ${item.incident_type || '—'}`;
  if (item.type === 'monthly') return item.overall_pass ? '✓ Pass' : '⚠ Issues flagged';
  return '';
}

async function deleteSubmission(key, typeLabel, dateStr) {
  if (!key) { CFR.toast('Cannot delete this record.', 'error'); return; }
  if (!confirm(`Delete this ${typeLabel} record from ${dateStr}?\n\nThis cannot be undone.`)) return;
  try {
    await CFR.apiDelete(`/api/submissions?key=${encodeURIComponent(key)}`);
    CFR.toast('Record deleted.', 'success');
    loadSubmissions();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

async function downloadExport() {
  const from       = document.getElementById('export-from').value;
  const to         = document.getElementById('export-to').value;
  const responder  = document.getElementById('export-responder').value;

  const params = new URLSearchParams({ type: 'mileage-claims' });
  if (from)      params.set('from', from);
  if (to)        params.set('to', to);
  if (responder) params.set('responder_id', responder);

  try {
    const res = await fetch(`/api/export?${params}`, {
      headers: { Authorization: `Bearer ${CFR.getAccessKey()}` },
    });
    if (!res.ok) { CFR.toast('Export failed.', 'error'); return; }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mileage-claims-${from || 'all'}-${to || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function downloadDutyExport() {
  const from = document.getElementById('duty-export-from').value;
  const to   = document.getElementById('duty-export-to').value;

  const params = new URLSearchParams({ type: 'duty-hours' });
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  try {
    const res = await fetch(`/api/export?${params}`, {
      headers: { Authorization: `Bearer ${CFR.getAccessKey()}` },
    });
    if (!res.ok) { CFR.toast('Export failed.', 'error'); return; }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `duty-hours-${from || 'all'}-${to || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

// ── Device PIN ────────────────────────────────────────────────────────────────

async function setDevicePin() {
  const pin    = document.getElementById('device-pin-input').value.trim();
  const status = document.getElementById('device-pin-status');

  if (!/^\d{4,8}$/.test(pin)) {
    CFR.toast('PIN must be 4–8 digits.', 'warning');
    return;
  }

  try {
    await CFR.apiPost('/api/device-pin', { pin });
    document.getElementById('device-pin-input').value = '';
    status.innerHTML = '<div class="alert alert-success" style="margin:0;"><span class="alert-icon">✓</span> Device PIN updated successfully.</div>';
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 4000);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────

async function loadUsers() {
  const list = document.getElementById('users-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    const { users } = await CFR.apiGet('/api/users');
    _users = users || [];
    populateExportResponders(users);

    if (!users || users.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>No responders yet.</p></div>';
      return;
    }

    list.innerHTML = users.map(u => `
      <div class="card" style="margin-bottom:10px; padding:14px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:15px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              ${u.name}
              <span class="badge ${u.active ? 'badge-green' : 'badge-grey'}">${u.active ? 'Active' : 'Disabled'}</span>
            </div>
            <div style="font-size:13px; color:var(--text-muted); margin-top:3px;">
              ${(u.roles || []).join(', ')}${u.prf_number ? ` · PRF ${u.prf_number}` : ''}
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button class="btn btn-sm btn-ghost" onclick="openEditModal('${u.access_key}')">Edit</button>
            ${u.active
              ? `<button class="btn btn-sm btn-ghost" style="color:var(--red);" onclick="toggleUser('${u.access_key}', false)">Disable</button>`
              : `<button class="btn btn-sm btn-success" onclick="toggleUser('${u.access_key}', true)">Enable</button>`
            }
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="alert alert-danger"><span>⚠</span>${e.message}</div>`;
  }
}

function populateExportResponders(users) {
  const sel = document.getElementById('export-responder');
  sel.innerHTML = '<option value="">All responders</option>' +
    (users || []).map(u => `<option value="${u.id}">${u.name}</option>`).join('');
}

async function createUser() {
  const name       = document.getElementById('new-name').value.trim();
  const prf_number = document.getElementById('new-prf').value.trim();
  const roles      = [];

  if (document.getElementById('role-responder').checked)   roles.push('responder');
  if (document.getElementById('role-coordinator').checked) roles.push('coordinator');
  if (document.getElementById('role-compliance').checked)  roles.push('compliance');

  if (!name)         { CFR.toast('Please enter a name.', 'warning'); return; }
  if (!roles.length) { CFR.toast('Please select at least one role.', 'warning'); return; }

  try {
    const { access_key, user } = await CFR.apiPost('/api/users', { name, prf_number, roles });
    document.getElementById('new-key-value').textContent = access_key;
    document.getElementById('new-key-display').classList.remove('hidden');
    document.getElementById('new-name').value = '';
    document.getElementById('new-prf').value = '';
    document.getElementById('role-responder').checked = true;
    document.getElementById('role-coordinator').checked = false;
    document.getElementById('role-compliance').checked = false;
    loadUsers();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

function openEditModal(accessKey) {
  const user = _users.find(u => u.access_key === accessKey);
  if (!user) { CFR.toast('Could not load user data.', 'error'); return; }
  document.getElementById('edit-access-key').value = accessKey;
  document.getElementById('edit-name').value        = user.name || '';
  document.getElementById('edit-prf').value         = user.prf_number || '';
  document.getElementById('edit-role-responder').checked   = (user.roles || []).includes('responder');
  document.getElementById('edit-role-coordinator').checked = (user.roles || []).includes('coordinator');
  document.getElementById('edit-role-compliance').checked  = (user.roles || []).includes('compliance');
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById('edit-modal')) return;
  document.getElementById('edit-modal').classList.add('hidden');
  document.getElementById('regen-key-display').classList.add('hidden');
}

async function saveEdit() {
  const access_key = document.getElementById('edit-access-key').value;
  const name       = document.getElementById('edit-name').value.trim();
  const prf_number = document.getElementById('edit-prf').value.trim();
  const roles      = [];

  if (document.getElementById('edit-role-responder').checked)   roles.push('responder');
  if (document.getElementById('edit-role-coordinator').checked) roles.push('coordinator');
  if (document.getElementById('edit-role-compliance').checked)  roles.push('compliance');

  if (!name)         { CFR.toast('Name is required.', 'warning'); return; }
  if (!roles.length) { CFR.toast('At least one role required.', 'warning'); return; }

  try {
    await CFR.apiPatch('/api/users', { access_key, name, prf_number, roles });
    document.getElementById('edit-modal').classList.add('hidden');
    CFR.toast('User updated.', 'success');
    loadUsers();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function regenerateKey() {
  const access_key = document.getElementById('edit-access-key').value;
  const name       = document.getElementById('edit-name').value || 'this user';
  if (!confirm(`Generate a new access key for ${name}? Their current key will stop working immediately.`)) return;

  try {
    const { access_key: newKey } = await CFR.apiPatch('/api/users', { access_key, regenerate_key: true });
    document.getElementById('edit-access-key').value  = newKey;
    document.getElementById('regen-key-value').textContent = newKey;
    document.getElementById('regen-key-display').classList.remove('hidden');
    CFR.toast('New key generated.', 'success');
    loadUsers();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function toggleUser(access_key, active) {
  try {
    await CFR.apiPatch('/api/users', { access_key, active });
    loadUsers();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

// ── Monthly Report ────────────────────────────────────────────────────────────

const CAT_LABELS = {
  cat1: 'Category 1', cat2: 'Category 2', cat3: 'Category 3', cat4: 'Category 4',
  unknown: 'Unknown', backup: 'Backup', movement: 'Movement / Travel',
};
const TYPE_LABELS = {
  cardiac_arrest: 'Cardiac Arrest', unconscious: 'Unconscious / Not Responding',
  breathing_difficulty: 'Breathing Difficulty', anaphylaxis: 'Anaphylaxis',
  rtc: 'Road Traffic Collision', trauma: 'Trauma', chest_pain: 'Chest Pain',
  fall: 'Fall', stroke: 'Stroke / TIA', mental_health: 'Mental Health',
  concern_welfare: 'Concern for Welfare', sepsis: 'Sepsis',
  major_incident: 'Major Incident', other: 'Other',
};
const AGE_LABELS = { adult: 'Adult', paediatric: 'Paediatric', unknown: 'Unknown', na: 'N/A' };
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function initReportPickers() {
  const monthSel = document.getElementById('report-month');
  const yearSel  = document.getElementById('report-year');
  if (monthSel.options.length) return; // already initialised

  MONTH_NAMES.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = String(i + 1).padStart(2, '0');
    opt.textContent = name;
    monthSel.appendChild(opt);
  });

  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 3; y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    yearSel.appendChild(opt);
  }

  monthSel.value = String(new Date().getMonth() + 1).padStart(2, '0');
  yearSel.value  = String(currentYear);
}

async function loadReport() {
  const content = document.getElementById('report-content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Generating report…</div>';

  const month = document.getElementById('report-month').value;
  const year  = document.getElementById('report-year').value;

  try {
    const data = await CFR.apiGet(`/api/reports/monthly?year=${year}&month=${month}`);
    renderReport(data, content);
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span>${e.message}</div>`;
  }
}

function renderReport(data, el) {
  const { period, responders, vehicle, incidents } = data;
  const periodLabel = `${MONTH_NAMES[parseInt(period.month, 10) - 1]} ${period.year}`;

  // ── Responder hours table ────────────────────────────────────────────────
  const responderRows = responders.map(r => {
    const hrs   = r.duty_hours.toFixed(1);
    const zero  = r.duty_mins === 0;
    return `<tr${zero ? ' style="color:var(--text-muted);"' : ''}>
      <td>${r.name}</td>
      <td style="text-align:center;">${r.duty_logs}</td>
      <td style="text-align:center; font-weight:${zero ? '400' : '600'};">${hrs} h</td>
      <td style="text-align:center;">${r.incidents_attended}</td>
      <td style="text-align:center;">${r.incidents_allocated}</td>
    </tr>`;
  }).join('');

  // ── Breakdown helper ─────────────────────────────────────────────────────
  function breakdownCard(title, counts, labels) {
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (total === 0) return `<div class="card"><p class="card-title">${title}</p><p class="text-muted text-sm">No data</p></div>`;
    const rows = Object.entries(counts).map(([k, n]) => {
      const label = labels?.[k] || k;
      const pct   = Math.round(n / total * 100);
      return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <div style="flex:1; font-size:13px;">${label}</div>
        <div style="font-size:13px; font-weight:600; min-width:28px; text-align:right;">${n}</div>
        <div style="width:80px; background:var(--border); border-radius:4px; height:6px; overflow:hidden;">
          <div style="width:${pct}%; background:var(--blue); height:100%;"></div>
        </div>
      </div>`;
    }).join('');
    return `<div class="card"><p class="card-title">${title}</p>${rows}</div>`;
  }

  const locationCard = Object.keys(incidents.by_location || {}).length
    ? breakdownCard('By Location', incidents.by_location, null)
    : `<div class="card"><p class="card-title">By Location</p><p class="text-muted text-sm">Location field not yet recorded on claims.</p></div>`;

  el.innerHTML = `
    <p class="section-heading">${periodLabel}</p>

    <p class="section-heading" style="margin-top:0;">Responder Duty Hours</p>
    <div class="card" style="padding:0; overflow:hidden;">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Responder</th>
            <th style="text-align:center;">Logs</th>
            <th style="text-align:center;">Hours</th>
            <th style="text-align:center;">Attended</th>
            <th style="text-align:center;">Allocated</th>
          </tr></thead>
          <tbody>${responderRows || '<tr><td colspan="5" class="text-muted text-sm" style="text-align:center; padding:16px;">No duty logs this month</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <p class="section-heading">Vehicle on Duty</p>
    <div class="stats-grid" style="margin-bottom:16px;">
      <div class="stat-card">
        <div class="stat-value">${vehicle.shifts}</div>
        <div class="stat-label">Shifts completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${vehicle.hours_on_duty.toFixed(1)} h</div>
        <div class="stat-label">Hours on duty</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${vehicle.total_jobs}</div>
        <div class="stat-label">Total jobs</div>
      </div>
    </div>

    <p class="section-heading">Incidents (${incidents.total} total)</p>
    ${breakdownCard('By Category', incidents.by_category, CAT_LABELS)}
    ${breakdownCard('By Type',     incidents.by_type,     TYPE_LABELS)}
    ${breakdownCard('By Age',      incidents.by_age,      AGE_LABELS)}
    ${locationCard}
  `;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

async function loadStats() {
  const content = document.getElementById('stats-content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    const stats = await CFR.apiGet('/api/stats');
    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.total_duty_hours_ytd ?? '—'}</div>
          <div class="stat-label">Hours on duty (YTD)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.incidents_ytd ?? '—'}</div>
          <div class="stat-label">Incidents (YTD)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.incidents_this_month ?? '—'}</div>
          <div class="stat-label">Incidents this month</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.active_responders ?? '—'}</div>
          <div class="stat-label">Active responders</div>
        </div>
      </div>
      <div class="card">
        <p class="card-title">Total Mileage (YTD)</p>
        <div class="stat-value" style="font-size:24px;">${stats.total_miles_ytd ?? '—'} mi</div>
      </div>
      <div class="card">
        <p class="card-title">Last VDI</p>
        <p>${stats.last_vdi_date ? CFR.fmtDate(stats.last_vdi_date) : 'No VDI on record'}</p>
        ${stats.last_vdi_pass != null
          ? `<p class="text-sm text-muted">${stats.last_vdi_pass ? '✓ Passed' : '⚠ Issues flagged'}</p>`
          : ''}
      </div>`;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger"><span>⚠</span>${e.message}</div>`;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Set default date range to current month
const now   = new Date();
const y     = now.getFullYear();
const m     = String(now.getMonth() + 1).padStart(2, '0');
const first = `${y}-${m}-01`;
const last  = new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10);

document.getElementById('filter-from').value      = first;
document.getElementById('filter-to').value        = last;
document.getElementById('export-from').value      = first;
document.getElementById('export-to').value        = last;
document.getElementById('duty-export-from').value = first;
document.getElementById('duty-export-to').value   = last;

loadSubmissions();
