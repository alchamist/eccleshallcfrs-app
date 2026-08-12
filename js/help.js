document.addEventListener('DOMContentLoaded', () => {
  if (!CFR.requireAuth()) return;
  CFR.fetchVehicleConfig();

  if (!CFR.hasFeature('fire_safety')) {
    document.getElementById('help-fire-safety')?.remove();
  }
  if (!CFR.hasFeature('training')) {
    document.getElementById('help-training')?.remove();
  }

  // Accordion toggle
  document.querySelectorAll('.help-section-header').forEach(header => {
    header.addEventListener('click', () => {
      const section = header.closest('.help-section');
      const body    = section.querySelector('.help-section-body');
      const isOpen  = section.classList.toggle('open');
      body.style.display = isOpen ? 'block' : 'none';
    });
  });
});
