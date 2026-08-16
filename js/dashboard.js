CFR.requireAuth();

async function init() {
  await Promise.all([loadActiveShift(), loadStats(), loadRecent(), loadMaintenanceBanners(), loadAnnouncements(), loadUniformAcknowledgements()]);
}

async function loadUniformAcknowledgements() {
  if (!CFR.hasFeature('uniform_tracker')) return;
  try {
    const { issues } = await CFR.apiGet('/api/uniform/issues?responder_id=self&status=issued');
    if (!issues?.length) return;

    const user = CFR.getUser();
    const pending = issues.filter(i => i.responder_id === user.id || i.responder_id === user.access_key);
    if (!pending.length) return;

    const container = document.getElementById('announcements');
    const banner = document.createElement('div');
    banner.id = 'uniform-ack-banner';
    banner.className = 'card';
    banner.style.cssText = 'margin-bottom:10px; padding:14px; border-left:3px solid var(--yellow, #b45309);';
    banner.innerHTML = `
      <div style="font-weight:600; font-size:15px; margin-bottom:6px;">Uniform items awaiting acknowledgement</div>
      <div style="font-size:14px; margin-bottom:10px;">
        You have ${pending.length} uniform item${pending.length !== 1 ? 's' : ''} issued to you that need acknowledgement.
      </div>
      <div id="uniform-ack-list" style="margin-bottom:10px;"></div>
      <button class="btn btn-primary btn-sm" onclick="acknowledgeAllUniform()">Acknowledge All</button>`;

    const listEl = banner.querySelector('#uniform-ack-list');
    listEl.innerHTML = pending.map(i => `<div style="font-size:13px; color:var(--text-muted); padding:2px 0;">• ${i.item_name}${i.size ? ` (${i.size})` : ''}, issued ${i.date_issued}</div>`).join('');

    if (container) container.prepend(banner);

    window._pendingUniformIssues = pending;
  } catch { /* non-fatal */ }
}

async function acknowledgeAllUniform() {
  const pending = window._pendingUniformIssues || [];
  if (!pending.length) return;
  const btn = document.querySelector('#uniform-ack-banner button');
  if (btn) { btn.disabled = true; btn.textContent = 'Acknowledging…'; }

  try {
    await Promise.all(pending.map(i => CFR.apiPost(`/api/uniform/issues/${i.id}/ack`, {})));
    document.getElementById('uniform-ack-banner')?.remove();
    CFR.toast('Uniform receipt acknowledged. Thank you.', 'success');
  } catch (e) {
    CFR.toast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Acknowledge All'; }
  }
}

async function loadAnnouncements() {
  try {
    const { announcements } = await CFR.apiGet('/api/announcements');
    const container = document.getElementById('announcements');
    if (!container || !announcements?.length) return;

    const dismissed = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');
    const visible = announcements.filter(a => !dismissed.includes(a.id));
    if (!visible.length) return;

    container.innerHTML = visible.map(a => `
      <div class="card" data-announcement-id="${a.id}" style="margin-bottom:10px; padding:14px; border-left:3px solid var(--blue); display:flex; gap:12px; align-items:flex-start;">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:15px; margin-bottom:4px;">${a.title}</div>
          <div style="font-size:14px; color:var(--text-muted); white-space:pre-wrap;">${a.body}</div>
        </div>
        <button onclick="dismissAnnouncement('${a.id}')" style="background:none; border:none; cursor:pointer; font-size:18px; line-height:1; color:var(--text-muted); flex-shrink:0; padding:0;">✕</button>
      </div>`).join('');
  } catch { /* non-fatal */ }
}

function dismissAnnouncement(id) {
  const dismissed = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');
  if (!dismissed.includes(id)) dismissed.push(id);
  localStorage.setItem('dismissed_announcements', JSON.stringify(dismissed));
  const card = document.querySelector(`[data-announcement-id="${id}"]`);
  if (card) card.remove();
}

async function loadMaintenanceBanners() {
  try {
    const { config } = await CFR.apiGet('/api/config/vehicle');
    localStorage.setItem('cfr_vehicle_config', JSON.stringify(config));

    const { entries } = await CFR.apiGet('/api/maintenance/log');
    const container = document.getElementById('maintenance-banners');
    if (!container) return;

    const today   = new Date(); today.setHours(0,0,0,0);
    const banners = [];

    // Helper: days until a date string
    const daysUntil = d => Math.floor((new Date(d) - today) / 86400000);

    // Helper: last done date for a type
    const lastDone = type => {
      const e = entries.find(x => x.type === type);
      return e ? e.done_at : null;
    };

    const m = config.maintenance || {};

    // MOT, service, insurance — fixed next_due date
    for (const [type, label] of [['mot','MOT'], ['service','Service'], ['insurance','Insurance']]) {
      const due = m[type]?.next_due;
      if (!due) continue;
      const days = daysUntil(due);
      const warn = m[type]?.warn_days ?? 30;
      if (days <= warn) {
        const overdue = days < 0;
        banners.push({ type: overdue ? 'danger' : 'warning', label, due, days, overdue });
      }
    }

    // Deep clean — interval-based from last done
    const cleanInterval = m.deep_clean?.interval_days ?? 60;
    const cleanWarn     = m.deep_clean?.warn_days ?? 7;
    const lastClean     = lastDone('deep_clean');
    if (lastClean) {
      const nextClean = new Date(lastClean);
      nextClean.setDate(nextClean.getDate() + cleanInterval);
      const days = daysUntil(nextClean.toISOString().slice(0,10));
      if (days <= cleanWarn) {
        banners.push({ type: days < 0 ? 'danger' : 'warning', label: 'Deep Clean', due: nextClean.toISOString().slice(0,10), days, overdue: days < 0 });
      }
    }

    if (!banners.length) { container.innerHTML = ''; return; }

    container.innerHTML = banners.map(b => `
      <div class="alert alert-${b.overdue ? 'danger' : 'warning'}" style="margin-bottom:10px;">
        <span class="alert-icon">${b.overdue ? '🔴' : '⚠️'}</span>
        <span><strong>${b.label}</strong> ${b.overdue ? `was due ${CFR.fmtDate(b.due)}` : `due ${CFR.fmtDate(b.due)} (${b.days} day${b.days !== 1 ? 's' : ''})`}</span>
      </div>`).join('');
  } catch { /* non-fatal */ }
}

async function loadActiveShift() {
  try {
    const { active } = await CFR.apiGet('/api/vehicle-shift');
    const banner = document.getElementById('active-shift-banner');
    if (!active) { banner.classList.add('hidden'); return; }

    const crew    = active.crew.filter(c => !c.signed_off);
    const names   = crew.map(c => c.name).join(', ');
    const driver  = active.crew.find(c => c.role === 'driver' && !c.signed_off);
    const started = CFR.fmtDateTime(active.start_datetime);
    const user    = CFR.getUser();
    const onShift = active.crew.some(c => c.responder_id === user.id && !c.signed_off);

    banner.innerHTML = `
      <div class="shift-banner">
        <div class="shift-banner-icon">🚗</div>
        <div class="shift-banner-body">
          <div class="shift-banner-title">${CFR.getVehicleConfig().callsign} — Active Shift</div>
          <div class="shift-banner-sub">Since ${started} · Crew: ${names || '—'}</div>
        </div>
        ${!onShift
          ? `<a href="/vehicle-shift.html" class="btn btn-sm" style="background:rgba(255,255,255,.25);color:white;border-color:transparent;">Join</a>`
          : `<a href="/vehicle-shift.html" class="btn btn-sm" style="background:rgba(255,255,255,.25);color:white;border-color:transparent;">View</a>`
        }
      </div>`;
    banner.classList.remove('hidden');
  } catch { /* non-fatal */ }
}

async function loadStats() {
  try {
    const user  = CFR.getUser();
    const stats = await CFR.apiGet(`/api/stats/user?id=${user.id}`);

    const now   = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    document.getElementById('stat-hours').textContent =
      CFR.fmtDuration((stats.duty_mins_month || 0));
    document.getElementById('stat-incidents').textContent =
      stats.incidents_month || 0;
    document.getElementById('stat-hours-ytd').textContent =
      CFR.fmtDuration((stats.duty_mins_ytd || 0));
    document.getElementById('stat-incidents-ytd').textContent =
      stats.incidents_ytd || 0;
  } catch {
    ['stat-hours','stat-incidents','stat-hours-ytd','stat-incidents-ytd']
      .forEach(id => { document.getElementById(id).textContent = '—'; });
  }
}

async function loadRecent() {
  const list = document.getElementById('recent-list');
  try {
    const { items } = await CFR.apiGet('/api/activity/recent');

    if (!items || items.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h3>No recent activity</h3>
          <p>Your submissions will appear here.</p>
        </div>`;
      return;
    }

    const icons = { duty: '⏱', vshift: '🚗', vdi: '✔', claim: '📄', monthly: '📋' };
    const labels = {
      duty:    'Duty Log',
      vshift:  'Vehicle Shift',
      vdi:     'Daily Inspection',
      claim:   'Mileage Claim',
      monthly: 'Monthly Check',
    };

    list.innerHTML = items.map(item => `
      <div class="sub-item">
        <div class="sub-item-icon">${icons[item.type] || '📋'}</div>
        <div class="sub-item-body">
          <div class="sub-item-title">${labels[item.type] || item.type}</div>
          <div class="sub-item-meta">${CFR.fmtDate(item.date)}</div>
        </div>
      </div>`).join('');
  } catch {
    list.innerHTML = '<p class="text-center text-muted text-sm" style="padding:20px;">Could not load activity.</p>';
  }
}

init();
