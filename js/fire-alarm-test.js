CFR.requireAuth();
CFR.requireRole('responder');

document.getElementById('check-date').value = CFR.todayISO();

document.getElementById('submit-btn').addEventListener('click', async () => {
  const date   = document.getElementById('check-date').value;
  const status = document.querySelector('input[name="status"]:checked')?.value;
  const notes  = document.getElementById('check-notes').value.trim();

  if (!date || !status) {
    CFR.toast('Please fill in all required fields.', 'warning');
    return;
  }

  const payload = {
    date,
    status,
    notes,
  };

  try {
    const result = await CFR.submitForm('/api/fire-safety/alarm-test', payload);

    if (result.queued) {
      document.getElementById('queued-msg').classList.remove('hidden');
      document.getElementById('success-msg').classList.add('hidden');
    } else {
      document.getElementById('success-msg').classList.remove('hidden');
      document.getElementById('queued-msg').classList.add('hidden');
    }

    document.getElementById('check-date').value = CFR.todayISO();
    document.querySelector('input[name="status"]:checked').checked = false;
    document.getElementById('check-notes').value = '';

    setTimeout(() => {
      document.getElementById('success-msg').classList.add('hidden');
      document.getElementById('queued-msg').classList.add('hidden');
    }, 4000);
  } catch (e) {
    CFR.toast(e.message, 'error');
  }
});
