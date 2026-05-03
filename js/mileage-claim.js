CFR.requireAuth();

document.getElementById('claim-date').value  = CFR.todayISO();
document.getElementById('callout-time').value = CFR.nowTime();

document.getElementById('submit-btn').addEventListener('click', async () => {
  const date     = document.getElementById('claim-date').value;
  const time     = document.getElementById('callout-time').value;
  const category = document.getElementById('call-category').value;
  const age      = document.getElementById('patient-age').value;
  const type     = document.getElementById('incident-type').value;
  const journey  = document.getElementById('journey-details').value.trim();
  const miles    = parseFloat(document.getElementById('total-miles').value);

  if (!date)     { CFR.toast('Please enter a date.', 'warning');              return; }
  if (!time)     { CFR.toast('Please enter the call-out time.', 'warning');   return; }
  if (!category) { CFR.toast('Please select a call category.', 'warning');    return; }
  if (!age)      { CFR.toast('Please select patient age.', 'warning');        return; }
  if (!type)     { CFR.toast('Please select an incident type.', 'warning');   return; }
  if (!journey)  { CFR.toast('Please enter journey details.', 'warning');     return; }
  if (!miles || miles < 0) { CFR.toast('Please enter total miles.', 'warning'); return; }

  const user    = CFR.getUser();
  const payload = {
    responder_id:   user.id,
    responder_name: user.name,
    callsign:       user.callsign || '',
    date,
    callout_time:   time,
    job_number:     document.getElementById('job-number').value.trim(),
    call_category:  category,
    patient_age:    age,
    incident_type:  type,
    journey_details: journey,
    total_miles:    miles,
    comments:       document.getElementById('claim-comments').value.trim(),
  };

  const btn    = document.getElementById('submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Submitting…';

  try {
    const result = await CFR.submitForm('/api/mileage-claim', payload);
    if (result.queued) {
      document.getElementById('queued-msg').classList.remove('hidden');
    } else {
      document.getElementById('success-msg').classList.remove('hidden');
    }
    window.scrollTo(0, 0);

    // Reset
    document.getElementById('claim-date').value    = CFR.todayISO();
    document.getElementById('callout-time').value  = CFR.nowTime();
    document.getElementById('job-number').value    = '';
    document.getElementById('call-category').value = '';
    document.getElementById('patient-age').value   = '';
    document.getElementById('incident-type').value = '';
    document.getElementById('journey-details').value = '';
    document.getElementById('total-miles').value   = '';
    document.getElementById('claim-comments').value = '';
  } catch (e) {
    CFR.toast(e.message, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Submit Claim';
  }
});
