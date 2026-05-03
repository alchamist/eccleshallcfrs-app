CFR.requireAuth();

let currentShift = null;
let currentShiftKey = null; // KV key for PATCH operations

// ── Render ────────────────────────────────────────────────────────────────────

async function loadShift() {
  try {
    const data = await CFR.apiGet('/api/vehicle-shift');
    currentShift = data.active || null;
    render();
  } catch {
    document.getElementById('page-content').innerHTML =
      '<div class="alert alert-danger"><span class="alert-icon">⚠</span>Could not load shift status.</div>';
  }
}

function render() {
  const content = document.getElementById('page-content');
  if (currentShift) {
    renderActiveShift(content);
  } else {
    renderNoShift(content);
  }
}

function renderNoShift(el) {
  el.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🚗</div>
      <h3>No active shift</h3>
      <p>RC0681 is not currently on duty.</p>
    </div>
    <button class="btn btn-success btn-block btn-lg" onclick="openStartModal(false)">
      Start Shift
    </button>`;
}

function renderActiveShift(el) {
  const user = CFR.getUser();
  const s    = currentShift;
  const onShift  = s.crew.some(c => c.responder_id === user.id && !c.signed_off);
  const isDriver = s.crew.some(c => c.responder_id === user.id && c.role === 'driver' && !c.signed_off);
  const started  = CFR.fmtDateTime(s.start_datetime);

  const crewHtml = s.crew.map(c => {
    const initials = c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const signedOff = !!c.signed_off;
    const isMe = c.responder_id === user.id;
    const meOnShift = s.crew.some(x => x.responder_id === user.id && !x.signed_off);

    return `
      <div class="crew-slot${c.role === 'driver' && !signedOff ? ' is-driver' : ''}${signedOff ? ' signed-off' : ''}">
        <div class="crew-avatar">${initials}</div>
        <div class="crew-info">
          <div class="crew-name">${c.name}${c.role === 'driver' && !signedOff ? ' <span class="badge badge-blue" style="font-size:11px;">Driver</span>' : ''}</div>
          <div class="crew-meta">
            On: ${CFR.fmtTime(c.signed_on?.slice(11, 16))}
            ${signedOff ? ` · Off: ${CFR.fmtTime(c.signed_off.slice(11, 16))}` : ''}
          </div>
        </div>
        <div class="crew-actions">
          ${!signedOff && c.role !== 'driver' && meOnShift && !isMe ? `
            <button class="btn btn-sm btn-secondary" onclick="setDriver('${c.responder_id}')">
              Set Driver
            </button>` : ''}
          ${isMe && !signedOff ? `
            <button class="btn btn-sm btn-danger" onclick="openSignoffModal()">Sign Off</button>` : ''}
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="shift-banner">
      <div class="shift-banner-icon">🚗</div>
      <div class="shift-banner-body">
        <div class="shift-banner-title">RC0681 — Active Shift</div>
        <div class="shift-banner-sub">Started ${started} · ${s.start_mileage?.toLocaleString() ?? '—'} mi</div>
      </div>
    </div>

    <p class="section-heading">Crew</p>
    <div class="crew-list">${crewHtml}</div>

    <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
      ${!onShift ? `
        <button class="btn btn-success flex-1" onclick="joinShift()">Join This Shift</button>` : ''}
    </div>

    <hr class="divider">
    <p class="section-heading">Recent Completed Shifts</p>
    <div id="recent-shifts">
      <div class="text-muted text-sm text-center" style="padding:12px;">Loading…</div>
    </div>`;

  loadRecentShifts();
}

async function loadRecentShifts() {
  try {
    const { recent } = await CFR.apiGet('/api/vehicle-shift');
    const el = document.getElementById('recent-shifts');
    if (!el) return;
    if (!recent || recent.length === 0) {
      el.innerHTML = '<div class="empty-state" style="padding:16px 0;"><p>No completed shifts yet.</p></div>';
      return;
    }
    el.innerHTML = recent.map(s => {
      const crew = s.crew.map(c => c.name).join(', ');
      const dur  = s.start_datetime && s.end_datetime
        ? CFR.fmtDuration(CFR.minutesBetween(s.start_datetime, s.end_datetime))
        : '—';
      const miles = (s.end_mileage && s.start_mileage)
        ? `${(s.end_mileage - s.start_mileage).toLocaleString()} mi`
        : '—';
      return `
        <div class="sub-item">
          <div class="sub-item-icon">🚗</div>
          <div class="sub-item-body">
            <div class="sub-item-title">${CFR.fmtDate(s.start_datetime?.slice(0,10))} · ${crew}</div>
            <div class="sub-item-meta">${dur} · ${miles} · ${s.number_of_jobs ?? 0} jobs</div>
          </div>
        </div>`;
    }).join('');
  } catch { /* non-fatal */ }
}

// ── Actions ───────────────────────────────────────────────────────────────────

function openStartModal() {
  document.getElementById('start-modal').classList.remove('hidden');
  document.getElementById('start-mileage').focus();
}

function closeStartModal() {
  document.getElementById('start-modal').classList.add('hidden');
}

async function confirmStart() {
  const mileage = parseInt(document.getElementById('start-mileage').value, 10);
  if (!mileage || mileage < 0) { CFR.toast('Please enter the starting mileage.', 'warning'); return; }

  const btn = document.getElementById('confirm-start-btn');
  btn.disabled = true; btn.textContent = 'Starting…';

  try {
    const { shift } = await CFR.apiPost('/api/vehicle-shift', { start_mileage: mileage });
    currentShift = shift;
    closeStartModal();
    render();
    CFR.toast('Shift started — you are the driver.', 'success');
  } catch (e) {
    CFR.toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Start Shift';
  }
}

async function joinShift() {
  if (!currentShift) return;
  try {
    const { shift } = await CFR.apiPatch('/api/vehicle-shift', { id: currentShift.id, action: 'join' });
    currentShift = shift;
    render();
    CFR.toast('You have joined the shift.', 'success');
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function setDriver(responder_id) {
  if (!currentShift) return;
  try {
    const { shift } = await CFR.apiPatch('/api/vehicle-shift', {
      id: currentShift.id, action: 'set_driver', driver_id: responder_id,
    });
    currentShift = shift;
    render();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

function openSignoffModal() {
  document.getElementById('signoff-modal').classList.remove('hidden');
}

function closeSignoffModal() {
  document.getElementById('signoff-modal').classList.add('hidden');
}

async function confirmSignoff() {
  const mileage  = parseInt(document.getElementById('signoff-mileage').value, 10);
  const jobs     = parseInt(document.getElementById('signoff-jobs').value, 10) || 0;
  const comments = document.getElementById('signoff-comments').value.trim();

  const activeCrew = currentShift.crew.filter(c => !c.signed_off);
  const isLast     = activeCrew.length === 1 &&
    activeCrew[0].responder_id === CFR.getUser().id;

  if (isLast && (!mileage || mileage < 0)) {
    CFR.toast('Please enter the ending mileage.', 'warning');
    return;
  }

  const btn = document.getElementById('confirm-signoff-btn');
  btn.disabled = true; btn.textContent = 'Signing off…';

  try {
    const { shift } = await CFR.apiPatch('/api/vehicle-shift', {
      id:          currentShift.id,
      action:      'leave',
      end_mileage: isLast ? mileage : undefined,
      number_of_jobs: isLast ? jobs : undefined,
      comments:    isLast ? comments : undefined,
    });

    currentShift = shift.status === 'active' ? shift : null;
    closeSignoffModal();
    render();

    const msg = isLast
      ? 'Shift completed. Don\'t forget your Individual Duty Log!'
      : 'Signed off successfully.';
    CFR.toast(msg, 'success');

    if (isLast) {
      setTimeout(() => {
        if (confirm('Would you like to submit your Individual Duty Log now?')) {
          location.href = '/duty-hours.html';
        }
      }, 800);
    }
  } catch (e) {
    CFR.toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'End Shift';
  }
}

loadShift();
