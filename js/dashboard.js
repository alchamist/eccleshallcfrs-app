CFR.requireAuth();

async function init() {
  await Promise.all([loadActiveShift(), loadStats(), loadRecent()]);
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
          <div class="shift-banner-title">RC0681 — Active Shift</div>
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
