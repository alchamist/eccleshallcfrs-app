// GET /api/monthly-check/restock — returns items from the latest monthly check
// that are flagged (depleted/missing) or have expiry dates that are past or within 30 days.

// Minimal LOAD_LIST for server-side label/qty lookup
const LOAD_LIST_FLAT = [
  { id: 'resp_bag_itself',   label: 'Response Bag',                              qty: 1,  hasExpiry: false },
  { id: 'opa_s1',            label: 'OP Airway Size 1',                          qty: 1,  hasExpiry: true },
  { id: 'opa_s2',            label: 'OP Airway Size 2',                          qty: 1,  hasExpiry: true },
  { id: 'opa_s3',            label: 'OP Airway Size 3',                          qty: 1,  hasExpiry: true },
  { id: 'opa_s4',            label: 'OP Airway Size 4',                          qty: 1,  hasExpiry: true },
  { id: 'suction_pump',      label: 'Manual Handheld Suction Pump',              qty: 1,  hasExpiry: false },
  { id: 'suction_canister',  label: 'Replacement Canister Set for Suction Pump', qty: 1, hasExpiry: true },
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
  { id: 'laerdal_suction',   label: 'Laerdal Suction Unit (Optional)',         qty: 1,  hasExpiry: false },
  { id: 'serres_liner',      label: 'Serres Suction Liner (Optional)',         qty: 1,  hasExpiry: true },
  { id: 'suction_tubing',    label: 'Suction Connecting Tubing (Optional)',    qty: 1,  hasExpiry: true },
  { id: 'maxi_yankauer',     label: 'Maxi Yankauer Catheter (Optional)',       qty: 1,  hasExpiry: true },
  { id: 'midi_yankauer',     label: 'Midi Yankauer Catheter (Optional)',       qty: 1,  hasExpiry: true },
];

const ITEM_MAP = Object.fromEntries(LOAD_LIST_FLAT.map(i => [i.id, i]));
const EXPIRY_WARN_DAYS = 30;

export async function onRequestGet({ env, data }) {
  const roles = data.user.roles || [];
  if (!roles.includes('coordinator') && !roles.includes('compliance')) {
    return Response.json({ error: 'Coordinator or compliance role required' }, { status: 403 });
  }

  // Get most recent monthly check
  const { keys } = await env.CFR_DATA.list({ prefix: 'monthly:', limit: 50 });
  if (!keys.length) return Response.json({ items: [], check_month: null });

  keys.sort((a, b) => b.name.localeCompare(a.name));
  const check = await env.CFR_DATA.get(keys[0].name, { type: 'json' });
  if (!check) return Response.json({ items: [], check_month: null });

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const restockItems = [];

  for (const [itemId, itemState] of Object.entries(check.items || {})) {
    const meta = ITEM_MAP[itemId];
    if (!meta) continue;

    if (itemState.status === 'flagged') {
      restockItems.push({ id: itemId, label: meta.label, qty: meta.qty, reason: 'depleted' });
      continue;
    }

    if (meta.hasExpiry && itemState.expiry_month != null && itemState.expiry_year != null) {
      // Expiry is the last day of the recorded month
      const expiryDate = new Date(itemState.expiry_year, itemState.expiry_month, 0); // day 0 = last day of prev month
      const daysLeft = Math.floor((expiryDate - today) / 86400000);
      if (daysLeft < 0) {
        restockItems.push({ id: itemId, label: meta.label, qty: meta.qty, reason: 'expired', expiry_month: itemState.expiry_month, expiry_year: itemState.expiry_year });
      } else if (daysLeft <= EXPIRY_WARN_DAYS) {
        restockItems.push({ id: itemId, label: meta.label, qty: meta.qty, reason: 'expiring', days_left: daysLeft, expiry_month: itemState.expiry_month, expiry_year: itemState.expiry_year });
      }
    }
  }

  return Response.json({ items: restockItems, check_month: check.check_month });
}
