/* ── Auth ──────────────────────────────────────────────────────────────────── */

function getAccessKey() { return localStorage.getItem('cfr_key'); }

function getUser() {
  const raw = localStorage.getItem('cfr_user');
  return raw ? JSON.parse(raw) : null;
}

function isLoggedIn() { return !!(getAccessKey() && getUser()); }

function hasRole(role) {
  const user = getUser();
  if (!user?.roles) return false;
  if (user.roles.includes('coordinator')) return true; // coordinator has all access
  return user.roles.includes(role);
}

function setOnShift(active) {
  if (active) localStorage.setItem('cfr_on_shift', '1');
  else localStorage.removeItem('cfr_on_shift');
}

function logout() {
  if (localStorage.getItem('cfr_on_shift')) {
    if (!confirm('You are currently signed on to an active shift.\n\nSign off the shift first, or tap OK to sign out anyway.')) return;
  }
  localStorage.removeItem('cfr_key');
  localStorage.removeItem('cfr_user');
  localStorage.removeItem('cfr_on_shift');
  location.href = '/';
}

function lockDevice() {
  if (localStorage.getItem('cfr_on_shift')) {
    if (!confirm('You are signed on to an active shift.\n\nSign off first, or tap OK to switch users anyway.')) return;
  }
  localStorage.removeItem('cfr_key');
  localStorage.removeItem('cfr_user');
  localStorage.removeItem('cfr_on_shift');
  location.href = '/';
}

function requireAuth() {
  if (!isLoggedIn()) { location.href = '/'; return false; }
  return true;
}

function requireRole(role) {
  if (!hasRole(role)) { location.href = '/dashboard.html'; return false; }
  return true;
}

/* ── IndexedDB offline queue ─────────────────────────────────────────────── */

const DB_NAME = 'cfr-app';
const DB_VER  = 1;
const STORE   = 'pending';
let _db;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('status', 'status');
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function queueSubmission(endpoint, payload) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const entry = {
      id: crypto.randomUUID(),
      endpoint,
      payload,
      queuedAt: new Date().toISOString(),
      status: 'pending',
    };
    tx.objectStore(STORE).add(entry);
    tx.oncomplete = () => resolve(entry.id);
    tx.onerror    = e  => reject(e.target.error);
  });
}

async function getPending() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('status').getAll('pending');
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e  => reject(e.target.error);
  });
}

async function removePending(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function flushQueue() {
  const items = await getPending();
  let synced = 0;
  for (const item of items) {
    try {
      await _apiFetch(item.endpoint, { method: 'POST', body: item.payload });
      await removePending(item.id);
      synced++;
    } catch { /* still offline or server error — leave in queue */ }
  }
  if (synced > 0) refreshSyncBadge();
  return synced;
}

async function refreshSyncBadge() {
  const items = await getPending();
  const el    = document.getElementById('sync-badge');
  if (!el) return;
  if (items.length === 0) {
    el.textContent = '';
    el.className   = 'sync-indicator sync-ok';
  } else {
    el.textContent = `${items.length} pending`;
    el.className   = 'sync-indicator sync-pending';
  }
}

/* ── API layer ───────────────────────────────────────────────────────────── */

async function _apiFetch(path, opts = {}) {
  const key = getAccessKey();
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) { logout(); throw new Error('Session expired'); }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const apiGet    = path        => _apiFetch(path);
const apiPost   = (path, body) => _apiFetch(path, { method: 'POST',   body });
const apiPatch  = (path, body) => _apiFetch(path, { method: 'PATCH',  body });
const apiDelete = path        => _apiFetch(path, { method: 'DELETE' });

async function submitForm(endpoint, payload) {
  if (!navigator.onLine) {
    await queueSubmission(endpoint, payload);
    refreshSyncBadge();
    return { queued: true };
  }
  try {
    return await apiPost(endpoint, payload);
  } catch (e) {
    if (!e.message.startsWith('HTTP')) {
      // Network-level failure despite onLine being true
      await queueSubmission(endpoint, payload);
      refreshSyncBadge();
      return { queued: true };
    }
    throw e;
  }
}

/* ── Vehicle config ──────────────────────────────────────────────────────── */

function getVehicleConfig() {
  const raw = localStorage.getItem('cfr_vehicle_config');
  return raw ? JSON.parse(raw) : { callsign: 'RC0681', tread_warn_mm: 3.0 };
}

async function fetchVehicleConfig() {
  try {
    const data = await apiGet('/api/config/vehicle');
    localStorage.setItem('cfr_vehicle_config', JSON.stringify(data.config));
    applyCallsign(data.config.callsign);
    return data.config;
  } catch { return getVehicleConfig(); }
}

function applyCallsign(callsign) {
  document.querySelectorAll('.callsign').forEach(el => { el.textContent = callsign; });
}

/* ── Navigation ──────────────────────────────────────────────────────────── */

function buildNav() {
  const nav = document.getElementById('bottom-nav');
  if (!nav) return;

  const user  = getUser();
  const links = [
    { href: '/dashboard.html',          icon: '🏠', label: 'Home'   },
    { href: '/vehicle-shift.html',       icon: '🚗', label: 'Shift'  },
    { href: '/duty-hours.html',          icon: '🕐', label: 'Duty'   },
    { href: '/vehicle-inspection.html',  icon: '✅', label: 'VDI'    },
    { href: '/mileage-claim.html',       icon: '📄', label: 'Claim'  },
    { href: '/defects.html',             icon: '⚠️', label: 'Faults' },
  ];

  if (!user?._device_mode) links.push({ href: '/availability.html', icon: '📅', label: 'Rota' });
  if (hasRole('coordinator')) links.push({ href: '/coordinator.html', icon: '⚙️', label: 'Admin' });
  if (hasRole('compliance'))  links.push({ href: '/compliance.html',  icon: '📋', label: 'Comply' });

  const cur = location.pathname;
  nav.innerHTML = links.map(l => {
    const active = cur === l.href || cur.endsWith(l.href.replace('/', ''));
    return `<a href="${l.href}" class="nav-item${active ? ' active' : ''}">
      <span class="nav-icon">${l.icon}</span>
      <span>${l.label}</span>
    </a>`;
  }).join('');
}

function buildHeader() {
  const user = getUser();
  const el = document.getElementById('header-user');
  if (el && user) el.textContent = user.name?.split(' ')[0] || user.name || '';

  const header = document.querySelector('.app-header');
  if (header && !header.querySelector('.header-sign-out')) {
    const btn = document.createElement('button');
    btn.className = 'header-btn header-sign-out';
    if (user?._device_mode) {
      btn.textContent = 'Switch User';
      btn.addEventListener('click', lockDevice);
    } else {
      btn.textContent = 'Sign out';
      btn.addEventListener('click', logout);
    }
    const badge = document.getElementById('sync-badge');
    if (badge) header.insertBefore(btn, badge);
    else header.appendChild(btn);
  }
}

/* ── Date / time helpers ─────────────────────────────────────────────────── */

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTime  = () => new Date().toTimeString().slice(0, 5);
const nowISO   = () => new Date().toISOString().slice(0, 16);

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(t) { return t ? t.slice(0, 5) : '—'; }

function minutesBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60000);
}

function fmtDuration(mins) {
  if (!mins || mins < 0) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function expiryStatus(month, year) {
  if (!month || !year) return 'none';
  const now       = new Date();
  const expiresAt = new Date(year, month - 1, 1); // first of that month
  const diffMs    = expiresAt - now;
  const diffDays  = diffMs / 86400000;
  if (diffDays <  0)  return 'expired';
  if (diffDays < 31)  return 'red';
  if (diffDays < 92)  return 'amber';
  return 'green';
}

/* ── Toast ───────────────────────────────────────────────────────────────── */

function toast(msg, type = 'info') {
  const el     = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  // allow paint before transition
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ── Init ────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  refreshSyncBadge();
  buildNav();
  buildHeader();
  // Apply cached callsign immediately, then refresh in background
  applyCallsign(getVehicleConfig().callsign);
  if (isLoggedIn()) fetchVehicleConfig();
});

window.addEventListener('online', () => {
  flushQueue();
  toast('Back online — syncing…', 'success');
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SYNC_REQUESTED') flushQueue();
  });
}

/* ── Public API ──────────────────────────────────────────────────────────── */

window.CFR = {
  // auth
  getUser, getAccessKey, isLoggedIn, hasRole, logout, lockDevice, requireAuth, requireRole, setOnShift,
  // config
  getVehicleConfig, fetchVehicleConfig,
  // api
  apiGet, apiPost, apiPatch, apiDelete, submitForm,
  // queue
  queueSubmission, getPending, flushQueue, refreshSyncBadge,
  // dates
  todayISO, nowTime, nowISO,
  fmtDate, fmtDateTime, fmtTime, minutesBetween, fmtDuration, expiryStatus,
  // ui
  toast,
};
