CFR.requireAuth();

// Check for fire_safety_officer or coordinator role
if (!CFR.hasRole('fire_safety_officer') && !CFR.hasRole('coordinator')) {
  CFR.toast('You do not have permission to access this form.', 'error');
  window.location.href = '/dashboard.html';
}

const user = CFR.getUser();
document.getElementById('check-date').value = CFR.todayISO();
document.getElementById('tested-by').value = user?.name || '';
document.getElementById('tested-by').disabled = true;

document.getElementById('submit-btn').addEventListener('click', async () => {
  const date   = document.getElementById('check-date').value;
  const numExtinguishers = parseInt(document.getElementById('num-extinguishers').value) || 0;
  const status = document.querySelector('input[name="status"]:checked')?.value;
  const locations = document.getElementById('locations').value.trim();
  const notes  = document.getElementById('check-notes').value.trim();

  if (!date || !status || numExtinguishers === 0) {
    CFR.toast('Please fill in all required fields.', 'warning');
    return;
  }

  const payload = {
    date,
    num_extinguishers: numExtinguishers,
    status,
    locations,
    tested_by: user?.name || '',
    notes,
  };

  try {
    const result = await CFR.submitForm('/api/fire-safety/extinguisher-test', payload);

    if (result.queued) {
      document.getElementById('queued-msg').classList.remove('hidden');
      document.getElementById('success-msg').classList.add('hidden');
    } else {
      document.getElementById('success-msg').classList.remove('hidden');
      document.getElementById('queued-msg').classList.add('hidden');
    }

    document.getElementById('check-date').value = CFR.todayISO();
    document.getElementById('num-extinguishers').value = '';
    document.querySelector('input[name="status"]:checked').checked = false;
    document.getElementById('locations').value = '';
    document.getElementById('check-notes').value = '';

    setTimeout(() => {
      document.getElementById('success-msg').classList.add('hidden');
      document.getElementById('queued-msg').classList.add('hidden');
    }, 4000);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
});
