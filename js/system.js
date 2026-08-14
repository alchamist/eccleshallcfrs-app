document.addEventListener('DOMContentLoaded', async () => {
  if (!CFR.requireAuth()) return;
  if (!CFR.hasRole('coordinator')) { location.href = '/dashboard.html'; return; }

  CFR.fetchVehicleConfig();

  const user      = CFR.getUser();
  const isSupport = user?.roles?.includes('support');

  // Show editable or read-only identity fields based on role
  document.getElementById(isSupport ? 'identity-editable' : 'identity-readonly').classList.remove('hidden');

  // Features section is support-only
  if (isSupport) document.getElementById('features-form').classList.remove('hidden');

  // ── Group Identity ────────────────────────────────────────────────────────

  async function loadIdentity() {
    try {
      const { config } = await CFR.apiGet('/api/config/vehicle');
      document.getElementById('cfg-wallboard-pin').value = config.wallboard_pin || '';
      if (isSupport) {
        document.getElementById('cfg-scheme-name').value = config.scheme_name || '';
        document.getElementById('cfg-callsign').value    = config.callsign    || '';
      } else {
        document.getElementById('ro-scheme-name').textContent = config.scheme_name || '—';
        document.getElementById('ro-callsign').textContent    = config.callsign    || '—';
      }
    } catch (e) {
      CFR.toast('Failed to load settings: ' + e.message, 'error');
    }
  }

  document.getElementById('save-identity-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-identity-btn');
    btn.disabled = true;
    try {
      const patch = {
        wallboard_pin: document.getElementById('cfg-wallboard-pin').value.trim() || null,
      };
      if (isSupport) {
        patch.scheme_name = document.getElementById('cfg-scheme-name').value.trim();
        patch.callsign    = document.getElementById('cfg-callsign').value.trim();
      }
      const { config } = await CFR.apiPatch('/api/config/vehicle', patch);
      await CFR.fetchVehicleConfig();
      CFR.toast('Saved', 'success');
    } catch (e) {
      CFR.toast('Save failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ── Features (support only) ───────────────────────────────────────────────

  if (isSupport) {
    function syncDefibSubOptions() {
      const on = document.getElementById('feat-defib-tracker').checked;
      document.getElementById('defib-sub-options').classList.toggle('hidden', !on);
    }
    document.getElementById('feat-defib-tracker').addEventListener('change', syncDefibSubOptions);

    async function loadFeatures() {
      try {
        const [featData, userData] = await Promise.all([
          CFR.apiGet('/api/config/features'),
          CFR.apiGet('/api/users'),
        ]);
        document.getElementById('feat-fire-safety').checked              = featData.features.fire_safety !== false;
        document.getElementById('feat-training').checked                 = featData.features.training    !== false;
        document.getElementById('feat-defib-tracker').checked            = featData.features.defib_tracker === true;
        document.getElementById('feat-defib-compliance-report').checked  = featData.features.defib_compliance_report === true;
        syncDefibSubOptions();

        const users = userData.users || [];
        const hasFSO       = users.some(u => u.active && u.roles?.includes('fire_safety_officer'));
        const hasDefibMgr  = users.some(u => u.active && u.roles?.includes('defib_manager'));

        if (hasFSO) {
          const toggle = document.getElementById('feat-fire-safety');
          toggle.disabled = true;
          toggle.closest('label').style.opacity = '0.4';
          document.getElementById('fire-safety-locked-msg').classList.remove('hidden');
        }
        if (hasDefibMgr) {
          const toggle = document.getElementById('feat-defib-tracker');
          toggle.disabled = true;
          toggle.closest('label').style.opacity = '0.4';
          document.getElementById('defib-locked-msg').classList.remove('hidden');
        }
      } catch (e) {
        CFR.toast('Failed to load features: ' + e.message, 'error');
      }
    }

    document.getElementById('features-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await CFR.apiPost('/api/config/features', {
          features: {
            fire_safety:              document.getElementById('feat-fire-safety').checked,
            training:                 document.getElementById('feat-training').checked,
            defib_tracker:            document.getElementById('feat-defib-tracker').checked,
            defib_compliance_report:  document.getElementById('feat-defib-compliance-report').checked,
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

    loadFeatures();
  }

  loadIdentity();
});
