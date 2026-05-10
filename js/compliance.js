CFR.requireAuth();
CFR.requireRole('compliance');

let activeTab = 'overview';

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.className = b.dataset.tab === tab
      ? 'btn btn-primary btn-sm tab-btn'
      : 'btn btn-ghost btn-sm tab-btn';
  });
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  activeTab = tab;

  if (tab === 'overview') loadOverview();
  if (tab === 'expiry')   loadExpiry();
  if (tab === 'vdi')      loadVDI();
  if (tab === 'monthly')  loadMonthly();
}

// ── Overview ──────────────────────────────────────────────────────────────────

async function loadOverview() {
  const content = document.getElementById('overview-content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    const [stats, vdiData, monthlyData] = await Promise.all([
      CFR.apiGet('/api/stats'),
      CFR.apiGet('/api/vehicle-inspection?limit=1'),
      CFR.apiGet('/api/monthly-check?limit=1'),
    ]);

    const lastVDI     = vdiData.items?.[0];
    const lastMonthly = monthlyData.items?.[0];

    const now      = new Date();
    const daysSinceVDI = lastVDI
      ? Math.floor((now - new Date(lastVDI.date)) / 86400000)
      : null;

    const lastMonthlyDate = lastMonthly ? new Date(lastMonthly.check_month + '-01') : null;
    const monthsSinceCheck = lastMonthlyDate
      ? (now.getFullYear() - lastMonthlyDate.getFullYear()) * 12 +
        (now.getMonth() - lastMonthlyDate.getMonth())
      : null;

    const vdiStatus     = daysSinceVDI === null ? 'red'
      : daysSinceVDI === 0 ? 'green'
      : daysSinceVDI <= 3  ? 'amber'
      : 'red';

    const monthlyStatus = monthsSinceCheck === null ? 'red'
      : monthsSinceCheck === 0 ? 'green'
      : monthsSinceCheck === 1 ? 'amber'
      : 'red';

    content.innerHTML = `
      <p class="section-heading">Compliance Status</p>
      <div class="card">
        <div class="sub-item">
          <div class="sub-item-icon" style="background:var(--${vdiStatus === 'green' ? 'green' : vdiStatus === 'amber' ? 'amber' : 'red'}-light); font-size:20px;">✔</div>
          <div class="sub-item-body">
            <div class="sub-item-title flex items-center gap-2">
              <span class="rag rag-${vdiStatus}"></span> Vehicle Daily Inspection
            </div>
            <div class="sub-item-meta">
              ${lastVDI
                ? `Last: ${CFR.fmtDate(lastVDI.date)} (${daysSinceVDI}d ago) · ${lastVDI.overall_pass ? 'Pass' : '⚠ Issues'}`
                : 'No VDI on record'}
            </div>
          </div>
        </div>

        <div class="sub-item">
          <div class="sub-item-icon" style="background:var(--${monthlyStatus === 'green' ? 'green' : monthlyStatus === 'amber' ? 'amber' : 'red'}-light); font-size:20px;">📋</div>
          <div class="sub-item-body">
            <div class="sub-item-title flex items-center gap-2">
              <span class="rag rag-${monthlyStatus}"></span> Monthly Load List Check
            </div>
            <div class="sub-item-meta">
              ${lastMonthly
                ? `Last: ${lastMonthly.check_month} · ${lastMonthly.overall_pass ? 'Pass' : '⚠ Issues'}`
                : 'No check on record'}
            </div>
          </div>
        </div>
      </div>

      <p class="section-heading">Open Defects</p>
      <div id="overview-defects-preview"></div>

      <p class="section-heading">Expiry Alerts</p>
      <div id="overview-expiry-preview"></div>`;

    loadDefectsPreview();
    loadExpiryPreview();
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger"><span>⚠</span>${e.message}</div>`;
  }
}

async function loadDefectsPreview() {
  const container = document.getElementById('overview-defects-preview');
  if (!container) return;

  try {
    const { defects } = await CFR.apiGet('/api/defects');
    const vehicle   = defects.filter(d => d.category === 'vehicle');
    const equipment = defects.filter(d => d.category === 'equipment');

    if (!defects.length) {
      container.innerHTML = '<div class="alert alert-success"><span class="alert-icon">✓</span>No open defects on record.</div>';
      return;
    }

    const rows = [
      vehicle.length   ? `<strong>${vehicle.length}</strong> vehicle defect${vehicle.length !== 1 ? 's' : ''}` : null,
      equipment.length ? `<strong>${equipment.length}</strong> equipment defect${equipment.length !== 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' · ');

    container.innerHTML = `
      <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div>
          <span class="rag rag-red" style="margin-right:6px;"></span>
          ${rows} open
        </div>
        <a href="/defects.html" class="btn btn-sm btn-secondary">View Register</a>
      </div>`;
  } catch { /* non-fatal */ }
}

async function loadExpiryPreview() {
  const container = document.getElementById('overview-expiry-preview');
  if (!container) return;

  try {
    const { items } = await CFR.apiGet('/api/monthly-check?limit=1');
    const latest    = items?.[0];
    if (!latest) {
      container.innerHTML = '<div class="card text-muted text-sm text-center" style="padding:16px;">No monthly check on record.</div>';
      return;
    }

    const alerts = buildExpiryAlerts(latest.items, 3);
    if (alerts.length === 0) {
      container.innerHTML = '<div class="alert alert-success"><span class="alert-icon">✓</span>No items expiring in the next 3 months.</div>';
    } else {
      container.innerHTML = `
        <div class="card" style="padding:0 16px;">
          ${alerts.map(a => `
            <div class="expiry-item">
              <span class="rag rag-${a.rag}"></span>
              <span class="expiry-name">${a.label}</span>
              <span class="expiry-date" style="color:var(--${a.rag === 'red' ? 'red' : a.rag === 'amber' ? 'amber' : 'green'})">${a.dateStr}</span>
            </div>`).join('')}
        </div>`;
    }
  } catch { /* non-fatal */ }
}

// ── Expiry ────────────────────────────────────────────────────────────────────

async function loadExpiry() {
  const content = document.getElementById('expiry-content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    const { items } = await CFR.apiGet('/api/monthly-check?limit=1');
    const latest    = items?.[0];

    if (!latest) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>No monthly check on record</h3><p>Complete a monthly load list check to see expiry dates.</p></div>';
      return;
    }

    const allAlerts = buildExpiryAlerts(latest.items, 99);
    const withDates = allAlerts.filter(a => a.rag !== 'none');
    const none      = allAlerts.filter(a => a.rag === 'none');

    content.innerHTML = `
      <div class="text-sm text-muted" style="margin-bottom:8px;">From check: ${latest.check_month} · ${latest.completed_by_name}</div>

      ${withDates.length > 0 ? `
        <p class="section-heading">Items with Expiry Dates</p>
        <div class="card" style="padding:0 16px;">
          ${withDates.map(a => `
            <div class="expiry-item">
              <span class="rag rag-${a.rag}"></span>
              <span class="expiry-name">${a.label}</span>
              <span class="expiry-date" style="color:var(--${a.rag === 'red' ? 'red' : a.rag === 'amber' ? 'amber' : 'green'})">${a.dateStr}</span>
            </div>`).join('')}
        </div>` : ''}

      ${none.length > 0 ? `
        <p class="section-heading">No Expiry Date Recorded</p>
        <div class="card" style="padding:0 16px;">
          ${none.map(a => `
            <div class="expiry-item">
              <span class="rag rag-grey"></span>
              <span class="expiry-name text-muted">${a.label}</span>
              <span class="expiry-date text-muted">—</span>
            </div>`).join('')}
        </div>` : ''}`;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger"><span>⚠</span>${e.message}</div>`;
  }
}

function buildExpiryAlerts(itemsState, maxMonths) {
  if (!itemsState) return [];

  // We need the load list labels — import from monthly-check context
  // Since that's a separate page, embed minimal label map here
  const LABELS = {
    opa_s1:'OP Airway Size 1', opa_s2:'OP Airway Size 2', opa_s3:'OP Airway Size 3', opa_s4:'OP Airway Size 4',
    suction_canister:'Replacement Suction Canister Set',
    adult_nrb:'Adult Non-Rebreather Mask', paed_nrb:'Paediatric Non-Rebreather Mask',
    adult_28:'Adult 28% Mask', venturi_40:'40% Venturi Cone', rhino_clip:'Rhino Nasal Clip',
    adult_bvm:'Adult BVM', paed_bvm:'Paediatric BVM',
    olaes_bandage:'Olaes/Modular Bandage', blast_bandage:'Blast Bandage',
    chito_gauze:'Chito Gauze Haemostatic Gauze', chest_seal:"Russell's Chest Seal",
    conform_5:'5cm Conforming Bandage', conform_10:'10cm Conforming Bandage', conform_15:'15cm Conforming Bandage',
    dressing_10x10:'10×10cm Dressing Pad', dressing_20x20:'20×20cm Dressing Pad', dressing_20x45:'20×45cm Dressing Pad',
    saline_pods:'20ml Irrigation Saline Pods', gauze_swabs:'Gauze Swabs (10cm)',
    foil_blanket_rb:'Foil Blanket (bag)', transpore:'Transpore Tape',
    triangular:'Triangular Bandages', ear_covers:'Ear Lens Covers',
    spare_adult_nrb:'Spare Adult NRB Mask', spare_paed_nrb:'Spare Paediatric NRB Mask',
    spare_28_mask:'Spare 28% Mask', spare_venturi:'Spare Venturi Cone',
    spare_conform5:'Spare 5cm Conforming', spare_conform10:'Spare 10cm Conforming', spare_conform15:'Spare 15cm Conforming',
    spare_10x10:'Spare 10×10 Dressing', spare_20x20:'Spare 20×20 Dressing', spare_20x45:'Spare 20×45 Dressing',
    spare_swabs:'Spare Gauze Swabs', spare_foil:'Spare Foil Blanket',
    nitrile_gloves:'Nitrile Gloves', clinell_wipes:'Clinell Universal Wipes',
    alcohol_gel:'Alcohol Gel', surgical_masks:'IIR Surgical Face Masks',
    blue_clinell:'Anti-Microbial Hand Wipes', aed_pads:'AED Electrode Pads',
    sterile_water:'Sterile Water for Irrigation',
    serres_liner:'Serres Suction Liner', suction_tubing:'Suction Connecting Tubing',
    maxi_yankauer:'Maxi Yankauer Catheter', midi_yankauer:'Midi Yankauer Catheter',
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return Object.entries(itemsState)
    .filter(([, v]) => v?.expiry_month || v?.expiry_year)
    .map(([id, v]) => {
      const month = v.expiry_month;
      const year  = v.expiry_year;
      const rag   = month && year ? CFR.expiryStatus(month, year) : 'none';
      const dateStr = month && year ? `${MONTHS[month - 1]} ${year}` : '—';

      const now     = new Date();
      const expDate = month && year ? new Date(year, month - 1, 1) : null;
      const diffMo  = expDate
        ? (expDate.getFullYear() - now.getFullYear()) * 12 + (expDate.getMonth() - now.getMonth())
        : null;

      return {
        id, label: LABELS[id] || id,
        rag: rag === 'expired' ? 'red' : rag,
        dateStr,
        diffMonths: diffMo,
      };
    })
    .filter(a => a.diffMonths === null || a.diffMonths <= maxMonths)
    .sort((a, b) => (a.diffMonths ?? 999) - (b.diffMonths ?? 999));
}

// ── VDI history ───────────────────────────────────────────────────────────────

async function loadVDI() {
  const content = document.getElementById('vdi-content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  const from = document.getElementById('vdi-from').value;
  const to   = document.getElementById('vdi-to').value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  try {
    const { items } = await CFR.apiGet(`/api/vehicle-inspection?${params}`);

    if (!items || items.length === 0) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✔</div><h3>No VDIs in this range</h3></div>';
      return;
    }

    content.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Date</th><th>By</th><th>Mileage</th><th>Fuel</th><th>Oil</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${CFR.fmtDate(item.date)}</td>
                <td>${item.completed_by_name || '—'}</td>
                <td>${item.starting_mileage?.toLocaleString() ?? '—'}</td>
                <td>${fuelLabel(item.fuel_level)}</td>
                <td>${oilLabel(item.oil_level)}</td>
                <td>
                  <span class="badge ${item.overall_pass ? 'badge-green' : 'badge-red'}">
                    ${item.overall_pass ? 'Pass' : 'Issues'}
                  </span>
                </td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="showVDIDetail(${JSON.stringify(item).replace(/"/g,"'")})">
                    View
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger"><span>⚠</span>${e.message}</div>`;
  }
}

function fuelLabel(v) {
  const FUEL = ['Empty','⅛','¼','⅜','½','⅝','¾','⅞','Full'];
  return v != null ? FUEL[v] : '—';
}

function oilLabel(v) {
  const OIL = ['Below Min','At Min','Normal','At Max','Above Max'];
  return v != null ? OIL[v] : '—';
}

function showVDIDetail(item) {
  const modal = document.getElementById('vdi-modal');
  const body  = document.getElementById('vdi-modal-content');

  const flagged = Object.entries(item.checks || {})
    .filter(([, v]) => v === 'flagged')
    .map(([k]) => k.replace(/_/g, ' '));

  body.innerHTML = `
    <div class="mb-4">
      <div><strong>Date:</strong> ${CFR.fmtDate(item.date)}</div>
      <div><strong>By:</strong> ${item.completed_by_name || '—'}</div>
      <div><strong>Mileage:</strong> ${item.starting_mileage?.toLocaleString() ?? '—'}</div>
      <div><strong>Fuel:</strong> ${fuelLabel(item.fuel_level)} &nbsp; <strong>Oil:</strong> ${oilLabel(item.oil_level)}</div>
      <div style="margin-top:8px;">
        <span class="badge ${item.overall_pass ? 'badge-green' : 'badge-red'}">
          ${item.overall_pass ? '✓ Pass' : '⚠ Issues Flagged'}
        </span>
      </div>
    </div>
    ${flagged.length > 0 ? `
      <div class="alert alert-danger" style="margin-bottom:12px;">
        <div><strong>Flagged items:</strong></div>
        <ul style="margin:6px 0 0 16px; font-size:13px;">
          ${flagged.map(f => `<li>${f}</li>`).join('')}
        </ul>
      </div>` : ''}
    ${item.defects_notes ? `
      <div class="form-group mb-0">
        <label class="form-label">Defects / Notes</label>
        <div style="padding:10px; background:var(--bg); border-radius:var(--radius); font-size:14px;">${item.defects_notes}</div>
      </div>` : ''}
    <hr class="divider">`;

  modal.classList.remove('hidden');
}

// ── Monthly checks ────────────────────────────────────────────────────────────

async function loadMonthly() {
  const content = document.getElementById('monthly-content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    const { items } = await CFR.apiGet('/api/monthly-check?limit=12');

    if (!items || items.length === 0) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>No monthly checks on record</h3></div>';
      return;
    }

    content.innerHTML = items.map(item => `
      <div class="card" style="margin-bottom:10px;">
        <div class="flex items-center justify-between mb-2">
          <div class="font-semi">${item.check_month}</div>
          <span class="badge ${item.overall_pass ? 'badge-green' : 'badge-red'}">
            ${item.overall_pass ? 'Pass' : 'Issues'}
          </span>
        </div>
        <div class="text-sm text-muted">By: ${item.completed_by_name || '—'}</div>
        ${item.notes ? `<div class="text-sm" style="margin-top:8px; color:var(--red);">${item.notes}</div>` : ''}
      </div>`).join('');
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger"><span>⚠</span>${e.message}</div>`;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

const now  = new Date();
const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
document.getElementById('vdi-from').value = from;
document.getElementById('vdi-to').value   = now.toISOString().slice(0, 10);

loadOverview();
