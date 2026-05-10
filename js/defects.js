CFR.requireAuth();

let _activeTab    = 'vehicle';
let _showResolved = false;
let _resolveTarget = null;

function switchDefectTab(tab) {
  _activeTab = tab;
  ['vehicle', 'equipment'].forEach(t => {
    document.getElementById(`defect-tab-${t}`).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.defect-tab-btn').forEach(b => {
    b.className = b.dataset.tab === tab
      ? 'btn btn-primary btn-sm defect-tab-btn'
      : 'btn btn-ghost btn-sm defect-tab-btn';
  });
  loadDefects(tab);
}

async function loadDefects(category) {
  const el = document.getElementById(`defect-list-${category}`);
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    const params = new URLSearchParams({ category });
    if (_showResolved) params.set('include_resolved', 'true');
    const { defects } = await CFR.apiGet(`/api/defects?${params}`);

    const canResolve = CFR.hasRole('compliance');

    el.innerHTML = '';

    // Controls: toggle + new defect button
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;';
    controls.innerHTML = `
      <label style="display:flex; align-items:center; gap:6px; font-size:14px; cursor:pointer;">
        <input type="checkbox" id="toggle-resolved-${category}" ${_showResolved ? 'checked' : ''}
               onchange="toggleResolved('${category}')">
        Show resolved
      </label>
      <button class="btn btn-secondary btn-sm" onclick="toggleNewForm('${category}')">+ Report New</button>`;
    el.appendChild(controls);

    // New defect form (hidden by default)
    const formDiv = document.createElement('div');
    formDiv.id        = `new-defect-form-${category}`;
    formDiv.className = 'hidden';
    formDiv.style.cssText = 'background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px;';
    formDiv.innerHTML = `
      <div class="form-group mb-0">
        <label class="form-label">Defect Description <span class="req">*</span></label>
        <input id="new-defect-desc-${category}" class="form-input" type="text"
               placeholder="Brief description of the defect…">
      </div>
      <hr class="divider">
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost flex-1" onclick="toggleNewForm('${category}')">Cancel</button>
        <button class="btn btn-primary flex-1" onclick="submitNewDefect('${category}')">Submit</button>
      </div>`;
    el.appendChild(formDiv);

    const open     = defects.filter(d => d.status === 'open');
    const resolved = defects.filter(d => d.status === 'resolved');

    if (!defects.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">✓</div>
        <h3>No ${_showResolved ? '' : 'open '}defects</h3>
        <p>No ${category} defects currently on record.</p>`;
      el.appendChild(empty);
      return;
    }

    if (open.length) {
      const h = document.createElement('p');
      h.className   = 'section-heading';
      h.textContent = 'Open Defects';
      el.appendChild(h);
      open.forEach(d => el.appendChild(buildDefectCard(d, canResolve)));
    }

    if (resolved.length) {
      const h = document.createElement('p');
      h.className   = 'section-heading';
      h.textContent = 'Resolved';
      el.appendChild(h);
      resolved.forEach(d => el.appendChild(buildDefectCard(d, false)));
    }

  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span>${e.message}</div>`;
  }
}

function buildDefectCard(d, canResolve) {
  const card       = document.createElement('div');
  card.className   = 'card';
  card.style.marginBottom = '10px';

  const isResolved = d.status === 'resolved';
  const descEscaped = d.description.replace(/'/g, "\\'").replace(/"/g, '&quot;');

  card.innerHTML = `
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:15px; word-break:break-word;">${d.description}</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
          First reported ${CFR.fmtDateTime(d.first_reported_at)} by ${d.first_reported_by_name}
        </div>
        ${d.report_count > 1 ? `
          <div style="font-size:12px; color:var(--text-muted);">
            Last re-reported ${CFR.fmtDateTime(d.last_reported_at)} by ${d.last_reported_by_name}
            · <strong>${d.report_count} reports</strong>
          </div>` : ''}
        ${isResolved ? `
          <div style="font-size:12px; color:var(--green); margin-top:4px;">
            ✓ Resolved ${CFR.fmtDateTime(d.resolved_at)} by ${d.resolved_by_name}
            ${d.resolution_notes ? `— ${d.resolution_notes}` : ''}
          </div>` : ''}
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0;">
        <span class="badge ${isResolved ? 'badge-green' : 'badge-red'}">${isResolved ? 'Resolved' : 'Open'}</span>
        ${!isResolved ? `
          <button class="btn btn-sm btn-ghost" onclick="reReport('${d.id}','${d.category}',this)">
            Re-report
          </button>` : ''}
        ${!isResolved && canResolve ? `
          <button class="btn btn-sm btn-secondary"
                  onclick="openResolveModal('${d.id}','${d.category}','${descEscaped}')">
            Resolve
          </button>` : ''}
      </div>
    </div>`;
  return card;
}

function toggleNewForm(category) {
  document.getElementById(`new-defect-form-${category}`).classList.toggle('hidden');
}

function toggleResolved(category) {
  _showResolved = document.getElementById(`toggle-resolved-${category}`).checked;
  loadDefects(category);
}

async function submitNewDefect(category) {
  const desc = document.getElementById(`new-defect-desc-${category}`).value.trim();
  if (!desc) { CFR.toast('Please enter a defect description.', 'warning'); return; }

  try {
    await CFR.apiPost('/api/defects', { category, description: desc });
    CFR.toast('Defect reported.', 'success');
    loadDefects(category);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function reReport(id, category, btn) {
  btn.disabled    = true;
  btn.textContent = '…';
  try {
    await CFR.apiPost('/api/defects', { id, category });
    CFR.toast('Defect re-reported — last reported date updated.', 'success');
    loadDefects(category);
  } catch (e) {
    CFR.toast(e.message, 'error');
    btn.disabled    = false;
    btn.textContent = 'Re-report';
  }
}

function openResolveModal(id, category, description) {
  _resolveTarget = { id, category };
  document.getElementById('resolve-modal-desc').textContent = description;
  document.getElementById('resolve-notes').value = '';
  document.getElementById('resolve-modal').classList.remove('hidden');
}

function closeResolveModal() {
  document.getElementById('resolve-modal').classList.add('hidden');
  _resolveTarget = null;
}

async function confirmResolve() {
  if (!_resolveTarget) return;
  const notes = document.getElementById('resolve-notes').value.trim();
  try {
    await CFR.apiPatch('/api/defects', { ..._resolveTarget, resolution_notes: notes });
    CFR.toast('Defect marked as resolved.', 'success');
    closeResolveModal();
    loadDefects(_resolveTarget.category);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadDefects('vehicle');
