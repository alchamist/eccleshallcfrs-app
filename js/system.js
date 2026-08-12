document.addEventListener('DOMContentLoaded', async () => {
  if (!CFR.requireAuth()) return;
  if (!CFR.hasRole('coordinator')) { location.href = '/dashboard.html'; return; }

  CFR.fetchVehicleConfig();

  const form    = document.getElementById('features-form');
  const status  = document.getElementById('features-status');

  async function load() {
    try {
      const data = await CFR.apiGet('/api/config/features');
      document.getElementById('feat-fire-safety').checked = data.features.fire_safety !== false;
      document.getElementById('feat-training').checked    = data.features.training    !== false;
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
