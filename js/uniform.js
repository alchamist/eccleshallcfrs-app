CFR.requireAuth();
if (!CFR.hasRole('uniform_officer') && !CFR.hasRole('coordinator')) {
  location.href = '/dashboard.html';
}

let _items  = [];   // item type definitions
let _users  = [];   // responders for dropdowns
let _issues = [];   // current filtered issues list
let _editingItemId = null;

/* ── Boot ─────────────────────────────────────────────────────────────────── */

async function init() {
  document.getElementById('issue-date').value = CFR.todayISO();
  await Promise.all([loadUsers(), loadItems()]);
  await loadIssues();
}

/* ── Tabs ─────────────────────────────────────────────────────────────────── */

function switchUniformTab(tab) {
  ['register','items'].forEach(t => {
    document.getElementById(`utab-${t}`).classList.toggle('hidden', t !== tab);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (btn) {
      btn.className = t === tab ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    }
  });
  if (tab === 'items') renderItems(_items);
}

/* ── Users (for filter + issue dropdowns) ────────────────────────────────── */

async function loadUsers() {
  try {
    const { users } = await CFR.apiGet('/api/users');
    _users = (users || []).filter(u => u.active && (u.roles || []).includes('responder'));
    populateResponderDropdowns();
  } catch { /* non-fatal */ }
}

function populateResponderDropdowns() {
  const filterSel  = document.getElementById('filter-responder');
  const issueSel   = document.getElementById('issue-responder');
  const opts = _users.map(u => `<option value="${u.access_key}">${u.name}</option>`).join('');
  filterSel.innerHTML = '<option value="">All responders</option>' + opts;
  issueSel.innerHTML  = '<option value="">Select responder…</option>' + opts;
}

/* ── Item types ──────────────────────────────────────────────────────────── */

async function loadItems() {
  try {
    const data = await CFR.apiGet('/api/uniform/items');
    _items = data.items || [];
    populateItemDropdown();
  } catch {
    _items = [];
  }
}

function populateItemDropdown() {
  const sel = document.getElementById('issue-item');
  const active = _items.filter(i => i.active !== false);
  sel.innerHTML = '<option value="">Select item…</option>' +
    active.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
}

function renderItems(items) {
  const el = document.getElementById('items-list');
  if (!items.length) {
    el.innerHTML = '<p class="text-center text-muted text-sm" style="padding:20px;">No item types defined yet.</p>';
    return;
  }
  el.innerHTML = items.map(i => `
    <div class="sub-item" style="cursor:pointer;" onclick="openItemModal('${i.id}')">
      <div class="sub-item-body">
        <div class="sub-item-title">${i.name}</div>
        <div class="sub-item-meta">${capitalise(i.category || 'other')}${i.sizes?.length ? ' · ' + i.sizes.join(', ') : ''}${i.active === false ? ' · <span style="color:var(--red)">Inactive</span>' : ''}</div>
      </div>
      <span style="color:var(--text-muted); font-size:18px; line-height:1;">›</span>
    </div>`).join('');
}

/* ── Issues (register tab) ───────────────────────────────────────────────── */

async function loadIssues() {
  const responder = document.getElementById('filter-responder').value;
  const status    = document.getElementById('filter-status').value;

  let url = '/api/uniform/issues';
  const params = [];
  if (responder) params.push(`responder_id=${encodeURIComponent(responder)}`);
  if (status)    params.push(`status=${encodeURIComponent(status)}`);
  if (params.length) url += '?' + params.join('&');

  const el = document.getElementById('issues-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  try {
    const { issues } = await CFR.apiGet(url);
    _issues = issues || [];
    renderIssues(_issues);
  } catch (e) {
    el.innerHTML = `<p class="text-center text-muted text-sm" style="padding:20px;">Could not load: ${e.message}</p>`;
  }
}

function renderIssues(issues) {
  const el = document.getElementById('issues-list');
  if (!issues.length) {
    el.innerHTML = '<p class="text-center text-muted text-sm" style="padding:20px;">No items match the current filters.</p>';
    return;
  }

  const statusLabel = { issued: 'Awaiting ack', acknowledged: 'Acknowledged', returned: 'Returned' };
  const statusColor = { issued: 'var(--yellow, #b45309)', acknowledged: 'var(--green)', returned: 'var(--text-muted)' };

  el.innerHTML = issues.map(i => `
    <div class="sub-item">
      <div class="sub-item-body">
        <div class="sub-item-title">${i.item_name}${i.size ? ` (${i.size})` : ''}${i.quantity > 1 ? ` ×${i.quantity}` : ''}</div>
        <div class="sub-item-meta">${i.responder_name} · ${CFR.fmtDate(i.date_issued)}</div>
        <div class="sub-item-meta" style="color:${statusColor[i.status] || 'var(--text-muted)'}">${statusLabel[i.status] || i.status}</div>
      </div>
      ${i.status !== 'returned'
        ? `<button class="btn btn-ghost btn-sm" onclick="openReturnModal('${i.id}')">Return</button>`
        : '<span style="font-size:13px; color:var(--text-muted)">Returned</span>'
      }
    </div>`).join('');
}

/* ── Issue modal ─────────────────────────────────────────────────────────── */

function openIssueModal() {
  document.getElementById('issue-modal-title').textContent = 'Issue Uniform Item';
  document.getElementById('issue-modal-id').value   = '';
  document.getElementById('issue-item').value       = '';
  document.getElementById('issue-responder').value  = '';
  document.getElementById('issue-size').innerHTML   = '<option value="">N/A</option>';
  document.getElementById('issue-qty').value        = '1';
  document.getElementById('issue-date').value       = CFR.todayISO();
  document.getElementById('issue-condition').value  = 'new';
  document.getElementById('issue-modal').classList.remove('hidden');
}

function populateSizes() {
  const itemId = document.getElementById('issue-item').value;
  const item   = _items.find(i => i.id === itemId);
  const sel    = document.getElementById('issue-size');
  if (item?.sizes?.length) {
    sel.innerHTML = '<option value="">Select size…</option>' +
      item.sizes.map(s => `<option value="${s}">${s}</option>`).join('');
  } else {
    sel.innerHTML = '<option value="">N/A</option>';
  }
}

async function saveIssue() {
  const itemId    = document.getElementById('issue-item').value;
  const respId    = document.getElementById('issue-responder').value;
  const size      = document.getElementById('issue-size').value;
  const qty       = parseInt(document.getElementById('issue-qty').value, 10) || 1;
  const dateVal   = document.getElementById('issue-date').value;
  const condition = document.getElementById('issue-condition').value;

  if (!itemId)  { CFR.toast('Please select an item.', 'error'); return; }
  if (!respId)  { CFR.toast('Please select a responder.', 'error'); return; }

  const item = _items.find(i => i.id === itemId);
  const user = _users.find(u => u.access_key === respId);

  try {
    await CFR.apiPost('/api/uniform/issues', {
      item_uuid:         itemId,
      item_name:         item?.name || '',
      responder_id:      respId,
      responder_name:    user?.name || '',
      size:              size || null,
      quantity:          qty,
      date_issued:       dateVal || CFR.todayISO(),
      condition_at_issue: condition,
    });
    document.getElementById('issue-modal').classList.add('hidden');
    CFR.toast('Item issued.', 'success');
    loadIssues();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

/* ── Return modal ────────────────────────────────────────────────────────── */

function openReturnModal(issueId) {
  const issue = _issues.find(i => i.id === issueId);
  document.getElementById('return-issue-id').value = issueId;
  document.getElementById('return-item-summary').textContent =
    issue ? `${issue.item_name}${issue.size ? ` (${issue.size})` : ''} — ${issue.responder_name}` : '';
  document.getElementById('return-condition').value = 'good';
  document.getElementById('return-modal').classList.remove('hidden');
}

async function recordReturn() {
  const id        = document.getElementById('return-issue-id').value;
  const condition = document.getElementById('return-condition').value;
  if (!id) return;

  try {
    await CFR.apiPatch(`/api/uniform/issues/${id}`, { status: 'returned', condition_at_return: condition });
    document.getElementById('return-modal').classList.add('hidden');
    CFR.toast('Return recorded.', 'success');
    loadIssues();
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

/* ── Item type modal ─────────────────────────────────────────────────────── */

function openItemModal(id) {
  _editingItemId = id || null;
  const item = id ? _items.find(i => i.id === id) : null;

  document.getElementById('item-modal-title').textContent = item ? 'Edit Item Type' : 'Add Item Type';
  document.getElementById('item-modal-id').value   = item?.id || '';
  document.getElementById('item-name').value       = item?.name || '';
  document.getElementById('item-category').value   = item?.category || 'top';
  document.getElementById('item-sizes').value      = (item?.sizes || []).join(',');
  document.getElementById('item-deactivate-row').classList.toggle('hidden', !item || item.active === false);
  document.getElementById('item-modal').classList.remove('hidden');
}

async function saveItem() {
  const name     = document.getElementById('item-name').value.trim();
  const category = document.getElementById('item-category').value;
  const sizesRaw = document.getElementById('item-sizes').value.trim();
  const sizes    = sizesRaw ? sizesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  if (!name) { CFR.toast('Name is required.', 'error'); return; }

  try {
    if (_editingItemId) {
      await CFR.apiPatch(`/api/uniform/items/${_editingItemId}`, { name, category, sizes });
    } else {
      await CFR.apiPost('/api/uniform/items', { name, category, sizes });
    }
    document.getElementById('item-modal').classList.add('hidden');
    CFR.toast(_editingItemId ? 'Item type updated.' : 'Item type added.', 'success');
    await loadItems();
    renderItems(_items);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

async function deactivateItem() {
  if (!_editingItemId) return;
  if (!confirm('Deactivate this item type? It will no longer appear in the issue form.')) return;

  try {
    await CFR.apiPatch(`/api/uniform/items/${_editingItemId}`, { active: false });
    document.getElementById('item-modal').classList.add('hidden');
    CFR.toast('Item type deactivated.', 'success');
    await loadItems();
    renderItems(_items);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
}

/* ── Util ─────────────────────────────────────────────────────────────────── */

function capitalise(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

init();
