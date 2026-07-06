/**
 * condiciones.js — Panel rotativo de condiciones del puerto
 *
 * Tres vistas que rotan automáticamente cada 8 segundos:
 *  1. Inversión Térmica (inversion.json)
 *  2. Ventilación Atmosférica (ventilacion.json)
 *  3. Condición de Puerto / Capitanía (cpuerto.json)
 *
 * Dots de navegación + pausa en hover (solo en PC).
 * Si una fuente no carga, se salta esa vista.
 */

'use strict';

window.TMQ = window.TMQ || {};

(function () {

  const INTERVALO_MS = 8000;

  let panelActual    = 0;
  let intervalId     = null;
  let pausado        = false;

  // Datos actuales
  const datos = {
    inversion:   null,
    ventilacion: null,
    cpuerto:     null,
  };

  // ── Helpers de color ────────────────────────────────────────
  function clsVentilacion(codigo) {
    return { B: 'cond-verde', R: 'cond-amarillo', M: 'cond-rojo' }[codigo] || 'cond-cyan';
  }

  function chipHTML(label, si) {
    const cls = si ? 'si' : 'no';
    const ico = si ? '✓' : '✗';
    return `<span class="chip ${cls}">${ico} ${label}</span>`;
  }

  function siNo(val) { return (val || '').toUpperCase() === 'SI'; }

  // ── Render de cada panel ────────────────────────────────────
  function renderInversion(el, d) {
    if (!d) { el.innerHTML = '<p class="tabla-empty">Sin datos de inversión térmica</p>'; return; }

    const cls   = d.inversion ? 'cond-rojo' : 'cond-verde';
    const icono = d.inversion ? '🌡️' : '✅';

    el.innerHTML = `
      <div class="cond-sub-title">${icono} Inversión Térmica</div>
      <div class="cond-estado-label ${cls}">${escHTML(d.estado || '—')}</div>
      <div class="cond-meta">
        <div class="cond-meta-item">
          <span class="cond-meta-label">Delta T (°C)</span>
          <span class="cond-meta-value">${d.delta !== undefined ? d.delta : '—'}</span>
        </div>
        <div class="cond-meta-item">
          <span class="cond-meta-label">Hora medición</span>
          <span class="cond-meta-value">${escHTML(d.hora || '—')}</span>
        </div>
        <div class="cond-meta-item">
          <span class="cond-meta-label">Fecha</span>
          <span class="cond-meta-value">${escHTML(d.fecha || '—')}</span>
        </div>
      </div>
    `;
  }

  function renderVentilacion(el, d) {
    if (!d) { el.innerHTML = '<p class="tabla-empty">Sin datos de ventilación</p>'; return; }

    const cls = clsVentilacion(d.codigo);
    const semaforo = { B: '🟢', R: '🟡', M: '🔴' }[d.codigo] || '⚪';

    el.innerHTML = `
      <div class="cond-sub-title">${semaforo} Ventilación Atmosférica</div>
      <div class="cond-estado-label ${cls}">${escHTML(d.estado || '—')}</div>
      <div class="cond-meta">
        <div class="cond-meta-item">
          <span class="cond-meta-label">Código</span>
          <span class="cond-meta-value">${escHTML(d.codigo || '—')}</span>
        </div>
        <div class="cond-meta-item">
          <span class="cond-meta-label">Hora pronóstico</span>
          <span class="cond-meta-value">${escHTML(d.hora_actual || '—')}</span>
        </div>
        <div class="cond-meta-item">
          <span class="cond-meta-label">Actualizado</span>
          <span class="cond-meta-value">${escHTML(d.actualizado || '—')}</span>
        </div>
      </div>
    `;
  }

  function renderPuerto(el, d) {
    if (!d) { el.innerHTML = '<p class="tabla-empty">Sin datos de Capitanía de Puerto</p>'; return; }

    const HABILITACIONES = [
      { key: 'lpg_amarre',         label: 'LPG Amarre' },
      { key: 'lpg_desamarre',      label: 'LPG Desamarre' },
      { key: 'monoboya_amarre',    label: 'MB Amarre' },
      { key: 'monoboya_desamarre', label: 'MB Desamarre' },
      { key: 'practicos',          label: 'Prácticos' },
      { key: 'fondeo',             label: 'Fondeo' },
      { key: 'buceo',              label: 'Buceo' },
    ];

    const chipsHTML = HABILITACIONES
      .map(h => chipHTML(h.label, siNo(d[h.key])))
      .join('');

    el.innerHTML = `
      <div class="cond-sub-title">⚓ Condición de Puerto — Parte N° ${escHTML(d.numero || '—')}</div>
      <div class="cond-estado-label cond-cyan" style="font-size:clamp(14px,1.6vw,20px)">${escHTML(d.condicion || '—')}</div>
      <div class="chips-grid">${chipsHTML}</div>
      <div class="cond-meta">
        <div class="cond-meta-item">
          <span class="cond-meta-label">Emitida</span>
          <span class="cond-meta-value">${escHTML(d.emitida || '—')}</span>
        </div>
      </div>
    `;
  }

  // ── Paneles definidos ───────────────────────────────────────
  const PANELES = [
    { id: 'panel-inversion',   dataKey: 'inversion',   render: renderInversion },
    { id: 'panel-ventilacion', dataKey: 'ventilacion', render: renderVentilacion },
    { id: 'panel-cpuerto',     dataKey: 'cpuerto',     render: renderPuerto },
  ];

  // ── Mostrar panel N ─────────────────────────────────────────
  function mostrarPanel(idx) {
    const total = PANELES.length;
    panelActual = ((idx % total) + total) % total;

    PANELES.forEach((p, i) => {
      const el = document.getElementById(p.id);
      if (!el) return;
      if (i === panelActual) {
        el.classList.add('active');
        p.render(el, datos[p.dataKey]);
      } else {
        el.classList.remove('active');
      }
    });

    // Actualizar dots
    document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === panelActual);
    });
  }

  function avanzar() {
    if (!pausado) mostrarPanel(panelActual + 1);
  }

  function iniciarRotacion() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(avanzar, INTERVALO_MS);
  }

  // ── Escuchar datos ──────────────────────────────────────────
  function suscribirDatos() {
    ['inversion', 'ventilacion', 'cpuerto'].forEach(key => {
      window.TMQ.dataFetcher.onUpdate(key, d => {
        datos[key] = d;
        // Re-renderizar si este panel está activo
        const p = PANELES.find(p => p.dataKey === key);
        if (p && PANELES.indexOf(p) === panelActual) {
          const el = document.getElementById(p.id);
          if (el) p.render(el, d);
        }
      });
    });
  }

  // ── Dots de navegación ──────────────────────────────────────
  function initDots() {
    const container = document.getElementById('condiciones-dots');
    if (!container) return;

    PANELES.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = `carousel-dot${i === 0 ? ' active' : ''}`;
      dot.setAttribute('role', 'button');
      dot.setAttribute('aria-label', `Panel ${i + 1}`);
      dot.addEventListener('click', () => {
        mostrarPanel(i);
        iniciarRotacion(); // reiniciar timer al hacer click
      });
      container.appendChild(dot);
    });
  }

  // ── Pausa en hover ──────────────────────────────────────────
  function initHoverPausa() {
    const card = document.getElementById('card-condiciones');
    if (!card) return;
    card.addEventListener('mouseenter', () => { pausado = true; });
    card.addEventListener('mouseleave', () => { pausado = false; });
  }

  function escHTML(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init ────────────────────────────────────────────────────
  window.TMQ.condiciones = {
    init() {
      initDots();
      initHoverPausa();
      suscribirDatos();
      mostrarPanel(0);
      iniciarRotacion();
    }
  };

})();
