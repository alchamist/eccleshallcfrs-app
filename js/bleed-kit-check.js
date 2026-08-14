CFR.requireAuth();
if (!CFR.hasFeature('defib_tracker')) { location.href = '/dashboard.html'; }
if (!CFR.hasRole('defib_manager') && !CFR.hasRole('coordinator')) { location.href = '/defibs.html'; }

const params = new URLSearchParams(location.search);
const kitId = params.get('id');
if (!kitId) { location.href = '/defibs.html'; }

function toggleAccessFields() {
  const accessible = document.querySelector('input[name="cabinet-accessible"]:checked').value === 'yes';
  document.getElementById('access-fields').style.display = accessible ? '' : 'none';
}

async function loadKit() {
  try {
    const { bleed_kit, checks } = await CFR.apiGet(`/api/bleed-kits/${kitId}`);

    const info = document.getElementById('device-info');
    info.innerHTML = `
      <p class="card-title">${bleed_kit.group_id}</p>
      <div style="font-size:14px; color:var(--text-muted);">
        <div>${bleed_kit.location}</div>
        ${bleed_kit.cabinet_lock_code ? `<div style="margin-top:6px; font-weight:600; color:var(--text);">Cabinet code: ${bleed_kit.cabinet_lock_code}</div>` : ''}
      </div>`;

    if (checks.length && checks[0].kit_expiry) {
      document.getElementById('kit-expiry').value = checks[0].kit_expiry;
    }

    renderHistory(checks);
  } catch (e) {
    CFR.toast('Failed to load bleed kit: ' + e.message, 'error');
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
          ${c.kit_expiry ? `<div style="font-size:12px; color:var(--text-muted);">Expiry: ${c.kit_expiry}</div>` : ''}
        </div>
        ${badge}
      </div>
    </div>`;
  }).join('') + '<div style="padding-top:2px;"></div>';
}

async function submitCheck() {
  const accessible = document.querySelector('input[name="cabinet-accessible"]:checked').value === 'yes';
  const kitExpiry = document.getElementById('kit-expiry').value;

  if (accessible && !kitExpiry) {
    CFR.toast('Kit expiry date is required.', 'warning');
    return;
  }

  const payload = {
    cabinet_accessible: accessible,
    kit_present:  accessible ? document.querySelector('input[name="kit-present"]:checked').value === 'yes' : null,
    kit_expiry:   accessible ? (kitExpiry || null) : null,
    notes: document.getElementById('check-notes').value.trim(),
  };

  try {
    const result = await CFR.submitForm(`/api/bleed-kits/${kitId}/checks`, payload);
    if (result.queued) {
      CFR.toast('Saved offline — will sync when online.', 'success');
    } else {
      CFR.toast('Check recorded.', 'success');
    }
    location.href = '/defibs.html?tab=bleed-kits';
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

loadKit();
