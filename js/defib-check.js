CFR.requireAuth();
if (!CFR.hasFeature('defib_tracker')) { location.href = '/dashboard.html'; }
if (!CFR.hasRole('defib_manager') && !CFR.hasRole('coordinator')) { location.href = '/defibs.html'; }

const params = new URLSearchParams(location.search);
const defibId = params.get('id');
if (!defibId) { location.href = '/defibs.html'; }

let _defib = null;

function togglePresentFields() {
  const present = document.querySelector('input[name="defib-present"]:checked').value === 'yes';
  document.getElementById('present-fields').style.display = present ? '' : 'none';
}

async function loadDefib() {
  try {
    const { defib, checks } = await CFR.apiGet(`/api/defibs/${defibId}`);
    _defib = defib;

    // Device info card
    const info = document.getElementById('device-info');
    info.innerHTML = `
      <p class="card-title">${defib.group_id}</p>
      <div style="font-size:14px; color:var(--text-muted);">
        <div>${defib.location}</div>
        ${defib.make || defib.model ? `<div>${[defib.make, defib.model].filter(Boolean).join(' ')}</div>` : ''}
        ${defib.serial_number ? `<div>S/N: ${defib.serial_number}</div>` : ''}
        ${defib.case_lock_code ? `<div style="margin-top:6px; font-weight:600; color:var(--text);">Cabinet code: ${defib.case_lock_code}</div>` : ''}
      </div>`;

    // Pre-fill pads and battery expiry from last check
    if (checks.length) {
      const last = checks[0];
      if (last.pads_expiry)    document.getElementById('pads-expiry').value    = last.pads_expiry;
      if (last.battery_expiry) document.getElementById('battery-expiry').value = last.battery_expiry;
    }

    // History
    renderHistory(checks);
  } catch (e) {
    CFR.toast('Failed to load defib: ' + e.message, 'error');
    location.href = '/defibs.html';
  }
}

function renderHistory(checks) {
  const el = document.getElementById('check-history');
  if (!checks.length) {
    el.innerHTML = '<p style="color:var(--text-muted); font-size:14px; margin:0;">No checks recorded yet.</p>';
    return;
  }
  el.innerHTML = checks.map(c => {
    const hasFault = c.faults?.length > 0;
    const badge = hasFault
      ? '<span class="badge badge-red">Fault</span>'
      : '<span class="badge badge-green">OK</span>';
    const faultLine = hasFault ? `<div style="font-size:12px; color:var(--red);">${c.faults.join(', ')}</div>` : '';
    return `<div style="padding:10px 0; border-bottom:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:13px; font-weight:600;">${CFR.fmtDateTime(c.checked_at)}</div>
          <div style="font-size:12px; color:var(--text-muted);">by ${c.checker_name}</div>
          ${faultLine}
          ${c.pads_expiry ? `<div style="font-size:12px; color:var(--text-muted);">Pads: ${c.pads_expiry}</div>` : ''}
        </div>
        ${badge}
      </div>
    </div>`;
  }).join('') + '<div style="padding-top:2px;"></div>';
}

async function submitCheck() {
  const present = document.querySelector('input[name="defib-present"]:checked').value === 'yes';
  const padsExpiry = document.getElementById('pads-expiry').value;

  if (present && !padsExpiry) {
    CFR.toast('Pads expiry date is required.', 'warning');
    return;
  }

  const payload = {
    defib_present: present,
    rescue_ready:      present ? document.querySelector('input[name="rescue-ready"]:checked').value === 'pass' : null,
    prep_kit_present:  present ? document.querySelector('input[name="prep-kit"]:checked').value === 'yes' : null,
    pads_expiry:       present ? padsExpiry : null,
    battery_expiry:    present ? (document.getElementById('battery-expiry').value || null) : null,
    notes: document.getElementById('check-notes').value.trim(),
  };

  try {
    const result = await CFR.submitForm(`/api/defibs/${defibId}/checks`, payload);
    if (result.queued) {
      CFR.toast('Saved offline — will sync when online.', 'success');
    } else {
      CFR.toast('Check recorded.', 'success');
    }
    location.href = '/defibs.html';
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

loadDefib();
