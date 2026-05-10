CFR.requireAuth();

// ── Checklist data ────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'vehicle_condition',
    title: 'Vehicle Condition',
    items: [
      { id: 'bodywork',          label: 'Bodywork intact and damage free' },
      { id: 'tyre_condition',    label: 'Tyre condition OK and wear within legal limits' },
      { id: 'tyre_pressures',    label: 'Tyre pressures OK (visual inspection)' },
      { id: 'battenburg',        label: 'Battenburg markings intact' },
      { id: 'lights_main',       label: 'Parking / Dipped / High Beam working' },
      { id: 'indicators',        label: 'Indicators working correctly' },
      { id: 'brake_lights',      label: 'Brake lights working correctly' },
      { id: 'windscreen',        label: 'Windscreen intact, clean and free from damage' },
      { id: 'wipers',            label: 'Windscreen wipers working effectively' },
      { id: 'screen_wash',       label: 'Screen wash OK' },
      { id: 'fuel_50',           label: 'Fuel level above 50%' },
      { id: 'seatbelts',         label: 'Seat belts damage free and functional' },
      { id: 'saloon_lighting',   label: 'Saloon lighting functional' },
      { id: 'dashcam',           label: 'Dashcam operational' },
      { id: 'wing_mirrors',      label: 'Wing mirrors intact and correctly adjusted' },
      { id: 'warning_lights',    label: 'All dashboard warning lights extinguished on engine start' },
      { id: 'brakes',            label: 'All brakes operational without binding or noise' },
      { id: 'exterior_clean',    label: 'Vehicle exterior clean' },
      { id: 'interior_clean',    label: 'Vehicle interior clean and tidy' },
    ],
  },
  {
    id: 'equipment',
    title: 'Equipment',
    items: [
      { id: 'nma_device',        label: 'NMA device present, fully charged and operational' },
      { id: 'ipad',              label: 'iPad present, fully charged and operational' },
      { id: 'handheld_radio',    label: 'Handheld ARP Radio present, charged and fully operational' },
      { id: 'vehicle_radio',     label: 'Vehicle ARP Radio present and fully operational' },
      { id: 'amb_phone',         label: 'Ambulance phone present, charged and operational' },
      { id: 'helmets',           label: '2× Safety Helmets present and damage free' },
      { id: 'snow_shovel',       label: 'Snow shovel present' },
      { id: 'defibrillator',     label: 'Defibrillator present, checked, charged, pads in date and error-free on self test' },
      { id: 'response_bag',      label: 'Response Bag present, clean, stocked and damage free' },
      { id: 'patient_monitor',   label: 'Patient monitor present, clean, fully charged and operational' },
      { id: 'burns_kit',         label: 'Burns kit present, stocked and bag damage free' },
      { id: 'trauma_kit',        label: 'Spare Major Trauma/Bleed kit present, complete and intact' },
      { id: 'crew_ppe',          label: 'Crew PPE present (gloves, masks, aprons)' },
      { id: 'waste_bags',        label: 'Clinical Waste Bags present' },
      { id: 'prf_pad',           label: 'Paper PRF pad and clipboard present and damage free' },
      { id: 'arp_batteries',     label: 'Handheld ARP spare batteries ×2 present and charging/charged' },
      { id: 'suction_unit',      label: 'Suction unit present, operational and complete with yankauer and tubing' },
      { id: 'fire_extinguisher', label: 'Fire extinguisher present, in date and damage free' },
      { id: 'bag_buster',        label: 'Bag Buster present' },
      { id: 'tarpaulin',         label: 'Tarpaulin and kneeling pad present' },
    ],
  },
  {
    id: 'response_bag',
    title: 'Response Bag',
    items: [
      { id: 'o2_bottle',         label: 'Oxygen bottle present, damage free and charged to at least 25%' },
      { id: 'o2_masks',          label: 'Oxygen masks present including 100% NRB, Venturi and Nasal Cannula' },
      { id: 'bvm',               label: 'BVM present and in date' },
      { id: 'opas',              label: 'OPAs present and in date' },
      { id: 'trauma_bleed',      label: 'Major Trauma/Bleed kit (tourniquet, blast bandages, celox etc) present, complete and intact' },
      { id: 'first_aid',         label: 'First Aid/Wound Dressing packs (bandages, gauze, irripods etc) present' },
      { id: 'emesis_bag',        label: 'Emesis bag present' },
      { id: 'spo2_probe',        label: 'Spare SPO2 probe present and operational' },
    ],
  },
  {
    id: 'miscellaneous',
    title: 'Miscellaneous',
    items: [
      { id: 'directions',        label: 'Directions folder present' },
      { id: 'crew_water',        label: 'Crew drinking water present' },
    ],
  },
];

// State: 'pending' | 'ok' | 'flagged'
const state = {};
SECTIONS.forEach(s => s.items.forEach(i => { state[i.id] = 'pending'; }));

// ── Render checklists ─────────────────────────────────────────────────────────

function renderChecklists() {
  const container = document.getElementById('checklist-container');
  container.innerHTML = SECTIONS.map(section => `
    <div class="check-section">
      <div class="check-section-header">
        <span class="check-section-title">${section.title}</span>
        <button class="btn btn-sm btn-success" onclick="markSectionOk('${section.id}')">All OK ✓</button>
      </div>
      <div class="check-list" id="section-${section.id}">
        ${section.items.map(item => renderItem(item)).join('')}
      </div>
    </div>`).join('');
}

function renderItem(item) {
  const s    = state[item.id];
  const icon = s === 'ok' ? '✓' : s === 'flagged' ? '✗' : '·';
  return `
    <div class="check-item ${s}" id="item-${item.id}" onclick="toggleItem('${item.id}')">
      <div class="check-dot">${icon}</div>
      <div class="check-label">${item.label}</div>
    </div>`;
}

function refreshItem(id) {
  const el = document.getElementById(`item-${id}`);
  if (!el) return;
  const s    = state[id];
  const icon = s === 'ok' ? '✓' : s === 'flagged' ? '✗' : '·';
  el.className = `check-item ${s}`;
  el.querySelector('.check-dot').textContent = icon;
}

function toggleItem(id) {
  // pending → ok → flagged → ok (never back to pending once touched)
  const cur = state[id];
  state[id] = cur === 'ok' ? 'flagged' : 'ok';
  refreshItem(id);
  updateDefectsHint();
}

function markSectionOk(sectionId) {
  const section = SECTIONS.find(s => s.id === sectionId);
  if (!section) return;
  section.items.forEach(item => { state[item.id] = 'ok'; refreshItem(item.id); });
  updateDefectsHint();
}

function markAllOk() {
  SECTIONS.forEach(s => s.items.forEach(i => { state[i.id] = 'ok'; refreshItem(i.id); }));
  updateDefectsHint();
}

function updateDefectsHint() {
  const hasFlagged = Object.values(state).some(s => s === 'flagged');
  document.getElementById('defects-required-hint').style.display = hasFlagged ? 'block' : 'none';
}

// ── Fuel / oil level display ──────────────────────────────────────────────────

const FUEL_LABELS = ['Empty', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞', 'Full'];
const OIL_LABELS  = ['Below Min', 'At Min', 'Normal', 'At Max', 'Above Max'];

function fuelClass(v) {
  if (v <= 1) return 'level-bad';
  if (v <= 3) return 'level-warn';
  return 'level-ok';
}

function oilClass(v) {
  if (v === 0 || v === 4) return 'level-bad';
  if (v === 1 || v === 3) return 'level-warn';
  return 'level-ok';
}

const fuelInput = document.getElementById('fuel-level');
const fuelValue = document.getElementById('fuel-value');
const oilInput  = document.getElementById('oil-level');
const oilValue  = document.getElementById('oil-value');

fuelInput.addEventListener('input', () => {
  const v = parseInt(fuelInput.value);
  fuelValue.textContent = FUEL_LABELS[v];
  fuelValue.className   = `level-value ${fuelClass(v)}`;
});

oilInput.addEventListener('input', () => {
  const v = parseInt(oilInput.value);
  oilValue.textContent = OIL_LABELS[v];
  oilValue.className   = `level-value ${oilClass(v)}`;
});

// ── Init & submit ─────────────────────────────────────────────────────────────

document.getElementById('insp-date').value = CFR.todayISO();

renderChecklists();

// Live tread depth warning
function checkTreadWarning() {
  const warnMm  = CFR.getVehicleConfig().tread_warn_mm || 3.0;
  const labels  = { fl: 'Front Left', fr: 'Front Right', rl: 'Rear Left', rr: 'Rear Right' };
  const low = Object.keys(labels).filter(k => {
    const v = parseFloat(document.getElementById(`tread-${k}`).value);
    return !isNaN(v) && v < warnMm;
  });
  const el = document.getElementById('tread-warning');
  if (low.length) {
    document.getElementById('tread-warning-text').textContent =
      `${low.map(k => labels[k]).join(', ')} ${low.length > 1 ? 'are' : 'is'} below the ${warnMm}mm warning threshold — compliance will be notified.`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}
['fl','fr','rl','rr'].forEach(k =>
  document.getElementById(`tread-${k}`).addEventListener('input', checkTreadWarning)
);

document.getElementById('submit-btn').addEventListener('click', async () => {
  const date    = document.getElementById('insp-date').value;
  const mileage = parseInt(document.getElementById('insp-mileage').value, 10);

  if (!date)    { CFR.toast('Please enter a date.', 'warning');            return; }
  if (!mileage) { CFR.toast('Please enter the starting mileage.', 'warning'); return; }

  // Check all items have been touched
  const pending = Object.entries(state).filter(([, v]) => v === 'pending');
  if (pending.length > 0) {
    CFR.toast(`${pending.length} items not yet confirmed — please check all sections.`, 'warning');
    return;
  }

  const hasFlagged = Object.values(state).some(s => s === 'flagged');
  const defects    = document.getElementById('defects-notes').value.trim();
  if (hasFlagged && !defects) {
    CFR.toast('Please describe the flagged items in the defects box.', 'warning');
    document.getElementById('defects-notes').focus();
    return;
  }

  // Build payload
  const checks = {};
  SECTIONS.forEach(s => s.items.forEach(i => { checks[i.id] = state[i.id]; }));

  // Tread depth
  const vcfg  = CFR.getVehicleConfig();
  const tread = {
    fl: parseFloat(document.getElementById('tread-fl').value) || null,
    fr: parseFloat(document.getElementById('tread-fr').value) || null,
    rl: parseFloat(document.getElementById('tread-rl').value) || null,
    rr: parseFloat(document.getElementById('tread-rr').value) || null,
  };
  const warnMm   = vcfg.tread_warn_mm || 3.0;
  const lowTyres = Object.entries(tread)
    .filter(([, v]) => v !== null && v < warnMm)
    .map(([k]) => ({ fl: 'Front Left', fr: 'Front Right', rl: 'Rear Left', rr: 'Rear Right' }[k]));
  const treadBelowThreshold = lowTyres.length > 0;

  const user    = CFR.getUser();
  const payload = {
    completed_by_id:   user.id,
    completed_by_name: user.name,
    date,
    vehicle:          vcfg.callsign,
    starting_mileage: mileage,
    fuel_level:       parseInt(fuelInput.value),
    oil_level:        parseInt(oilInput.value),
    tread_depth:      tread,
    tread_below_threshold: treadBelowThreshold,
    checks,
    defects_notes:    defects,
    overall_pass:     !hasFlagged,
  };

  const btn    = document.getElementById('submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Submitting…';

  try {
    const result = await CFR.submitForm('/api/vehicle-inspection', payload);
    if (result.queued) {
      document.getElementById('queued-msg').classList.remove('hidden');
    } else {
      document.getElementById('success-msg').classList.remove('hidden');
    }
    window.scrollTo(0, 0);
  } catch (e) {
    CFR.toast(e.message, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Submit Inspection';
  }
});
