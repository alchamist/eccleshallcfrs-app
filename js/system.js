document.addEventListener('DOMContentLoaded', async () => {
  if (!CFR.requireAuth()) return;

  // Support role required — coordinators without support cannot access this page
  const user = CFR.getUser();
  if (!user?.roles?.includes('support')) {
    location.href = '/dashboard.html';
    return;
  }

  CFR.fetchVehicleConfig();

  // ── Group Identity ────────────────────────────────────────────────────────

  async function loadIdentity() {
    try {
      const { config } = await CFR.apiGet('/api/config/vehicle');
      document.getElementById('cfg-scheme-name').value   = config.scheme_name || '';
      document.getElementById('cfg-callsign').value      = config.callsign    || '';
      document.getElementById('cfg-wallboard-pin').value = config.wallboard_pin || '';
    } catch (e) {
      CFR.toast('Failed to load identity settings: ' + e.message, 'error');
    }
  }

  document.getElementById('save-identity-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-identity-btn');
    btn.disabled = true;
    try {
      await CFR.apiPatch('/api/config/vehicle', {
        scheme_name:   document.getElementById('cfg-scheme-name').value.trim(),
        callsign:      document.getElementById('cfg-callsign').value.trim(),
        wallboard_pin: document.getElementById('cfg-wallboard-pin').value.trim(),
      });
      // Refresh cached config so header updates
      await CFR.fetchVehicleConfig();
      CFR.toast('Identity saved', 'success');
    } catch (e) {
      CFR.toast('Save failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ── Features ──────────────────────────────────────────────────────────────

  async function loadFeatures() {
    try {
      const [featData, userData] = await Promise.all([
        CFR.apiGet('/api/config/features'),
        CFR.apiGet('/api/users'),
      ]);

      document.getElementById('feat-fire-safety').checked = featData.features.fire_safety !== false;
      document.getElementById('feat-training').checked    = featData.features.training    !== false;

      const hasFSO = (userData.users || []).some(u => u.active && u.roles?.includes('fire_safety_officer'));
      if (hasFSO) {
        const toggle = document.getElementById('feat-fire-safety');
        toggle.disabled = true;
        toggle.closest('label').style.opacity = '0.4';
        document.getElementById('fire-safety-locked-msg').classList.remove('hidden');
      }
    } catch (e) {
      CFR.toast('Failed to load feature settings: ' + e.message, 'error');
    }
  }

  document.getElementById('features-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await CFR.apiPost('/api/config/features', {
        features: {
          fire_safety: document.getElementById('feat-fire-safety').checked,
          training:    document.getElementById('feat-training').checked,
        },
      });
      localStorage.removeItem('cfr_features');
      CFR.toast('Features saved', 'success');
    } catch (e) {
      CFR.toast('Save failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  loadIdentity();
  loadFeatures();
});
