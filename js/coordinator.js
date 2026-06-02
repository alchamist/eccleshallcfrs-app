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
  if (tab === 'users')     { loadUsers(); updateDeviceModeStatus(); }
  if (tab === 'rota')      { if (!_users.length) loadUsers(); loadRotaBlocks(); }
  if (tab === 'stats')       loadStats();
  if (tab === 'vehicle')     { loadVehicleSettings(); loadUnavailability(); }
  if (tab === 'audit')       loadAuditLog();
  if (tab === 'training')    loadTeamTraining();
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
    const { access_key, pin } = await CFR.apiPost('/api/users', { name, prf_number, roles });
    document.getElementById('new-pin-value').textContent = pin;
    document.getElementById('new-key-value').textContent = access_key;
    document.getElementById('new-key-display').classList.remove('hidden');
    document.getElementById('new-name').value = '';
    document.getElementById('new-prf').value  = '';
    document.getElementById('role-responder').checked   = true;
    document.getElementById('role-coordinator').checked = false;
    document.getElementById('role-compliance').checked  = false;
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
  document.getElementById('reset-pin-display').classList.add('hidden');
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

async function resetPin() {
  const access_key = document.getElementById('edit-access-key').value;
  const name       = document.getElementById('edit-name').value || 'this user';
  if (!confirm(`Reset the PIN for ${name}? A new 4-digit PIN will be generated.`)) return;
  try {
    const { pin } = await CFR.apiPatch('/api/users', { access_key, reset_pin: true });
    document.getElementById('reset-pin-value').textContent = pin;
    document.getElementById('reset-pin-display').classList.remove('hidden');
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

function registerCarDevice() {
  localStorage.setItem('cfr_device_mode', 'car');
  updateDeviceModeStatus();
  CFR.toast('This device will always open to the car PIN screen.', 'success');
}

function clearDeviceMode() {
  localStorage.removeItem('cfr_device_mode');
  updateDeviceModeStatus();
  CFR.toast('Device registration cleared.', 'success');
}

function updateDeviceModeStatus() {
  const el   = document.getElementById('device-mode-status');
  const mode = localStorage.getItem('cfr_device_mode');
  el.textContent = mode === 'car'
    ? 'This device is registered as the car tablet.'
    : 'This device has no registration (standard behaviour).';
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

/* ── Vehicle settings ───────────────────────────────────────────────────── */

const MAINT_LABELS = { mot: 'MOT', service: 'Service', insurance: 'Insurance', deep_clean: 'Deep Clean' };

/* ── Vehicle unavailability ─────────────────────────────────────────────── */

const UNAVAIL_LABELS = { mot: 'MOT', service: 'Service', deep_clean: 'Deep Clean', other: 'Other' };

function updateUnavailEndMin() {
  const d = document.getElementById('unavail-start-date').value;
  document.getElementById('unavail-end-date').min = d;
  if (document.getElementById('unavail-end-date').value < d)
    document.getElementById('unavail-end-date').value = d;
}

async function addUnavailability() {
  const startDate = document.getElementById('unavail-start-date').value;
  const startTime = document.getElementById('unavail-start-time').value;
  const endDate   = document.getElementById('unavail-end-date').value;
  const endTime   = document.getElementById('unavail-end-time').value;
  const reason    = document.getElementById('unavail-reason').value;
  const notes     = document.getElementById('unavail-notes').value.trim();

  if (!startDate || !endDate) { CFR.toast('Please set start and end date.', 'warning'); return; }

  const startDT = `${startDate}T${startTime || '00:00'}`;
  const endDT   = `${endDate}T${endTime || '23:59'}`;
  if (endDT <= startDT) { CFR.toast('End must be after start.', 'warning'); return; }

  try {
    const { cancelled } = await CFR.apiPost('/api/vehicle/unavailability', {
      start_datetime: startDT, end_datetime: endDT, reason, notes,
    });

    document.getElementById('unavail-start-date').value = '';
    document.getElementById('unavail-end-date').value   = '';
    document.getElementById('unavail-notes').value      = '';

    if (cancelled.length) {
      const names = cancelled.map(c => `${c.responder_name} (${CFR.fmtDate(c.date)} ${c.start_time})`).join(', ');
      CFR.toast(`Booked. ${cancelled.length} shift${cancelled.length > 1 ? 's' : ''} cancelled: ${names}`, 'warning');
    } else {
      CFR.toast('Unavailability booked.', 'success');
    }
    loadUnavailability();
  } catch (e) { CFR.toast(e.message, 'error'); }
}

async function loadUnavailability() {
  const list = document.getElementById('unavail-list');
  if (!list) return;
  try {
    const today = CFR.todayISO();
    const { periods } = await CFR.apiGet(`/api/vehicle/unavailability?from=${today}`);
    if (!periods.length) {
      list.innerHTML = '<div class="card"><p class="text-muted text-sm text-center" style="padding:8px;">No upcoming unavailability.</p></div>';
      return;
    }
    list.innerHTML = periods.map(p => `
      <div class="card" style="margin-bottom:10px; display:flex; align-items:center; gap:12px;">
        <div style="flex:1;">
          <div style="font-weight:600; font-size:14px;">${UNAVAIL_LABELS[p.reason] || p.reason}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
            ${CFR.fmtDateTime(p.start_datetime)} – ${CFR.fmtDateTime(p.end_datetime)}
          </div>
          ${p.notes ? `<div style="font-size:12px; color:var(--text-muted);">${p.notes}</div>` : ''}
        </div>
        <button class="btn btn-sm btn-ghost" onclick="deleteUnavailability('${p.id}')">Remove</button>
      </div>`).join('');
  } catch (e) { list.innerHTML = `<div class="alert alert-danger"><span>⚠</span>${e.message}</div>`; }
}

async function deleteUnavailability(id) {
  if (!confirm('Remove this unavailability period? Any cancelled shifts will NOT be automatically restored.')) return;
  try {
    await CFR.apiDelete(`/api/vehicle/unavailability?id=${id}`);
    CFR.toast('Removed.', 'success');
    loadUnavailability();
  } catch (e) { CFR.toast(e.message, 'error'); }
}

async function loadVehicleSettings() {
  try {
    const { config } = await CFR.apiGet('/api/config/vehicle');
    document.getElementById('cfg-callsign').value = config.callsign || '';
    document.getElementById('cfg-tread').value    = config.tread_warn_mm || 3;
    const m = config.maintenance || {};
    document.getElementById('maint-mot-due').value       = m.mot?.next_due      || '';
    document.getElementById('maint-mot-warn').value      = m.mot?.warn_days     || 30;
    document.getElementById('maint-service-due').value   = m.service?.next_due  || '';
    document.getElementById('maint-service-warn').value  = m.service?.warn_days || 14;
    document.getElementById('maint-insurance-due').value  = m.insurance?.next_due  || '';
    document.getElementById('maint-insurance-warn').value = m.insurance?.warn_days || 30;
    document.getElementById('maint-clean-interval').value = m.deep_clean?.interval_days || 60;
    document.getElementById('maint-clean-warn').value     = m.deep_clean?.warn_days     || 7;
  } catch (e) { CFR.toast(e.message, 'error'); }
  document.getElementById('maint-log-date').value = CFR.todayISO();
  loadMaintenanceHistory();
}

async function saveVehicleSettings() {
  const callsign  = document.getElementById('cfg-callsign').value.trim();
  const tread     = parseFloat(document.getElementById('cfg-tread').value);
  if (!callsign) { CFR.toast('Call sign is required.', 'warning'); return; }
  if (isNaN(tread) || tread < 1.6) { CFR.toast('Tread threshold must be at least 1.6mm.', 'warning'); return; }
  try {
    const { config } = await CFR.apiPatch('/api/config/vehicle', { callsign, tread_warn_mm: tread });
    localStorage.setItem('cfr_vehicle_config', JSON.stringify(config));
    CFR.toast('Settings saved.', 'success');
    document.querySelectorAll('.callsign').forEach(el => { el.textContent = callsign; });
  } catch (e) { CFR.toast(e.message, 'error'); }
}

async function saveMaintenanceSettings() {
  const maintenance = {
    mot:       { next_due: document.getElementById('maint-mot-due').value      || null, warn_days: parseInt(document.getElementById('maint-mot-warn').value) || 30 },
    service:   { next_due: document.getElementById('maint-service-due').value  || null, warn_days: parseInt(document.getElementById('maint-service-warn').value) || 14 },
    insurance: { next_due: document.getElementById('maint-insurance-due').value || null, warn_days: parseInt(document.getElementById('maint-insurance-warn').value) || 30 },
    deep_clean: { interval_days: parseInt(document.getElementById('maint-clean-interval').value) || 60, warn_days: parseInt(document.getElementById('maint-clean-warn').value) || 7 },
  };
  try {
    await CFR.apiPatch('/api/config/vehicle', { maintenance });
    CFR.toast('Maintenance schedule saved.', 'success');
  } catch (e) { CFR.toast(e.message, 'error'); }
}

async function recordMaintenanceDone() {
  const type    = document.getElementById('maint-log-type').value;
  const done_at = document.getElementById('maint-log-date').value;
  const notes   = document.getElementById('maint-log-notes').value.trim();
  if (!done_at) { CFR.toast('Please set a date.', 'warning'); return; }
  try {
    await CFR.apiPost('/api/maintenance/log', { type, done_at, notes });
    CFR.toast(`${MAINT_LABELS[type]} recorded.`, 'success');
    document.getElementById('maint-log-notes').value = '';
    loadMaintenanceHistory();
  } catch (e) { CFR.toast(e.message, 'error'); }
}

async function loadMaintenanceHistory() {
  const list = document.getElementById('maint-history-list');
  try {
    const { entries } = await CFR.apiGet('/api/maintenance/log');
    if (!entries.length) {
      list.innerHTML = '<p class="text-center text-muted text-sm" style="padding:16px;">No maintenance recorded yet.</p>';
      return;
    }
    list.innerHTML = entries.map(e => `
      <div style="display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--border);">
        <div style="flex:1;">
          <div style="font-weight:500; font-size:14px;">${MAINT_LABELS[e.type] || e.type}</div>
          ${e.notes ? `<div style="font-size:12px; color:var(--text-muted);">${e.notes}</div>` : ''}
        </div>
        <div style="font-size:12px; color:var(--text-muted); flex-shrink:0;">${CFR.fmtDate(e.done_at)}</div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="alert alert-danger" style="margin:12px;"><span>⚠</span>${e.message}</div>`;
  }
}

const METHOD_LABEL = { pin: 'PRF + PIN', device: 'Car tablet', setup: 'PIN setup', key: 'Access key' };

async function loadAuditLog() {
  const list = document.getElementById('audit-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
  try {
    const { entries } = await CFR.apiGet('/api/audit/logins');
    if (!entries.length) {
      list.innerHTML = '<p class="text-center text-muted text-sm" style="padding:20px;">No logins recorded yet.</p>';
      return;
    }
    list.innerHTML = entries.map(e => `
      <div style="display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--border);">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:500; font-size:14px;">${e.name || '—'}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:1px;">
            PRF ${e.prf_number || '—'} &middot; ${METHOD_LABEL[e.method] || e.method}
          </div>
        </div>
        <div style="font-size:12px; color:var(--text-muted); text-align:right; flex-shrink:0;">
          ${CFR.fmtDateTime(e.logged_at)}
        </div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="alert alert-danger" style="margin:12px;"><span>⚠</span>${e.message}</div>`;
  }
}

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

// ── Rota ──────────────────────────────────────────────────────────────────────

const ROTA_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let _rotaBlocks       = [];
let _openBlockId      = null;
let _blockAvailability   = [];
let _blockShifts         = [];
let _blockUnavailability = [];

function rotaDayDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return `${ROTA_DOW[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
}

function daysInRange(start, end) {
  const days = [];
  const cur  = new Date(start + 'T00:00:00');
  const last = new Date(end   + 'T00:00:00');
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

async function loadRotaBlocks() {
  const list = document.getElementById('rota-blocks-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
  try {
    const { blocks } = await CFR.apiGet('/api/rota/blocks');
    _rotaBlocks = blocks || [];
    renderRotaBlockList();
  } catch (e) {
    list.innerHTML = `<div class="alert alert-danger"><span>⚠</span>${e.message}</div>`;
  }
}

function renderRotaBlockList() {
  const list = document.getElementById('rota-blocks-list');
  if (!_rotaBlocks.length) {
    list.innerHTML = '<div class="empty-state"><p>No planning blocks yet. Create one above.</p></div>';
    return;
  }

  const statusBadge = {
    draft:     '<span class="badge badge-grey">Draft</span>',
    open:      '<span class="badge badge-blue">Open</span>',
    published: '<span class="badge badge-green">Published</span>',
    closed:    '<span class="badge badge-grey">Closed</span>',
  };

  list.innerHTML = _rotaBlocks.map(b => `
    <div class="card" style="margin-bottom:10px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <div style="flex:1; font-weight:600; font-size:15px;">
          ${CFR.fmtDate(b.start_date)} – ${CFR.fmtDate(b.end_date)}
        </div>
        ${statusBadge[b.status] || b.status}
      </div>
      ${b.notes ? `<p style="font-size:13px; color:var(--text-muted); margin-bottom:8px;">${b.notes}</p>` : ''}
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn btn-sm btn-ghost" onclick="openRotaBlock('${b.id}')">View / Allocate</button>
        ${b.status === 'draft'
          ? `<button class="btn btn-sm btn-secondary" onclick="setBlockStatus('${b.id}','open')">Open for Availability</button>`
          : ''}
        ${b.status === 'open'
          ? `<button class="btn btn-sm btn-primary" onclick="setBlockStatus('${b.id}','published')">Publish Rota</button>`
          : ''}
        ${b.status === 'published'
          ? `<button class="btn btn-sm btn-ghost" onclick="setBlockStatus('${b.id}','closed')">Close</button>`
          : ''}
        ${['draft', 'open'].includes(b.status)
          ? `<button class="btn btn-sm btn-ghost" onclick="openBlockEditModal('${b.id}')">Edit</button>
             <button class="btn btn-sm btn-danger" onclick="deleteRotaBlock('${b.id}')">Delete</button>`
          : ''}
      </div>
    </div>`).join('');
}

async function createRotaBlock() {
  const start = document.getElementById('rota-start').value;
  const end   = document.getElementById('rota-end').value;
  const notes = document.getElementById('rota-notes').value.trim();

  if (!start || !end) { CFR.toast('Please set start and end dates.', 'warning'); return; }
  if (end < start)    { CFR.toast('End date must be after start date.', 'warning'); return; }

  try {
    await CFR.apiPost('/api/rota/blocks', { start_date: start, end_date: end, notes });
    document.getElementById('rota-start').value = '';
    document.getElementById('rota-end').value   = '';
    document.getElementById('rota-notes').value = '';
    CFR.toast('Block created.', 'success');
    loadRotaBlocks();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function setBlockStatus(blockId, status) {
  const labels = { open: 'open for availability', published: 'published', closed: 'closed' };
  if (!confirm(`Mark this block as ${labels[status] || status}?`)) return;
  try {
    await CFR.apiPatch('/api/rota/blocks', { id: blockId, status });
    CFR.toast('Block updated.', 'success');
    loadRotaBlocks();
    if (_openBlockId === blockId) openRotaBlock(blockId);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

function openBlockEditModal(blockId) {
  const block = _rotaBlocks.find(b => b.id === blockId);
  if (!block) return;
  document.getElementById('block-edit-id').value    = blockId;
  document.getElementById('block-edit-start').value = block.start_date;
  document.getElementById('block-edit-end').value   = block.end_date;
  document.getElementById('block-edit-notes').value = block.notes || '';
  document.getElementById('block-edit-modal').classList.remove('hidden');
}

function closeBlockEditModal(e) {
  if (e && e.target !== document.getElementById('block-edit-modal')) return;
  document.getElementById('block-edit-modal').classList.add('hidden');
}

async function saveBlockEdit() {
  const id    = document.getElementById('block-edit-id').value;
  const start = document.getElementById('block-edit-start').value;
  const end   = document.getElementById('block-edit-end').value;
  const notes = document.getElementById('block-edit-notes').value.trim();

  if (!start || !end) { CFR.toast('Please set start and end dates.', 'warning'); return; }
  if (end < start)    { CFR.toast('End date must be after start date.', 'warning'); return; }

  try {
    await CFR.apiPatch('/api/rota/blocks', { id, start_date: start, end_date: end, notes });
    document.getElementById('block-edit-modal').classList.add('hidden');
    CFR.toast('Block updated.', 'success');
    loadRotaBlocks();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function deleteRotaBlock(blockId) {
  const block = _rotaBlocks.find(b => b.id === blockId);
  const msg = block?.status === 'open'
    ? 'Delete this block? Any availability already submitted by responders will also be removed. This cannot be undone.'
    : 'Delete this planning block? This cannot be undone.';
  if (!confirm(msg)) return;
  try {
    await CFR.apiDelete(`/api/rota/blocks?id=${blockId}`);
    CFR.toast('Block deleted.', 'success');
    loadRotaBlocks();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function openRotaBlock(blockId) {
  _openBlockId = blockId;
  document.getElementById('rota-blocks-view').classList.add('hidden');
  document.getElementById('rota-block-detail').classList.remove('hidden');

  const block = _rotaBlocks.find(b => b.id === blockId);
  document.getElementById('rota-block-title').textContent = block
    ? `${CFR.fmtDate(block.start_date)} – ${CFR.fmtDate(block.end_date)}`
    : '';
  document.getElementById('rota-block-days').innerHTML =
    '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    const [{ entries }, { shifts }, { periods }] = await Promise.all([
      CFR.apiGet(`/api/rota/availability?block_id=${blockId}`),
      CFR.apiGet(`/api/rota/shifts?block_id=${blockId}`),
      CFR.apiGet(`/api/vehicle/unavailability?from=${block?.start_date || ''}&to=${block?.end_date || ''}`),
    ]);
    _blockAvailability  = entries || [];
    _blockShifts        = shifts  || [];
    _blockUnavailability = periods || [];
    renderBlockDetail(block);
  } catch (e) {
    document.getElementById('rota-block-days').innerHTML =
      `<div class="alert alert-danger"><span>⚠</span>${e.message}</div>`;
  }
}

function backToBlocks() {
  _openBlockId = null;
  document.getElementById('rota-block-detail').classList.add('hidden');
  document.getElementById('rota-blocks-view').classList.remove('hidden');
}

function renderBlockDetail(block) {
  const statusBadge = {
    draft: 'badge-grey', open: 'badge-blue', published: 'badge-green', closed: 'badge-grey',
  };
  const statusLabel = {
    draft: 'Draft', open: 'Open', published: 'Published', closed: 'Closed',
  };

  document.getElementById('rota-block-status-bar').innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <span class="badge ${statusBadge[block.status]}">${statusLabel[block.status] || block.status}</span>
      ${block.status === 'draft'
        ? `<button class="btn btn-sm btn-secondary" onclick="setBlockStatus('${block.id}','open')">Open for Availability</button>`
        : ''}
      ${block.status === 'open'
        ? `<button class="btn btn-sm btn-primary" onclick="setBlockStatus('${block.id}','published')">Publish Rota</button>`
        : ''}
      ${block.status === 'published'
        ? `<button class="btn btn-sm btn-ghost" onclick="setBlockStatus('${block.id}','closed')">Close</button>`
        : ''}
      <button class="btn btn-sm btn-secondary" onclick="openAllocModal('${block.id}')">+ Add Shift</button>
    </div>`;

  const availByDay  = {};
  const shiftsByDay = {};
  _blockAvailability.forEach(a => {
    (availByDay[a.date] = availByDay[a.date] || []).push(a);
  });
  _blockShifts.forEach(s => {
    (shiftsByDay[s.date] = shiftsByDay[s.date] || []).push(s);
  });

  const typeIcons = { car: '🚗', fundraising: '💰', training: '📚', other: '📅' };
  const shiftStatusStyle = {
    allocated: 'color:var(--blue)',
    confirmed: 'color:var(--green)',
    declined:  'color:var(--red)',
    cancelled: 'color:var(--text-muted)',
  };

  const days = daysInRange(block.start_date, block.end_date);
  document.getElementById('rota-block-days').innerHTML = days.map(date => {
    const avail  = availByDay[date]  || [];
    const shifts = shiftsByDay[date] || [];

    // Find unavailability periods that cover any part of this day
    const dayStart = new Date(`${date}T00:00`);
    const dayEnd   = new Date(`${date}T23:59`);
    const unavailToday = _blockUnavailability.filter(p => {
      const uStart = new Date(p.start_datetime);
      const uEnd   = new Date(p.end_datetime);
      return uStart < dayEnd && uEnd > dayStart;
    });

    const unavailHtml = unavailToday.map(p => {
      const fmt = dt => dt.slice(11, 16);
      const startFmt = p.start_datetime.slice(0, 10) === date ? fmt(p.start_datetime) : '00:00';
      const endFmt   = p.end_datetime.slice(0, 10)   === date ? fmt(p.end_datetime)   : '23:59';
      return `<div style="background:var(--red-light); border:1px solid #fca5a5; border-radius:6px;
                          padding:6px 10px; margin-top:8px; font-size:12px; color:#7f1d1d;">
        🚫 Vehicle unavailable ${startFmt}–${endFmt} — ${UNAVAIL_LABELS[p.reason] || p.reason}
        ${p.notes ? ` (${p.notes})` : ''}
      </div>`;
    }).join('');

    // Helper: does a time window overlap any unavailability on this date?
    function timeBlocked(start, end) {
      return unavailToday.some(p => {
        const sdt = new Date(`${date}T${start}`);
        const edt = new Date(`${date}T${end}`);
        return sdt < new Date(p.end_datetime) && edt > new Date(p.start_datetime);
      });
    }

    const availHtml = avail.length ? `
      <div style="margin-top:8px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:.05em;
                    color:var(--text-muted); margin-bottom:4px;">Available</div>
        ${avail.map(a => {
          const blocked = timeBlocked(a.start_time, a.end_time);
          const alreadyAllocated = shifts.some(s =>
            s.responder_id === a.responder_id &&
            s.start_time === a.start_time &&
            s.end_time === a.end_time
          );
          return `
          <div style="display:flex; align-items:center; gap:8px; padding:4px 0;
                      border-bottom:1px solid var(--border);">
            <div style="flex:1; font-size:13px; ${blocked || alreadyAllocated ? 'opacity:.5;' : ''}">${a.responder_name} · ${a.start_time}–${a.end_time}
              ${a.notes ? `<span style="color:var(--text-muted); font-size:12px;"> — ${a.notes}</span>` : ''}
              ${blocked ? `<span style="color:var(--red); font-size:11px;"> — vehicle unavailable</span>` : ''}
              ${alreadyAllocated ? `<span style="color:var(--green); font-size:11px;"> ✓ allocated</span>` : ''}
            </div>
            <button class="btn btn-sm btn-ghost" style="padding:2px 8px; flex-shrink:0;"
                    ${blocked || alreadyAllocated ? 'disabled title="' + (alreadyAllocated ? 'Already allocated' : 'Vehicle unavailable during this time') + '"' : ''}
                    onclick="openAllocModal('${block.id}','${a.responder_id}','${date}','${a.start_time}','${a.end_time}')">
              ${alreadyAllocated ? '✓ Allocated' : 'Allocate'}
            </button>
          </div>`;
        }).join('')}
      </div>` : '';

    const shiftsHtml = shifts.length ? `
      <div style="margin-top:8px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:.05em;
                    color:var(--text-muted); margin-bottom:4px;">Allocated Shifts</div>
        ${shifts.map(s => `
          <div style="display:flex; align-items:center; gap:8px; padding:4px 0;
                      border-bottom:1px solid var(--border);">
            <div style="flex:1; font-size:13px;">
              ${typeIcons[s.type] || '📅'} ${s.responder_name} · ${s.start_time}–${s.end_time}
              <span style="font-size:11px; ${shiftStatusStyle[s.status] || ''};">
                (${s.status})
              </span>
            </div>
            <button class="btn btn-sm btn-ghost" style="padding:2px 8px; flex-shrink:0;"
                    onclick="editAllocShift('${block.id}','${s.id}')">Edit</button>
          </div>`).join('')}
      </div>` : '';

    const hasData = avail.length || shifts.length || unavailToday.length;
    return `
      <div class="card" style="margin-bottom:8px; padding:12px; ${unavailToday.length ? 'border-color:#fca5a5;' : ''}">
        <div style="font-weight:600; font-size:14px; display:flex; align-items:center;
                    justify-content:space-between;">
          ${rotaDayDate(date)}
          <span style="font-size:12px; color:var(--text-muted);">
            ${hasData
              ? `${avail.length} avail · ${shifts.length} shift${shifts.length !== 1 ? 's' : ''}${unavailToday.length ? ' · 🚫 unavailable' : ''}`
              : 'No entries'}
          </span>
        </div>
        ${unavailHtml}
        ${availHtml}
        ${shiftsHtml}
      </div>`;
  }).join('');
}

// ── Allocate shift modal ──────────────────────────────────────────────────────

function openAllocModal(blockId, responderId, date, startTime, endTime) {
  document.getElementById('alloc-block-id').value = blockId;
  document.getElementById('alloc-shift-id').value = '';
  document.getElementById('alloc-date').value     = date      || '';
  document.getElementById('alloc-start').value    = startTime || '';
  document.getElementById('alloc-end').value      = endTime   || '';
  document.getElementById('alloc-notes').value    = '';
  document.getElementById('alloc-type').value     = 'car';
  document.getElementById('alloc-modal-title').textContent = 'Allocate Shift';
  document.getElementById('alloc-delete-row').classList.add('hidden');

  const block = _rotaBlocks.find(b => b.id === blockId);
  if (block) {
    document.getElementById('alloc-date').min = block.start_date;
    document.getElementById('alloc-date').max = block.end_date;
  }

  const sel = document.getElementById('alloc-responder');
  sel.innerHTML = _users
    .filter(u => u.active)
    .map(u => `<option value="${u.id}" data-name="${u.name}">${u.name}</option>`)
    .join('');
  if (responderId) sel.value = responderId;

  document.getElementById('alloc-modal').classList.remove('hidden');
}

function editAllocShift(blockId, shiftId) {
  const shift = _blockShifts.find(s => s.id === shiftId);
  if (!shift) return;

  openAllocModal(blockId, shift.responder_id, shift.date, shift.start_time, shift.end_time);
  document.getElementById('alloc-shift-id').value       = shiftId;
  document.getElementById('alloc-type').value           = shift.type  || 'car';
  document.getElementById('alloc-notes').value          = shift.notes || '';
  document.getElementById('alloc-modal-title').textContent = 'Edit Shift';
  document.getElementById('alloc-delete-row').classList.remove('hidden');
}

function closeAllocModal(e) {
  if (e && e.target !== document.getElementById('alloc-modal')) return;
  document.getElementById('alloc-modal').classList.add('hidden');
  document.getElementById('alloc-block-id').value = '';
  document.getElementById('alloc-shift-id').value = '';
  document.getElementById('alloc-date').value = '';
  document.getElementById('alloc-start').value = '';
  document.getElementById('alloc-end').value = '';
  document.getElementById('alloc-notes').value = '';
  document.getElementById('alloc-type').value = 'car';
}

async function saveAllocShift() {
  const blockId  = document.getElementById('alloc-block-id').value;
  const shiftId  = document.getElementById('alloc-shift-id').value;
  const date     = document.getElementById('alloc-date').value;
  const start    = document.getElementById('alloc-start').value;
  const end      = document.getElementById('alloc-end').value;
  const type     = document.getElementById('alloc-type').value;
  const notes    = document.getElementById('alloc-notes').value.trim();
  const sel      = document.getElementById('alloc-responder');
  const respId   = sel.value;
  const respName = sel.options[sel.selectedIndex]?.dataset.name || '';

  if (!date || !start || !end || !respId) {
    CFR.toast('Please fill in all required fields.', 'warning');
    return;
  }

  try {
    if (shiftId) {
      await CFR.apiPatch('/api/rota/shifts', {
        id: shiftId, block_id: blockId,
        date, start_time: start, end_time: end,
        responder_id: respId, responder_name: respName, type, notes,
      });
    } else {
      await CFR.apiPost('/api/rota/shifts', {
        block_id: blockId,
        date, start_time: start, end_time: end,
        responder_id: respId, responder_name: respName, type, notes,
      });
    }
    document.getElementById('alloc-modal').classList.add('hidden');
    CFR.toast('Shift saved.', 'success');
    openRotaBlock(blockId);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function deleteAllocShift() {
  const blockId = document.getElementById('alloc-block-id').value;
  const shiftId = document.getElementById('alloc-shift-id').value;
  if (!confirm('Delete this shift?')) return;
  try {
    await CFR.apiDelete(`/api/rota/shifts?id=${shiftId}&block_id=${blockId}`);
    document.getElementById('alloc-modal').classList.add('hidden');
    CFR.toast('Shift deleted.', 'success');
    openRotaBlock(blockId);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Set default date range to current month
// ── Training ──────────────────────────────────────────────────────────────────

async function loadTeamTraining() {
  const list = document.getElementById('training-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  const from = document.getElementById('training-from').value;
  const to   = document.getElementById('training-to').value;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  try {
    const { entries } = await CFR.apiGet(`/api/training?${params}`);

    if (!entries || entries.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <h3>No training recorded</h3>
          <p>No training logged for the selected period.</p>
        </div>`;
      return;
    }

    // Group by responder
    const byUser = {};
    entries.forEach(e => {
      if (!byUser[e.user_id]) byUser[e.user_id] = { name: e.user_name, entries: [] };
      byUser[e.user_id].entries.push(e);
    });

    const typeLabel = { mandatory: 'Mandatory', optional: 'Optional', refresher: 'Refresher' };
    const typeColor = { mandatory: 'red', optional: 'blue', refresher: 'amber' };

    list.innerHTML = Object.entries(byUser)
      .sort(([,a], [,b]) => a.name.localeCompare(b.name))
      .map(([userId, userData]) => {
        const total = userData.entries.reduce((sum, e) => sum + e.hours, 0);
        return `
          <div class="card" style="margin-bottom:12px;">
            <div style="font-weight:600; margin-bottom:8px;">
              ${userData.name}
              <span style="float:right; font-size:12px; color:var(--text-muted);">
                <strong>${total}h</strong> total
              </span>
            </div>
            ${userData.entries.map(e => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid var(--border); font-size:13px;">
                <div>
                  ${CFR.fmtDate(e.date)} · ${e.hours}h
                  ${e.description ? ` — ${e.description}` : ''}
                </div>
                <span class="badge badge-${typeColor[e.type] || 'grey'}" style="flex-shrink:0;">
                  ${typeLabel[e.type] || e.type}
                </span>
              </div>`).join('')}
          </div>`;
      }).join('');
  } catch (e) {
    list.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span>${e.message}</div>`;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

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
document.getElementById('training-from').value    = first;
document.getElementById('training-to').value      = last;

loadSubmissions();
