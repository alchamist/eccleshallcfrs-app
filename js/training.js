CFR.requireAuth();

async function init() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('train-date').value = today;

  document.getElementById('submit-btn').addEventListener('click', submitTraining);

  loadHistory();
}

async function submitTraining() {
  const date = document.getElementById('train-date').value;
  const hours = parseFloat(document.getElementById('train-hours').value);
  const type = document.getElementById('train-type').value;
  const desc = document.getElementById('train-desc').value.trim();

  if (!date) { CFR.toast('Please select a date.', 'warning'); return; }
  if (!hours || hours <= 0) { CFR.toast('Please enter valid hours.', 'warning'); return; }
  if (!type) { CFR.toast('Please select a training type.', 'warning'); return; }

  try {
    await CFR.apiPost('/api/training', { date, hours, type, description: desc });
    document.getElementById('success-msg').classList.remove('hidden');
    setTimeout(() => document.getElementById('success-msg').classList.add('hidden'), 3000);

    // Reset form
    document.getElementById('train-hours').value = '';
    document.getElementById('train-desc').value = '';
    document.getElementById('train-type').value = 'mandatory';
    document.getElementById('train-date').value = new Date().toISOString().slice(0, 10);

    loadHistory();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function loadHistory() {
  const container = document.getElementById('training-history');
  container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    const user = CFR.getUser();
    const params = new URLSearchParams({ user_id: user.id });
    const { entries } = await CFR.apiGet(`/api/training?${params}`);

    if (!entries || entries.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <h3>No training logged yet</h3>
          <p>Log your mandatory training days above.</p>
        </div>`;
      return;
    }

    // Group by year/month for display
    const grouped = {};
    entries.forEach(e => {
      const [year, month] = e.date.split('-');
      const key = `${year}-${month}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    });

    const typeLabel = { mandatory: 'Mandatory', optional: 'Optional', refresher: 'Refresher' };
    const typeColor = { mandatory: 'red', optional: 'blue', refresher: 'amber' };

    container.innerHTML = Object.entries(grouped)
      .reverse()
      .map(([month, items]) => {
        const totalHours = items.reduce((sum, e) => sum + e.hours, 0);
        return `
          <div class="card" style="margin-bottom:12px;">
            <div style="font-weight:600; margin-bottom:8px; color:var(--text-muted); font-size:13px;">
              ${new Date(month + '-01').toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
              <span style="float:right;"><strong>${totalHours}h</strong></span>
            </div>
            ${items.map(e => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px solid var(--border);">
                <div style="flex:1;">
                  <div style="font-size:14px;">
                    <strong>${CFR.fmtDate(e.date)}</strong> · ${e.hours}h
                  </div>
                  ${e.description ? `<div style="font-size:12px; color:var(--text-muted);">${e.description}</div>` : ''}
                </div>
                <span class="badge badge-${typeColor[e.type] || 'grey'}" style="flex-shrink:0;">
                  ${typeLabel[e.type] || e.type}
                </span>
              </div>`).join('')}
          </div>`;
      }).join('');
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span>${e.message}</div>`;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

init();
