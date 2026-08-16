CFR.requireAuth();

// Require coordinator OR fire_safety_officer role
if (!CFR.hasRole('coordinator') && !CFR.hasRole('fire_safety_officer')) {
  window.location.href = '/dashboard.html';
}

let activeTab = 'submissions';
let _users    = [];

// Hide tabs based on feature flags and role restrictions
window.addEventListener('load', () => {
  if (!CFR.hasFeature('fire_safety')) {
    document.querySelector('[data-tab="fire-safety"]')?.classList.add('hidden');
    document.getElementById('role-fire-safety')?.closest('label')?.classList.add('hidden');
    document.getElementById('edit-role-fire-safety')?.closest('label')?.classList.add('hidden');
  }
  if (!CFR.hasFeature('training')) {
    document.querySelector('[data-tab="training"]')?.classList.add('hidden');
  }
  if (CFR.hasFeature('defib_tracker')) {
    document.querySelector('[data-tab="equipment"]')?.classList.remove('hidden');
    document.getElementById('role-defib-label')?.classList.remove('hidden');
    document.getElementById('edit-role-defib-label')?.classList.remove('hidden');
  }
  if (CFR.hasFeature('uniform_tracker')) {
    document.querySelector('[data-tab="uniform"]')?.classList.remove('hidden');
    document.getElementById('role-uniform-label')?.classList.remove('hidden');
    document.getElementById('edit-role-uniform-label')?.classList.remove('hidden');
  }

  // If user is Fire Safety Officer only (not coordinator), restrict to fire-safety tab
  if (!CFR.hasRole('coordinator') && CFR.hasRole('fire_safety_officer')) {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      if (btn.dataset.tab !== 'fire-safety') btn.classList.add('hidden');
    });
    switchTab('fire-safety');
  }
});

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
  if (tab === 'report')    { initReportPickers(); loadRestockStatus(); }
  if (tab === 'users')     { loadUsers(); updateDeviceModeStatus(); }
  if (tab === 'rota')      { if (!_users.length) loadUsers(); loadRotaBlocks(); loadAvailabilityView(); }
  if (tab === 'fire-safety') { if (!_users.length) loadUsers(); loadFireSafetyReports(); }
  if (tab === 'stats')       loadStats();
  if (tab === 'vehicle')     { loadVehicleSettings(); loadUnavailability(); }
  if (tab === 'audit')       loadAuditLog();
  if (tab === 'training')    loadTeamTraining();
  if (tab === 'equipment')     loadEquipmentTab();
  if (tab === 'uniform')       loadUniformTabSummary();
  if (tab === 'announcements') loadAnnouncementsTab();
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

    list.innerHTML = users.map(u => {
      const isSupport = (u.roles || []).includes('support');
      const roleLabel = isSupport
        ? '<span class="badge" style="background:#7c3aed;color:#fff;">Support</span>'
        : `<span class="badge ${u.active ? 'badge-green' : 'badge-grey'}">${u.active ? 'Active' : 'Disabled'}</span>`;
      const roleText  = (u.roles || []).filter(r => r !== 'support').join(', ') || '—';
      const actions   = isSupport
        ? '<span style="font-size:12px;color:var(--text-muted);align-self:center;">Managed externally</span>'
        : `<button class="btn btn-sm btn-ghost" onclick="openEditModal('${u.access_key}')">Edit</button>
           ${u.active
             ? `<button class="btn btn-sm btn-ghost" style="color:var(--red);" onclick="toggleUser('${u.access_key}', false)">Disable</button>`
             : `<button class="btn btn-sm btn-success" onclick="toggleUser('${u.access_key}', true)">Enable</button>`}`;
      return `
        <div class="card" style="margin-bottom:10px; padding:14px;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:15px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                ${u.name} ${roleLabel}
              </div>
              <div style="font-size:13px; color:var(--text-muted); margin-top:3px;">
                ${isSupport ? 'External support access' : roleText}${u.prf_number ? ` · PRF ${u.prf_number}` : ''}
              </div>
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0; align-items:center;">${actions}</div>
          </div>
        </div>`;
    }).join('');
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

  if (document.getElementById('role-responder').checked)      roles.push('responder');
  if (document.getElementById('role-coordinator').checked)    roles.push('coordinator');
  if (document.getElementById('role-compliance').checked)     roles.push('compliance');
  if (document.getElementById('role-fire-safety').checked)    roles.push('fire_safety_officer');
  if (document.getElementById('role-defib-manager').checked)  roles.push('defib_manager');

  if (!name)         { CFR.toast('Please enter a name.', 'warning'); return; }
  if (!roles.length) { CFR.toast('Please select at least one role.', 'warning'); return; }

  try {
    const { access_key, pin } = await CFR.apiPost('/api/users', { name, prf_number, roles });
    document.getElementById('new-pin-value').textContent = pin;
    document.getElementById('new-key-value').textContent = access_key;
    document.getElementById('new-key-display').classList.remove('hidden');
    document.getElementById('new-name').value = '';
    document.getElementById('new-prf').value  = '';
    document.getElementById('role-responder').checked      = true;
    document.getElementById('role-coordinator').checked    = false;
    document.getElementById('role-compliance').checked     = false;
    document.getElementById('role-fire-safety').checked    = false;
    document.getElementById('role-defib-manager').checked  = false;
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
  document.getElementById('edit-role-responder').checked      = (user.roles || []).includes('responder');
  document.getElementById('edit-role-coordinator').checked    = (user.roles || []).includes('coordinator');
  document.getElementById('edit-role-compliance').checked     = (user.roles || []).includes('compliance');
  document.getElementById('edit-role-fire-safety').checked    = (user.roles || []).includes('fire_safety_officer');
  document.getElementById('edit-role-defib-manager').checked   = (user.roles || []).includes('defib_manager');
  document.getElementById('edit-role-uniform-officer').checked  = (user.roles || []).includes('uniform_officer');
  document.getElementById('edit-start-date').value        = user.start_date || '';
  document.getElementById('edit-phone').value             = user.phone || '';
  document.getElementById('edit-email').value             = user.email || '';
  document.getElementById('edit-ec-name').value           = user.emergency_contact?.name || '';
  document.getElementById('edit-ec-phone').value          = user.emergency_contact?.phone || '';
  document.getElementById('edit-ec-relationship').value   = user.emergency_contact?.relationship || '';
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

  if (document.getElementById('edit-role-responder').checked)      roles.push('responder');
  if (document.getElementById('edit-role-coordinator').checked)    roles.push('coordinator');
  if (document.getElementById('edit-role-compliance').checked)     roles.push('compliance');
  if (document.getElementById('edit-role-fire-safety').checked)    roles.push('fire_safety_officer');
  if (document.getElementById('edit-role-defib-manager').checked)   roles.push('defib_manager');
  if (document.getElementById('edit-role-uniform-officer').checked) roles.push('uniform_officer');

  if (!name)         { CFR.toast('Name is required.', 'warning'); return; }
  if (!roles.length) { CFR.toast('At least one role required.', 'warning'); return; }

  const start_date = document.getElementById('edit-start-date').value || null;
  const phone      = document.getElementById('edit-phone').value.trim() || null;
  const email      = document.getElementById('edit-email').value.trim() || null;
  const ecName     = document.getElementById('edit-ec-name').value.trim();
  const ecPhone    = document.getElementById('edit-ec-phone').value.trim();
  const ecRel      = document.getElementById('edit-ec-relationship').value.trim();
  const emergency_contact = (ecName || ecPhone || ecRel)
    ? { name: ecName || null, phone: ecPhone || null, relationship: ecRel || null }
    : null;

  try {
    await CFR.apiPatch('/api/users', { access_key, name, prf_number, roles, start_date, phone, email, emergency_contact });
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
    document.getElementById('cfg-vrm').value                = config.vrm || '';
    document.getElementById('cfg-coordinator-email').value  = config.coordinator_email || '';
    document.getElementById('cfg-tread').value              = config.tread_warn_mm || 3;
    const m = config.maintenance || {};
    document.getElementById('maint-mot-due').value        = m.mot?.next_due         || '';
    document.getElementById('maint-mot-warn').value       = m.mot?.warn_days        || 30;
    document.getElementById('maint-service-miles').value  = m.service?.interval_miles  || 10000;
    document.getElementById('maint-service-months').value = m.service?.interval_months || 12;
    document.getElementById('maint-service-warn').value   = m.service?.warn_days       || 14;
    document.getElementById('maint-insurance-due').value  = m.insurance?.next_due   || '';
    document.getElementById('maint-insurance-warn').value = m.insurance?.warn_days   || 30;
    document.getElementById('maint-clean-interval').value = m.deep_clean?.interval_days || 60;
    document.getElementById('maint-clean-warn').value     = m.deep_clean?.warn_days     || 7;
  } catch (e) { CFR.toast(e.message, 'error'); }
  document.getElementById('maint-log-date').value = CFR.todayISO();
  loadMaintenanceHistory();
  loadDVLAStatus();
}

async function saveVehicleSettings() {
  const vrm   = document.getElementById('cfg-vrm').value.trim().replace(/\s+/g, '').toUpperCase() || null;
  const email = document.getElementById('cfg-coordinator-email').value.trim() || null;
  const tread = parseFloat(document.getElementById('cfg-tread').value);
  if (isNaN(tread) || tread < 1.6) { CFR.toast('Tread threshold must be at least 1.6mm.', 'warning'); return; }
  try {
    const { config } = await CFR.apiPatch('/api/config/vehicle', { vrm, coordinator_email: email, tread_warn_mm: tread });
    localStorage.setItem('cfr_vehicle_config', JSON.stringify(config));
    CFR.toast('Settings saved.', 'success');
  } catch (e) { CFR.toast(e.message, 'error'); }
}

async function loadDVLAStatus() {
  const el = document.getElementById('dvla-status');
  if (!el) return;
  try {
    const { dvla } = await CFR.apiGet('/api/vehicle/dvla');
    if (!dvla) {
      el.innerHTML = '<p class="text-sm text-muted" style="padding:4px 0;">No data yet — add VRM above and save, then click Refresh.</p>';
      return;
    }
    const fmtD = iso => iso ? CFR.fmtDate(iso) : '—';
    const ago  = iso => {
      if (!iso) return '';
      const mins = Math.round((Date.now() - new Date(iso)) / 60000);
      if (mins < 60)  return `${mins}m ago`;
      if (mins < 1440) return `${Math.round(mins/60)}h ago`;
      return `${Math.round(mins/1440)}d ago`;
    };
    el.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:14px;">
        <div><span class="text-muted">MOT expiry:</span> <strong>${fmtD(dvla.mot_expiry)}</strong></div>
        <div><span class="text-muted">MOT status:</span> <strong>${dvla.mot_status || '—'}</strong></div>
        <div><span class="text-muted">Road tax due:</span> <strong>${fmtD(dvla.tax_due)}</strong></div>
        <div><span class="text-muted">Tax status:</span> <strong>${dvla.tax_status || '—'}</strong></div>
        ${dvla.make ? `<div><span class="text-muted">Vehicle:</span> <strong>${dvla.make}${dvla.colour ? ' · ' + dvla.colour : ''}</strong></div>` : ''}
        ${dvla.year ? `<div><span class="text-muted">Year:</span> <strong>${dvla.year}</strong></div>` : ''}
      </div>
      <p class="text-sm text-muted" style="margin-top:8px;">Last fetched from DVLA: ${ago(dvla.fetched_at)}</p>`;
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger" style="margin:0;"><span>⚠</span> ${e.message}</div>`;
  }
}

async function refreshDVLA() {
  const el = document.getElementById('dvla-status');
  if (el) el.innerHTML = '<div class="loading"><div class="spinner"></div>Fetching from DVLA…</div>';
  try {
    await CFR.apiPost('/api/vehicle/dvla', {});
    CFR.toast('DVLA data refreshed.', 'success');
    loadDVLAStatus();
  } catch (e) {
    CFR.toast(e.message, 'error');
    loadDVLAStatus();
  }
}

async function saveMaintenanceSettings() {
  const maintenance = {
    mot:       { next_due: document.getElementById('maint-mot-due').value      || null, warn_days: parseInt(document.getElementById('maint-mot-warn').value) || 30 },
    service:   { interval_miles: parseInt(document.getElementById('maint-service-miles').value) || 10000, interval_months: parseInt(document.getElementById('maint-service-months').value) || 12, warn_days: parseInt(document.getElementById('maint-service-warn').value) || 14 },
    insurance: { next_due: document.getElementById('maint-insurance-due').value || null, warn_days: parseInt(document.getElementById('maint-insurance-warn').value) || 30 },
    deep_clean: { interval_days: parseInt(document.getElementById('maint-clean-interval').value) || 60, warn_days: parseInt(document.getElementById('maint-clean-warn').value) || 7 },
  };
  try {
    await CFR.apiPatch('/api/config/vehicle', { maintenance });
    CFR.toast('Maintenance schedule saved.', 'success');
  } catch (e) { CFR.toast(e.message, 'error'); }
}

function toggleMileageField() {
  const isService = document.getElementById('maint-log-type').value === 'service';
  document.getElementById('maint-log-mileage-wrap').classList.toggle('hidden', !isService);
}

async function recordMaintenanceDone() {
  const type    = document.getElementById('maint-log-type').value;
  const done_at = document.getElementById('maint-log-date').value;
  const notes   = document.getElementById('maint-log-notes').value.trim();
  const mileageEl = document.getElementById('maint-log-mileage');
  const mileage = type === 'service' && mileageEl.value ? parseInt(mileageEl.value) : null;
  if (!done_at) { CFR.toast('Please set a date.', 'warning'); return; }
  if (type === 'service' && !mileage) { CFR.toast('Please enter the mileage at service.', 'warning'); return; }
  try {
    await CFR.apiPost('/api/maintenance/log', { type, done_at, notes, mileage });
    CFR.toast(`${MAINT_LABELS[type]} recorded.`, 'success');
    document.getElementById('maint-log-notes').value   = '';
    document.getElementById('maint-log-mileage').value = '';
    loadMaintenanceHistory();
  } catch (e) { CFR.toast(e.message, 'error'); }
}

async function sendMaintenanceAlertEmail(btn) {
  const status = document.getElementById('maint-alert-status');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  status.style.display = 'none';
  try {
    const { sent, alerts_count, message } = await CFR.apiPost('/api/maintenance/alert', {});
    if (sent) {
      status.textContent = `Email sent — ${alerts_count} item${alerts_count !== 1 ? 's' : ''} flagged.`;
      status.style.color = 'var(--green)';
    } else {
      status.textContent = message || 'No items currently due.';
      status.style.color = 'var(--text-muted)';
    }
  } catch (e) {
    status.textContent = `Failed: ${e.message}`;
    status.style.color = 'var(--red)';
  } finally {
    status.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Send Alert Email';
  }
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

// ── Fire Safety ───────────────────────────────────────────────────────────

async function loadFireSafetyReports() {
  const content = document.getElementById('fire-safety-content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  const from = document.getElementById('fs-from').value;
  const to   = document.getElementById('fs-to').value;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  try {
    const [alarm, lighting, extinguisher] = await Promise.all([
      CFR.apiGet(`/api/fire-safety/alarm-test?${params}`),
      CFR.apiGet(`/api/fire-safety/lighting-test?${params}`),
      CFR.apiGet(`/api/fire-safety/extinguisher-test?${params}`),
    ]);

    const getLastDate = (items) => {
      if (!items.length) return 'Never';
      return CFR.fmtDate(items[0].date);
    };

    const renderReportCard = (title, items, icon) => {
      const lastDate = getLastDate(items);
      const lastItem = items.length ? items[0] : null;
      const daysAgo = lastItem ? Math.floor((new Date() - new Date(lastItem.date + 'T00:00')) / (1000 * 60 * 60 * 24)) : null;

      return `
        <div class="card">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <span style="font-size:20px;">${icon}</span>
            <div style="flex:1;">
              <div style="font-weight:600;">${title}</div>
              <div style="font-size:12px; color:var(--text-muted);">Last: ${lastDate}${daysAgo !== null ? ` (${daysAgo} days ago)` : ''}</div>
            </div>
          </div>
          ${items.length ? `
            <div style="padding-top:8px; border-top:1px solid var(--border);">
              ${items.slice(0, 5).map(item => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:13px;">
                  <div>
                    <strong>${item.responder_name}</strong> · ${CFR.fmtDate(item.date)}
                    <span style="color:var(--text-muted);">${item.status}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="text-align:center; padding:12px; color:var(--text-muted); font-size:13px;">No records</div>
          `}
        </div>
      `;
    };

    content.innerHTML = `
      ${renderReportCard('🔔 Weekly Fire Alarm Test', alarm.items || [], '🔔')}
      ${renderReportCard('💡 Monthly Emergency Lighting Test', lighting.items || [], '💡')}
      ${renderReportCard('🧯 Annual Fire Extinguisher Test', extinguisher.items || [], '🧯')}
    `;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span>${e.message}</div>`;
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

// ── Equipment tab ─────────────────────────────────────────────────────────────

let _defibs = [];
let _bleedKits = [];
let _editingDefibUuid = null;
let _editingBkUuid = null;

async function loadEquipmentTab() {
  await Promise.all([loadEquipmentReport(), loadDefibs(), loadBleedKits()]);
}

async function loadEquipmentReport() {
  const el = document.getElementById('equipment-report');
  try {
    const { defibs, bleed_kits } = await CFR.apiGet('/api/defibs/report');
    const alerts = [];

    const defibAlerts = defibs.filter(d => d.open_faults?.length || d.overdue ||
      ['expired','critical','warn'].includes(d.pads_expiry_flag) ||
      ['expired','critical','warn'].includes(d.battery_expiry_flag));
    const bkAlerts = bleed_kits.filter(b => b.open_faults?.length || b.overdue ||
      ['expired','critical','warn'].includes(b.kit_expiry_flag));

    for (const d of defibAlerts) {
      const sev = d.open_faults?.length || d.pads_expiry_flag === 'expired' || d.battery_expiry_flag === 'expired' ? 'danger' : 'warning';
      const detail = d.open_faults?.length ? d.open_faults.join(', ') :
        d.overdue ? 'Overdue for check' :
        `Expiring: pads ${d.last_check?.pads_expiry || '?'}${d.last_check?.battery_expiry ? ', battery ' + d.last_check.battery_expiry : ''}`;
      alerts.push(`<div class="alert alert-${sev}" style="margin-bottom:6px;"><span class="alert-icon">⚠</span><div><strong>${d.group_id}</strong> — ${detail}</div></div>`);
    }
    for (const b of bkAlerts) {
      const sev = b.open_faults?.length || b.kit_expiry_flag === 'expired' ? 'danger' : 'warning';
      const detail = b.open_faults?.length ? b.open_faults.join(', ') :
        b.overdue ? 'Overdue for check' : `Expiring: kit ${b.last_check?.kit_expiry || '?'}`;
      alerts.push(`<div class="alert alert-${sev}" style="margin-bottom:6px;"><span class="alert-icon">⚠</span><div><strong>${b.group_id}</strong> (bleed kit) — ${detail}</div></div>`);
    }

    el.innerHTML = alerts.length
      ? alerts.join('')
      : '<p style="color:var(--text-muted); font-size:14px; margin:0;">All equipment OK — no faults or upcoming expiries.</p>';
  } catch (e) {
    el.innerHTML = `<p style="color:var(--text-muted); font-size:14px; margin:0;">Unable to load report.</p>`;
  }
}

async function loadDefibs() {
  const el = document.getElementById('defibs-registry-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const { defibs } = await CFR.apiGet('/api/defibs');
    _defibs = defibs;
    if (!defibs.length) {
      el.innerHTML = '<p style="color:var(--text-muted); font-size:14px;">No defibrillators registered.</p>';
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>ID</th><th>Location</th><th>Make/Model</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${defibs.map(d => `<tr>
          <td>${d.group_id}</td>
          <td>${d.location}</td>
          <td class="text-muted">${[d.make, d.model].filter(Boolean).join(' ') || '—'}</td>
          <td>${d.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-grey">Inactive</span>'}</td>
          <td><button class="btn btn-sm btn-ghost" onclick="openDefibModal('${d.uuid}')">Edit</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  } catch (e) {
    el.innerHTML = `<p style="color:var(--red); font-size:14px;">${e.message}</p>`;
  }
}

async function loadBleedKits() {
  const el = document.getElementById('bleed-kits-registry-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const { bleed_kits } = await CFR.apiGet('/api/bleed-kits');
    _bleedKits = bleed_kits;
    if (!bleed_kits.length) {
      el.innerHTML = '<p style="color:var(--text-muted); font-size:14px;">No bleed kits registered.</p>';
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>ID</th><th>Location</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${bleed_kits.map(b => `<tr>
          <td>${b.group_id}</td>
          <td>${b.location}</td>
          <td>${b.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-grey">Inactive</span>'}</td>
          <td><button class="btn btn-sm btn-ghost" onclick="openBleedKitModal('${b.uuid}')">Edit</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  } catch (e) {
    el.innerHTML = `<p style="color:var(--red); font-size:14px;">${e.message}</p>`;
  }
}

// ── Defib modal ───────────────────────────────────────────────────────────────

function openDefibModal(uuid) {
  _editingDefibUuid = uuid || null;
  const d = uuid ? _defibs.find(x => x.uuid === uuid) : null;
  document.getElementById('defib-modal-title').textContent = d ? 'Edit Defibrillator' : 'Add Defibrillator';
  document.getElementById('defib-modal-uuid').value        = uuid || '';
  document.getElementById('defib-group-id').value          = d?.group_id           || '';
  document.getElementById('defib-location').value          = d?.location           || '';
  document.getElementById('defib-make').value              = d?.make               || '';
  document.getElementById('defib-model').value             = d?.model              || '';
  document.getElementById('defib-serial').value            = d?.serial_number      || '';
  document.getElementById('defib-lock-code').value         = d?.case_lock_code     || '';
  document.getElementById('defib-install-date').value      = d?.installation_date  || '';
  document.getElementById('defib-responsible').value       = d?.responsible_person || '';
  document.getElementById('defib-contact').value           = d?.contact_number     || '';
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
    loadEquipmentReport();
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
    loadEquipmentReport();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

// ── Bleed kit modal ───────────────────────────────────────────────────────────

function openBleedKitModal(uuid) {
  _editingBkUuid = uuid || null;
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
    loadEquipmentReport();
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
    loadEquipmentReport();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

// ── Uniform Tracker (coordinator summary tab) ─────────────────────────────────

async function loadUniformTabSummary() {
  const container = document.getElementById('uniform-report-summary');
  if (!container) return;
  try {
    const { report } = await CFR.apiGet('/api/uniform/report');
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
        <div class="stat-card"><div class="stat-value">${report.outstanding}</div><div class="stat-label">Outstanding</div></div>
        <div class="stat-card"><div class="stat-value">${report.returned}</div><div class="stat-label">Returned</div></div>
        <div class="stat-card"><div class="stat-value">${report.issued}</div><div class="stat-label">Awaiting Ack</div></div>
        <div class="stat-card"><div class="stat-value">${report.total}</div><div class="stat-label">Total Issued</div></div>
      </div>`;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger" style="margin:0;"><span>⚠</span>${e.message}</div>`;
  }
}

// ── Load List Expiry / Restocking ─────────────────────────────────────────────

let _restockItems = [];
let _restockMonth = null;

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

async function loadRestockStatus() {
  const container = document.getElementById('restock-status');
  if (!container) return;
  try {
    const { items, check_month } = await CFR.apiGet('/api/monthly-check/restock');
    _restockItems = items || [];
    _restockMonth = check_month;

    if (!_restockItems.length) {
      container.innerHTML = `<p style="font-size:14px; color:var(--green); margin:0;">All items OK on the ${check_month ? `${check_month} ` : ''}monthly check.</p>`;
      return;
    }

    const expired  = _restockItems.filter(i => i.reason === 'expired');
    const expiring = _restockItems.filter(i => i.reason === 'expiring');
    const depleted = _restockItems.filter(i => i.reason === 'depleted');

    const summary = [];
    if (depleted.length)  summary.push(`<span style="color:var(--red);">${depleted.length} depleted</span>`);
    if (expired.length)   summary.push(`<span style="color:var(--red);">${expired.length} expired</span>`);
    if (expiring.length)  summary.push(`<span style="color:var(--yellow, #b45309);">${expiring.length} expiring soon</span>`);

    container.innerHTML = `
      <div style="font-size:14px; margin-bottom:8px;">
        ${summary.join(' · ')} — from the ${check_month || 'latest'} check
      </div>
      ${_restockItems.map(i => {
        const colour = i.reason === 'expiring' ? 'var(--yellow, #b45309)' : 'var(--red)';
        const expiryStr = (i.expiry_month != null && i.expiry_year != null)
          ? ` (exp. ${MONTHS_SHORT[i.expiry_month - 1]} ${i.expiry_year})`
          : '';
        const reasonLabel = i.reason === 'depleted' ? 'Depleted' : i.reason === 'expired' ? 'Expired' : `Expiring in ${i.days_left}d`;
        return `<div style="display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid var(--border); font-size:13px;">
          <span style="color:${colour}; font-size:11px; font-weight:600; min-width:80px;">${reasonLabel}</span>
          <span>${i.label}${expiryStr}</span>
        </div>`;
      }).join('')}`;
  } catch { container.innerHTML = ''; }
}

async function generateRestockingList() {
  if (!_restockItems.length) {
    // Try fetching fresh
    try {
      const { items, check_month } = await CFR.apiGet('/api/monthly-check/restock');
      _restockItems = items || [];
      _restockMonth = check_month;
    } catch (e) { CFR.toast(e.message, 'error'); return; }
  }

  if (!_restockItems.length) {
    CFR.toast('No items to restock — all OK on the latest check.', 'success');
    return;
  }

  const subtitle = document.getElementById('restock-modal-subtitle');
  subtitle.textContent = `From monthly check: ${_restockMonth || 'latest'} · ${_restockItems.length} item${_restockItems.length !== 1 ? 's' : ''} need attention`;

  const list = document.getElementById('restock-modal-list');
  list.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead>
        <tr style="border-bottom:2px solid var(--border); text-align:left;">
          <th style="padding:6px 8px; font-weight:600;">Item</th>
          <th style="padding:6px 8px; font-weight:600; text-align:center;">Qty</th>
          <th style="padding:6px 8px; font-weight:600;">Reason</th>
          <th style="padding:6px 8px; text-align:center;">✓</th>
        </tr>
      </thead>
      <tbody>
        ${_restockItems.map((i, idx) => {
          const expiryStr = (i.expiry_month != null && i.expiry_year != null)
            ? `${MONTHS_SHORT[i.expiry_month - 1]} ${i.expiry_year}`
            : '';
          const reasonLabel = i.reason === 'depleted' ? 'Depleted' : i.reason === 'expired' ? `Expired (${expiryStr})` : `Expiring (${expiryStr}, ${i.days_left}d)`;
          return `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:8px;">${i.label}</td>
            <td style="padding:8px; text-align:center; font-variant-numeric:tabular-nums;">${i.qty}</td>
            <td style="padding:8px; font-size:12px; color:var(--text-muted);">${reasonLabel}</td>
            <td style="padding:8px; text-align:center;"><input type="checkbox" id="restock-chk-${idx}"></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  document.getElementById('restock-modal').classList.remove('hidden');
}

function printRestockList() {
  const content = document.getElementById('restock-modal-list').innerHTML;
  const subtitle = document.getElementById('restock-modal-subtitle').textContent;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Restocking List</title>
    <style>body{font-family:sans-serif;padding:20px;}h2{margin-bottom:4px;}p{color:#666;margin-top:0;}
    table{width:100%;border-collapse:collapse;}th,td{padding:8px;border:1px solid #ccc;text-align:left;}
    th{background:#f5f5f5;}@media print{input{display:none;} td:last-child{min-width:30px;}}</style></head>
    <body><h2>Restocking List</h2><p>${subtitle}</p>${content}</body></html>`);
  w.document.close();
  w.print();
}

function exportRestockCSV() {
  const rows = [['Item', 'Qty Needed', 'Reason', 'Expiry']];
  _restockItems.forEach(i => {
    const expiryStr = (i.expiry_month != null && i.expiry_year != null)
      ? `${MONTHS_SHORT[i.expiry_month - 1]} ${i.expiry_year}`
      : '';
    rows.push([`"${i.label}"`, i.qty, i.reason, expiryStr]);
  });
  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `restock-${_restockMonth || 'latest'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Availability Summary ──────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

async function loadAvailabilityView() {
  const container = document.getElementById('availability-summary');
  if (!container) return;
  container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
  try {
    const { days } = await CFR.apiGet('/api/rota/availability/summary');
    const today = new Date().toISOString().slice(0, 10);

    if (!days || !days.some(d => d.slots.length)) {
      container.innerHTML = '<p style="font-size:14px; color:var(--text-muted); padding:8px 0; margin:0;">No availability submitted for the next 7 days.</p>';
      return;
    }

    container.innerHTML = days.map(d => {
      const date    = new Date(d.date + 'T00:00:00');
      const dayName = DAY_NAMES[date.getDay()];
      const isToday = d.date === today;
      const label   = isToday ? `Today (${dayName})` : `${dayName} ${CFR.fmtDate(d.date)}`;

      if (!d.slots.length) return `
        <div style="padding:8px 0; border-bottom:1px solid var(--border);">
          <div style="font-size:13px; font-weight:${isToday ? '700' : '500'}; color:${isToday ? 'var(--blue)' : 'var(--text-primary)'};">${label}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">No availability submitted</div>
        </div>`;

      const slots = d.slots.map(s => {
        const time = (s.start && s.end) ? ` · ${s.start}–${s.end}` : '';
        return `<span style="display:inline-block; background:var(--surface-muted,var(--surface)); border:1px solid var(--border); border-radius:6px; padding:2px 8px; margin:2px; font-size:12px;">${s.name}${time}</span>`;
      }).join('');

      return `
        <div style="padding:8px 0; border-bottom:1px solid var(--border);">
          <div style="font-size:13px; font-weight:${isToday ? '700' : '500'}; color:${isToday ? 'var(--blue)' : 'var(--text-primary)'}; margin-bottom:4px;">${label}</div>
          <div style="display:flex; flex-wrap:wrap; gap:2px;">${slots}</div>
        </div>`;
    }).join('') + `<p style="font-size:12px; color:var(--text-muted); margin:8px 0 0;">Showing availability submitted via the rota planner.</p>`;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger" style="margin:0;"><span>⚠</span>${e.message}</div>`;
  }
}

// ── Announcements ─────────────────────────────────────────────────────────────

let _announcements = [];

async function loadAnnouncementsTab() {
  const list = document.getElementById('announcements-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
  try {
    const { announcements } = await CFR.apiGet('/api/announcements');
    _announcements = announcements || [];

    if (!_announcements.length) {
      list.innerHTML = '<div class="empty-state"><p>No active announcements.</p></div>';
      return;
    }

    list.innerHTML = _announcements.map(a => {
      const expires = a.expires_at ? ` · Expires ${CFR.fmtDate(a.expires_at.slice(0,10))}` : '';
      return `
        <div class="card" style="margin-bottom:10px; padding:14px;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:15px;">${a.title}</div>
              <div style="font-size:13px; color:var(--text-muted); margin-top:4px; white-space:pre-wrap;">${a.body}</div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">
                By ${a.created_by_name} · ${CFR.fmtDate(a.created_at.slice(0,10))}${expires}
              </div>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="openAnnouncementModal('${a.id}')">Edit</button>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div class="alert alert-danger"><span>⚠</span>${e.message}</div>`;
  }
}

function openAnnouncementModal(id) {
  const a = id ? _announcements.find(x => x.id === id) : null;
  document.getElementById('announcement-modal-title').textContent = a ? 'Edit Announcement' : 'New Announcement';
  document.getElementById('announcement-modal-id').value    = a?.id || '';
  document.getElementById('announcement-title').value       = a?.title || '';
  document.getElementById('announcement-body').value        = a?.body || '';
  document.getElementById('announcement-expires').value     = a?.expires_at ? a.expires_at.slice(0,10) : '';
  document.getElementById('announcement-delete-row').classList.toggle('hidden', !a);
  document.getElementById('announcement-modal').classList.remove('hidden');
}

function closeAnnouncementModal(e) {
  if (e && e.target !== document.getElementById('announcement-modal')) return;
  document.getElementById('announcement-modal').classList.add('hidden');
}

async function saveAnnouncement() {
  const id      = document.getElementById('announcement-modal-id').value;
  const title   = document.getElementById('announcement-title').value.trim();
  const body    = document.getElementById('announcement-body').value.trim();
  const expires = document.getElementById('announcement-expires').value;

  if (!title) { CFR.toast('Title is required.', 'warning'); return; }
  if (!body)  { CFR.toast('Message is required.', 'warning'); return; }

  const payload = {
    title,
    announcement_body: body,
    expires_at: expires ? new Date(expires + 'T23:59:59Z').toISOString() : null,
  };

  try {
    if (id) {
      await CFR.apiPatch(`/api/announcements/${id}`, payload);
    } else {
      await CFR.apiPost('/api/announcements', payload);
    }
    document.getElementById('announcement-modal').classList.add('hidden');
    CFR.toast(id ? 'Announcement updated.' : 'Announcement posted.', 'success');
    loadAnnouncementsTab();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function deleteAnnouncement() {
  const id = document.getElementById('announcement-modal-id').value;
  if (!id || !confirm('Delete this announcement? It will no longer appear on dashboards.')) return;
  try {
    await CFR.apiDelete(`/api/announcements/${id}`);
    document.getElementById('announcement-modal').classList.add('hidden');
    CFR.toast('Announcement deleted.', 'success');
    loadAnnouncementsTab();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}
