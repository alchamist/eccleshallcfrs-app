CFR.requireAuth();

const startDateEl  = document.getElementById('shift-start-date');
const startTimeEl  = document.getElementById('shift-start-time');
const endDateEl    = document.getElementById('shift-end-date');
const endTimeEl    = document.getElementById('shift-end-time');
const durationEl   = document.getElementById('duration-display');
const durationTxt  = document.getElementById('duration-text');
const attendedEl   = document.getElementById('incidents-attended');
const allocatedEl  = document.getElementById('incidents-allocated');
const submitBtn    = document.getElementById('submit-btn');

// Pre-fill today
startDateEl.value = CFR.todayISO();
endDateEl.value   = CFR.todayISO();
startTimeEl.value = CFR.nowTime();
endTimeEl.value   = CFR.nowTime();

// Calculate and show duration live
function updateDuration() {
  const start = startDateEl.value && startTimeEl.value
    ? `${startDateEl.value}T${startTimeEl.value}` : null;
  const end   = endDateEl.value && endTimeEl.value
    ? `${endDateEl.value}T${endTimeEl.value}` : null;

  if (!start || !end) { durationEl.classList.add('hidden'); return; }

  const mins = CFR.minutesBetween(start, end);
  if (mins < 0) {
    durationTxt.textContent = 'End time is before start time.';
    durationEl.className = 'alert alert-danger';
  } else {
    durationTxt.textContent = `Duration: ${CFR.fmtDuration(mins)}`;
    durationEl.className = 'alert alert-info';
  }
  durationEl.classList.remove('hidden');
}

[startDateEl, startTimeEl, endDateEl, endTimeEl].forEach(el =>
  el.addEventListener('change', updateDuration)
);
updateDuration();

submitBtn.addEventListener('click', async () => {
  // Validate
  if (!startDateEl.value || !startTimeEl.value) {
    CFR.toast('Please enter a shift start date and time.', 'warning');
    return;
  }
  if (!endDateEl.value || !endTimeEl.value) {
    CFR.toast('Please enter a shift end date and time.', 'warning');
    return;
  }

  const startISO = `${startDateEl.value}T${startTimeEl.value}`;
  const endISO   = `${endDateEl.value}T${endTimeEl.value}`;
  const mins     = CFR.minutesBetween(startISO, endISO);

  if (mins < 0) {
    CFR.toast('End time must be after start time.', 'warning');
    return;
  }

  const attended  = parseInt(attendedEl.value, 10) || 0;
  const allocated = parseInt(allocatedEl.value, 10) || 0;

  if (allocated < attended) {
    CFR.toast('Incidents allocated cannot be less than incidents attended.', 'warning');
    return;
  }

  const user = CFR.getUser();
  const payload = {
    responder_id:         user.id,
    responder_name:       user.name,
    shift_start:          startISO,
    shift_end:            endISO,
    duration_mins:        mins,
    incidents_attended:   attended,
    incidents_allocated:  allocated,
    date:                 startDateEl.value,
  };

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const result = await CFR.submitForm('/api/duty-hours', payload);
    if (result.queued) {
      document.getElementById('queued-msg').classList.remove('hidden');
    } else {
      document.getElementById('success-msg').classList.remove('hidden');
    }
    window.scrollTo(0, 0);

    // Reset form
    startDateEl.value = CFR.todayISO();
    endDateEl.value   = CFR.todayISO();
    startTimeEl.value = CFR.nowTime();
    endTimeEl.value   = CFR.nowTime();
    attendedEl.value  = '0';
    allocatedEl.value = '0';
    updateDuration();
  } catch (e) {
    CFR.toast(e.message, 'error');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Submit Duty Log';
  }
});
