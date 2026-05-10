CFR.requireAuth();

// ── Load list data ────────────────────────────────────────────────────────────
// Two sections: Response Bag and Scheme Vehicle Load List
// Items with hasExpiry: true get optional month/year inputs

const LOAD_LIST = [
  {
    id: 'response_bag',
    title: 'Response Bag',
    items: [
      { id: 'resp_bag_itself',    label: 'Response Bag',                             qty: 1,  hasExpiry: false },
      { id: 'opa_s1',            label: 'OP Airway Size 1',                          qty: 1,  hasExpiry: true },
      { id: 'opa_s2',            label: 'OP Airway Size 2',                          qty: 1,  hasExpiry: true },
      { id: 'opa_s3',            label: 'OP Airway Size 3',                          qty: 1,  hasExpiry: true },
      { id: 'opa_s4',            label: 'OP Airway Size 4',                          qty: 1,  hasExpiry: true },
      { id: 'suction_pump',      label: 'Manual Handheld Suction Pump',              qty: 1,  hasExpiry: false },
      { id: 'suction_canister',  label: 'Replacement Canister Set for Suction Pump', qty: 1,  hasExpiry: true },
      { id: 'adult_nrb',         label: 'Adult Non-Rebreather Mask',                qty: 1,  hasExpiry: true },
      { id: 'paed_nrb',          label: 'Paediatric Non-Rebreather Mask',           qty: 1,  hasExpiry: true },
      { id: 'adult_28',          label: 'Adult 28% Mask',                            qty: 1,  hasExpiry: true },
      { id: 'venturi_40',        label: '40% Venturi Cone',                          qty: 1,  hasExpiry: true },
      { id: 'rhino_clip',        label: 'Rhino Nasal Clip',                          qty: 1,  hasExpiry: true },
      { id: 'adult_bvm',         label: 'Adult BVM',                                qty: 1,  hasExpiry: true },
      { id: 'paed_bvm',          label: 'Paediatric BVM',                           qty: 1,  hasExpiry: true },
      { id: 'soft_tourniquet',   label: 'SOF-T Tourniquet',                         qty: 2,  hasExpiry: false },
      { id: 'olaes_bandage',     label: 'Olaes / Modular Bandage',                  qty: 1,  hasExpiry: true },
      { id: 'blast_bandage',     label: 'Blast Bandage',                            qty: 1,  hasExpiry: true },
      { id: 'chito_gauze',       label: 'Chito Gauze Haemostatic Gauze',            qty: 1,  hasExpiry: true },
      { id: 'chest_seal',        label: "Russell's Chest Seal",                     qty: 1,  hasExpiry: true },
      { id: 'conform_5',         label: '5cm Conforming Bandage',                   qty: 2,  hasExpiry: true },
      { id: 'conform_10',        label: '10cm Conforming Bandage',                  qty: 2,  hasExpiry: true },
      { id: 'conform_15',        label: '15cm Conforming Bandage',                  qty: 2,  hasExpiry: true },
      { id: 'dressing_10x10',    label: '10×10cm Dressing Pad',                     qty: 2,  hasExpiry: true },
      { id: 'dressing_20x20',    label: '20×20cm Dressing Pad',                     qty: 1,  hasExpiry: true },
      { id: 'dressing_20x45',    label: '20×45cm Dressing Pad',                     qty: 1,  hasExpiry: true },
      { id: 'saline_pods',       label: '20ml Irrigation Saline Pods',              qty: 3,  hasExpiry: true },
      { id: 'gauze_swabs',       label: 'Packs — Gauze Swabs (10cm)',               qty: 2,  hasExpiry: true },
      { id: 'foil_blanket_rb',   label: 'Foil Blanket',                             qty: 2,  hasExpiry: true },
      { id: 'transpore',         label: 'Transpore Tape (Roll) 2.5cm',              qty: 1,  hasExpiry: false },
      { id: 'triangular',        label: 'Triangular Bandages',                      qty: 2,  hasExpiry: true },
      { id: 'tuff_cut',          label: '"Tuff Cut" Shears / Scissors',             qty: 1,  hasExpiry: false },
      { id: 'pen_torch',         label: 'Pen Torch',                                qty: 1,  hasExpiry: false },
      { id: 'pulse_ox',          label: 'Pulse Oximeter',                           qty: 1,  hasExpiry: false },
      { id: 'stethoscope',       label: 'Stethoscope',                              qty: 1,  hasExpiry: false },
      { id: 'sphyg',             label: 'Manual Sphygmomanometer',                  qty: 1,  hasExpiry: false },
      { id: 'thermometer',       label: 'Tympanic Thermometer',                     qty: 1,  hasExpiry: false },
      { id: 'ear_covers',        label: 'Disposable Ear Lens Covers (pack)',        qty: 1,  hasExpiry: true },
      { id: 'o2_cylinder_rb',    label: '2 Litre Oxygen Cylinder (CD)',             qty: 1,  hasExpiry: false },
      { id: 'tiger_bag_rb',      label: 'Tiger Waste Bag',                          qty: 1,  hasExpiry: false },
    ],
  },
  {
    id: 'vehicle_load',
    title: 'Scheme Vehicle Load List',
    items: [
      { id: 'spare_adult_nrb',   label: 'Spare Adult Non-Rebreather Mask',         qty: 1,  hasExpiry: true },
      { id: 'spare_paed_nrb',    label: 'Spare Paediatric Non-Rebreather Mask',    qty: 1,  hasExpiry: true },
      { id: 'spare_28_mask',     label: 'Spare Adult 28% Mask',                    qty: 1,  hasExpiry: true },
      { id: 'spare_venturi',     label: 'Spare 40% Venturi Cone',                  qty: 1,  hasExpiry: true },
      { id: 'spare_conform5',    label: 'Spare 5cm Conforming Bandage',            qty: 2,  hasExpiry: true },
      { id: 'spare_conform10',   label: 'Spare 10cm Conforming Bandage',           qty: 2,  hasExpiry: true },
      { id: 'spare_conform15',   label: 'Spare 15cm Conforming Bandage',           qty: 2,  hasExpiry: true },
      { id: 'spare_10x10',       label: 'Spare 10×10cm Dressing Pad',              qty: 1,  hasExpiry: true },
      { id: 'spare_20x20',       label: 'Spare 20×20cm Dressing Pad',              qty: 1,  hasExpiry: true },
      { id: 'spare_20x45',       label: 'Spare 20×45cm Dressing Pad',              qty: 1,  hasExpiry: true },
      { id: 'spare_swabs',       label: 'Spare Packs — Gauze Swabs (10cm)',        qty: 2,  hasExpiry: true },
      { id: 'spare_foil',        label: 'Spare Foil Blanket',                      qty: 1,  hasExpiry: true },
      { id: 'spare_transpore',   label: 'Spare Transpore Tape (Roll) 2.5cm',       qty: 1,  hasExpiry: false },
      { id: 'spare_triangular',  label: 'Spare Triangular Bandages',               qty: 2,  hasExpiry: true },
      { id: 'spare_tuff_cut',    label: 'Spare "Tuff Cut" Shears',                 qty: 2,  hasExpiry: false },
      { id: 'spare_torch',       label: 'Spare Pen Torch',                         qty: 1,  hasExpiry: false },
      { id: 'spare_o2',          label: 'Spare 2 Litre Oxygen Cylinder (CD)',      qty: 1,  hasExpiry: false },
      { id: 'nitrile_gloves',    label: 'Box of Nitrile Gloves',                   qty: 1,  hasExpiry: true },
      { id: 'clinell_wipes',     label: 'Green Clinell Universal Wipes',            qty: 1,  hasExpiry: true },
      { id: 'alcohol_gel',       label: '50ml Alcohol Gel Tottle',                 qty: 1,  hasExpiry: true },
      { id: 'inco_pads',         label: 'Incontinence Pads',                       qty: 3,  hasExpiry: false },
      { id: 'vomit_bowl',        label: 'Vomit Bowl',                              qty: 4,  hasExpiry: false },
      { id: 'prf_form',          label: 'A3 Patient Report Form',                  qty: 1,  hasExpiry: false },
      { id: 'surgical_masks',    label: 'Box — IIR Surgical Face Masks',           qty: 1,  hasExpiry: true },
      { id: 'safety_glasses',    label: 'Safety Glasses',                           qty: 2,  hasExpiry: false },
      { id: 'aprons',            label: 'Aprons (1 roll)',                          qty: 1,  hasExpiry: false },
      { id: 'face_visor',        label: 'Disposable Face Visor',                   qty: 1,  hasExpiry: false },
      { id: 'blue_clinell',      label: 'Small Pack Anti-Microbial Hand Wipes (Blue Clinell)', qty: 1, hasExpiry: true },
      { id: 'aed_pads',          label: 'Spare Pair of AED Electrode Pads',        qty: 1,  hasExpiry: true },
      { id: 'aed',               label: 'Automated External Defibrillator (AED)',  qty: 1,  hasExpiry: false },
      { id: 'razor',             label: 'Disposable Razor',                        qty: 1,  hasExpiry: false },
      { id: 'spare_batteries',   label: 'Spare batteries (Pulse Ox / Thermometer)', qty: 1, hasExpiry: false },
      { id: 'cling_film',        label: 'Cling Film',                              qty: 1,  hasExpiry: false },
      { id: 'sterile_water',     label: 'Sterile Water for Irrigation 1L',         qty: 1,  hasExpiry: true },
      { id: 'tiger_bags_veh',    label: 'Tiger Waste Bags (Roll)',                 qty: 1,  hasExpiry: false },
      // Optional
      { id: 'laerdal_suction',   label: '[Optional] Laerdal Suction Unit',         qty: 1,  hasExpiry: false },
      { id: 'serres_liner',      label: '[Optional] Serres Suction Liner',         qty: 1,  hasExpiry: true },
      { id: 'suction_tubing',    label: '[Optional] Suction Connecting Tubing',    qty: 1,  hasExpiry: true },
      { id: 'maxi_yankauer',     label: '[Optional] Maxi Yankauer Catheter',       qty: 1,  hasExpiry: true },
      { id: 'midi_yankauer',     label: '[Optional] Midi Yankauer Catheter',       qty: 1,  hasExpiry: true },
    ],
  },
];

// State: { itemId: { status: 'pending'|'ok'|'flagged', expiry_month: null, expiry_year: null } }
const state = {};
LOAD_LIST.forEach(s => s.items.forEach(i => {
  state[i.id] = { status: 'pending', expiry_month: null, expiry_year: null };
}));

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const curYear = new Date().getFullYear();

function renderExpiryInputs(itemId) {
  const monthOpts = MONTHS.map((m, i) =>
    `<option value="${i + 1}">${m}</option>`
  ).join('');
  const yearOpts = Array.from({ length: 5 }, (_, i) => curYear + i)
    .map(y => `<option value="${y}">${y}</option>`).join('');

  return `
    <div class="expiry-inputs" id="expiry-${itemId}">
      <select onchange="setExpiry('${itemId}','month',this.value)">
        <option value="">Mnth</option>${monthOpts}
      </select>
      <select onchange="setExpiry('${itemId}','year',this.value)">
        <option value="">Year</option>${yearOpts}
      </select>
    </div>`;
}

function setExpiry(id, field, value) {
  state[id][`expiry_${field}`] = value ? parseInt(value) : null;
}

function renderChecklist() {
  const container = document.getElementById('checklist-container');
  container.innerHTML = LOAD_LIST.map(section => `
    <div>
      <div style="padding:12px 16px; background:var(--blue-light); border-bottom:1px solid var(--blue-mid); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:600; font-size:14px; color:var(--blue-dark);">${section.title}</span>
        <button class="btn btn-sm btn-success" onclick="markSectionOk('${section.id}')">All OK ✓</button>
      </div>
      ${section.items.map(item => {
        const s    = state[item.id].status;
        const icon = s === 'ok' ? '✓' : s === 'flagged' ? '✗' : '·';
        return `
          <div class="month-item ${s}" id="mitem-${item.id}" onclick="toggleItem('${item.id}')">
            <button class="item-flag-btn">${icon}</button>
            <span class="month-item-name">${item.label}</span>
            <span class="month-item-qty">×${item.qty}</span>
            ${item.hasExpiry ? renderExpiryInputs(item.id) : ''}
          </div>`;
      }).join('')}
    </div>`).join('');
}

function toggleItem(id) {
  const cur = state[id].status;
  state[id].status = cur === 'ok' ? 'flagged' : 'ok';
  refreshItem(id);

  // Show expiry inputs when item is confirmed OK
  const item = LOAD_LIST.flatMap(s => s.items).find(i => i.id === id);
  if (item?.hasExpiry) {
    const expEl = document.getElementById(`expiry-${id}`);
    if (expEl) expEl.style.display = state[id].status === 'ok' ? 'flex' : 'none';
  }
}

function refreshItem(id) {
  const el = document.getElementById(`mitem-${id}`);
  if (!el) return;
  const s    = state[id].status;
  const icon = s === 'ok' ? '✓' : s === 'flagged' ? '✗' : '·';
  el.className = `month-item ${s}`;
  el.querySelector('.item-flag-btn').textContent = icon;
}

function markSectionOk(sectionId) {
  const section = LOAD_LIST.find(s => s.id === sectionId);
  if (!section) return;
  section.items.forEach(item => {
    state[item.id].status = 'ok';
    refreshItem(item.id);
    if (item.hasExpiry) {
      const expEl = document.getElementById(`expiry-${item.id}`);
      if (expEl) expEl.style.display = 'flex';
    }
  });
}

function markAllOk() {
  LOAD_LIST.forEach(s => markSectionOk(s.id));
}

// ── Init ──────────────────────────────────────────────────────────────────────

const now = new Date();
document.getElementById('check-month').value =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

renderChecklist();

// ── Submit ────────────────────────────────────────────────────────────────────

document.getElementById('submit-btn').addEventListener('click', async () => {
  const month = document.getElementById('check-month').value;
  if (!month) { CFR.toast('Please select the check month.', 'warning'); return; }

  const pending = Object.entries(state).filter(([, v]) => v.status === 'pending');
  if (pending.length > 0) {
    CFR.toast(`${pending.length} items not yet confirmed — tap each item to mark OK or flag.`, 'warning');
    return;
  }

  const hasFlagged = Object.values(state).some(v => v.status === 'flagged');
  const notes      = document.getElementById('check-notes').value.trim();
  if (hasFlagged && !notes) {
    CFR.toast('Please describe the flagged items in the notes box.', 'warning');
    document.getElementById('check-notes').focus();
    return;
  }

  const user    = CFR.getUser();
  const payload = {
    completed_by_id:   user.id,
    completed_by_name: user.name,
    check_month:       month,
    vehicle:           CFR.getVehicleConfig().callsign,
    items:             state,
    notes,
    overall_pass:      !hasFlagged,
  };

  const btn    = document.getElementById('submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Submitting…';

  try {
    const result = await CFR.submitForm('/api/monthly-check', payload);
    document.getElementById('success-msg').classList.remove('hidden');
    window.scrollTo(0, 0);
    if (result.queued) {
      document.getElementById('success-msg').querySelector('span').textContent =
        'Saved offline — will sync when back online.';
    }
  } catch (e) {
    CFR.toast(e.message, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Submit Monthly Check';
  }
});
