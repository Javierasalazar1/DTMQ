/**
 * main.js — Coordinador principal del Dashboard TMQ
 *
 * Responsabilidades:
 *  - Reloj digital (HH:MM:SS, actualizado cada segundo)
 *  - Fecha en español
 *  - Turno literal desde turnos.json
 *  - Inicialización de todos los módulos
 *  - Tabs de navegación mobile
 */

'use strict';

// ── Reloj y fecha ────────────────────────────────────────────
(function initReloj() {
  const MESES = [
    'enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre'
  ];
  const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

  function pad(n) { return String(n).padStart(2, '0'); }

  function actualizarReloj() {
    const ahora = new Date();

    // Reloj HH:MM:SS
    const elTime = document.getElementById('clock-time');
    if (elTime) {
      elTime.textContent = `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
    }

    // Fecha completa en español
    const elDate = document.getElementById('clock-date');
    if (elDate) {
      const diaSem = DIAS[ahora.getDay()];
      const diaMes = ahora.getDate();
      const mes    = MESES[ahora.getMonth()];
      const anio   = ahora.getFullYear();
      elDate.textContent = `${diaSem}, ${diaMes} de ${mes} de ${anio}`;
    }
  }

  actualizarReloj();
  setInterval(actualizarReloj, 1000);
})();

// ── Turno (turnos.json: significado A/B/C/D pendiente de confirmación con cliente TMQ)
// Por ahora se muestra tal cual, sin lógica adicional.
(function initTurnos() {
  window.TMQ.dataFetcher.onUpdate('turnos', d => {
    const el = document.getElementById('turnos-badge');
    if (!el) return;
    if (!d) { el.textContent = '—'; return; }
    el.textContent = `Día: ${d.dia || '—'}  ·  Noche: ${d.noche || '—'}`;
  });
})();

// ── Mobile tabs ──────────────────────────────────────────────
(function initMobileTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const sections = document.querySelectorAll('.tab-section');

  function activarTab(id) {
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    sections.forEach(s => s.classList.toggle('active', s.id === `section-${id}`));
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => activarTab(btn.dataset.tab));
  });

  // Activar tab inicial
  if (tabBtns.length > 0) activarTab(tabBtns[0].dataset.tab);
})();

// ── Inicialización principal ─────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[TMQ Dashboard] Iniciando...');

  // 1. Cargar todos los datos
  await window.TMQ.dataFetcher.cargarTodo();

  // 2. Inicializar módulos de UI
  window.TMQ.tabla.init();
  window.TMQ.condiciones.init();
  window.TMQ.kpis.init();

  // 3. Iniciar polling continuo
  window.TMQ.dataFetcher.iniciarPolling();

  console.log('[TMQ Dashboard] Listo ✓');
});
