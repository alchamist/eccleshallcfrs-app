document.addEventListener('DOMContentLoaded', async () => {
  if (!CFR.requireAuth()) return;
  if (!CFR.hasRole('coordinator')) { location.href = '/dashboard.html'; return; }

  CFR.fetchVehicleConfig();

  const form    = document.getElementById('features-form');
  const status  = document.getElementById('features-status');

  async function load() {
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
      CFR.toast('Failed to load settings: ' + e.message, 'error');
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await CFR.apiPost('/api/config/features', {
        features: {
          fire_safety: document.getElementById('feat-fire-safety').checked,
          training:    document.getElementById('feat-training').checked,
        },
      });
      localStorage.removeItem('cfr_features');
      CFR.toast('Settings saved', 'success');
    } catch (e) {
      CFR.toast('Save failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  load();
});
