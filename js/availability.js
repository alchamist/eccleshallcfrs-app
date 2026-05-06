CFR.requireAuth();

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let _blocks = [];

function fmtDayDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return `${DOW[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
}

function switchAvailTab(tab) {
  ['availability', 'shifts'].forEach(t => {
    document.getElementById(`avail-tab-${t}`).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.avail-tab-btn').forEach(b => {
    b.className = b.dataset.tab === tab
      ? 'btn btn-primary btn-sm avail-tab-btn'
      : 'btn btn-ghost btn-sm avail-tab-btn';
  });
  if (tab === 'shifts') loadMyShifts();
}

// ── Availability tab ──────────────────────────────────────────────────────────

async function loadBlocks() {
  const el = document.getElementById('avail-blocks-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    const { blocks } = await CFR.apiGet('/api/rota/blocks');
    _blocks = blocks || [];

    if (!_blocks.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <h3>No planning blocks</h3>
          <p>Your coordinator hasn't opened a rota block for availability yet.</p>
        </div>`;
      return;
    }

    el.innerHTML = '';
    for (const block of _blocks) {
      const entries = await loadBlockAvailability(block.id);
      el.appendChild(buildBlockCard(block, entries));
    }
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span>${e.message}</div>`;
  }
}

async function loadBlockAvailability(blockId) {
  try {
    const { entries } = await CFR.apiGet(`/api/rota/availability?block_id=${blockId}`);
    return entries || [];
  } catch { return []; }
}

function buildBlockCard(block, myEntries) {
  const isOpen = block.status === 'open';
  const statusBadge = {
    open:      '<span class="badge badge-blue">Open</span>',
    published: '<span class="badge badge-green">Published</span>',
    closed:    '<span class="badge badge-grey">Closed</span>',
  };

  const entriesHtml = myEntries.length
    ? myEntries.map(e => `
        <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-top:1px solid var(--border);">
          <div style="flex:1; font-size:13px;">
            <strong>${fmtDayDate(e.date)}</strong> · ${e.start_time}–${e.end_time}
            ${e.notes ? `<span style="color:var(--text-muted);"> — ${e.notes}</span>` : ''}
          </div>
          ${isOpen ? `<button class="btn btn-sm btn-ghost" style="color:var(--red); padding:2px 8px;"
                               onclick="deleteAvailability('${block.id}','${e.id}')">✕</button>` : ''}
        </div>`).join('')
    : `<p style="font-size:13px; color:var(--text-muted); margin:8px 0 0; border-top:1px solid var(--border); padding-top:8px;">
         No availability submitted for this block.
       </p>`;

  const formHtml = isOpen ? `
    <div id="avail-form-${block.id}" class="hidden"
         style="background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;">
      <div class="form-group">
        <label class="form-label">Date</label>
        <input id="avail-date-${block.id}" class="form-input" type="date"
               min="${block.start_date}" max="${block.end_date}">
      </div>
      <div class="form-row">
        <div class="form-group mb-0">
          <label class="form-label">From</label>
          <input id="avail-start-${block.id}" class="form-input" type="time">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">To</label>
          <input id="avail-end-${block.id}" class="form-input" type="time">
        </div>
      </div>
      <div class="form-group" style="margin-top:12px; margin-bottom:0;">
        <label class="form-label">Notes (optional)</label>
        <input id="avail-notes-${block.id}" class="form-input" type="text"
               placeholder="e.g. Car shift only, morning only…">
      </div>
      <hr class="divider">
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost flex-1"
                onclick="document.getElementById('avail-form-${block.id}').classList.add('hidden')">Cancel</button>
        <button class="btn btn-primary flex-1" onclick="submitAvailability('${block.id}')">Add</button>
      </div>
    </div>
    <button class="btn btn-secondary btn-sm" style="margin-bottom:12px;"
            onclick="toggleAvailForm('${block.id}')">+ Add Availability</button>
  ` : '';

  const card = document.createElement('div');
  card.className = 'card';
  card.style.marginBottom = '16px';
  card.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
      <div style="font-weight:600;">${CFR.fmtDate(block.start_date)} – ${CFR.fmtDate(block.end_date)}</div>
      ${statusBadge[block.status] || `<span class="badge badge-grey">${block.status}</span>`}
    </div>
    ${block.notes ? `<p style="font-size:13px; color:var(--text-muted); margin-bottom:8px;">${block.notes}</p>` : ''}
    ${formHtml}
    <div>${entriesHtml}</div>
  `;
  return card;
}

function toggleAvailForm(blockId) {
  document.getElementById(`avail-form-${blockId}`).classList.toggle('hidden');
}

async function submitAvailability(blockId) {
  const date  = document.getElementById(`avail-date-${blockId}`).value;
  const start = document.getElementById(`avail-start-${blockId}`).value;
  const end   = document.getElementById(`avail-end-${blockId}`).value;
  const notes = document.getElementById(`avail-notes-${blockId}`).value.trim();

  if (!date)         { CFR.toast('Please select a date.', 'warning'); return; }
  if (!start)        { CFR.toast('Please enter a start time.', 'warning'); return; }
  if (!end)          { CFR.toast('Please enter an end time.', 'warning'); return; }
  if (end <= start)  { CFR.toast('End time must be after start time.', 'warning'); return; }

  try {
    await CFR.apiPost('/api/rota/availability', {
      block_id: blockId, date, start_time: start, end_time: end, notes,
    });
    CFR.toast('Availability submitted.', 'success');
    loadBlocks();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function deleteAvailability(blockId, id) {
  if (!confirm('Remove this availability entry?')) return;
  try {
    await CFR.apiDelete(`/api/rota/availability?id=${id}&block_id=${blockId}`);
    CFR.toast('Entry removed.', 'success');
    loadBlocks();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

// ── My Shifts tab ─────────────────────────────────────────────────────────────

async function loadMyShifts() {
  const el = document.getElementById('avail-shifts-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    if (!_blocks.length) {
      const { blocks } = await CFR.apiGet('/api/rota/blocks');
      _blocks = blocks || [];
    }

    const allShifts = [];
    await Promise.all(_blocks.map(async block => {
      try {
        const { shifts } = await CFR.apiGet(`/api/rota/shifts?block_id=${block.id}`);
        (shifts || []).forEach(s => allShifts.push({ ...s, _block: block }));
      } catch { /* block might have no shifts */ }
    }));

    allShifts.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));

    if (!allShifts.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <h3>No shifts allocated yet</h3>
          <p>Your coordinator hasn't allocated any shifts to you yet.</p>
        </div>`;
      return;
    }

    const typeIcons = { car: '🚗', fundraising: '💰', training: '📚', other: '📅' };
    const statusBadge = {
      allocated: '<span class="badge badge-blue">Allocated</span>',
      confirmed: '<span class="badge badge-green">Confirmed</span>',
      declined:  '<span class="badge badge-grey">Declined</span>',
      cancelled: '<span class="badge badge-grey">Cancelled</span>',
    };

    el.innerHTML = allShifts.map(s => `
      <div class="card" style="margin-bottom:10px; padding:14px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
          <div>
            <div style="font-weight:600; font-size:15px;">
              ${typeIcons[s.type] || '📅'} ${fmtDayDate(s.date)}
            </div>
            <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">
              ${s.start_time}–${s.end_time}
            </div>
            ${s.notes ? `<div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${s.notes}</div>` : ''}
          </div>
          <div style="text-align:right; flex-shrink:0;">
            ${statusBadge[s.status] || `<span class="badge badge-grey">${s.status}</span>`}
            ${s.status === 'allocated' ? `
              <br>
              <button class="btn btn-sm btn-ghost" style="color:var(--red); margin-top:6px;"
                      onclick="declineShift('${s._block.id}','${s.id}')">Decline</button>` : ''}
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span>${e.message}</div>`;
  }
}

async function declineShift(blockId, shiftId) {
  if (!confirm('Decline this shift? Your coordinator will need to reassign it.')) return;
  try {
    await CFR.apiPatch('/api/rota/shifts', { id: shiftId, block_id: blockId, status: 'declined' });
    CFR.toast('Shift declined.', 'success');
    loadMyShifts();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadBlocks();
