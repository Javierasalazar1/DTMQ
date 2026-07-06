/**
 * kpis.js — Cards de KPIs con animación de contador y barra de progreso
 *
 * Lee kpis.json (array de largo variable).
 * Cada card: ícono + número animado (0→valor) + nombre + periodo + barra de progreso.
 * Auto-rotación cada 7 segundos (no rota si solo hay 1 KPI).
 */

'use strict';

window.TMQ = window.TMQ || {};

(function () {

  const INTERVALO_MS = 7000;

  let kpisData    = [];
  let panelActual = 0;
  let intervalId  = null;
  let animFrames  = [];

  // ── Asignación de ícono por palabras clave ──────────────────
  function iconoPorNombre(nombre) {
    const n = (nombre || '').toLowerCase();
    if (n.includes('volum') || n.includes('volúm') || n.includes('barril')) return '🛢️';
    if (n.includes('faen') || n.includes('operac') || n.includes('engran')) return '⚙️';
    if (n.includes('cumpli')) return '📊';
    if (n.includes('tiempo')) return '⏱️';
    if (n.includes('segur')) return '🛡️';
    if (n.includes('efici')) return '⚡';
    return '📈'; // ícono neutro por defecto
  }

  // ── Animación de contador ───────────────────────────────────
  function animarContador(el, valorFinal, duracionMs) {
    const inicio = performance.now();
    let raf;

    function tick(ahora) {
      const progreso = Math.min((ahora - inicio) / duracionMs, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progreso, 3);
      const val = Math.round(ease * valorFinal);
      el.textContent = val + '%';
      if (progreso < 1) {
        raf = requestAnimationFrame(tick);
        animFrames.push(raf);
      } else {
        el.textContent = valorFinal + '%';
      }
    }

    raf = requestAnimationFrame(tick);
    animFrames.push(raf);
  }

  // ── Cancelar animaciones pendientes ────────────────────────
  function cancelarAnimaciones() {
    animFrames.forEach(id => cancelAnimationFrame(id));
    animFrames = [];
  }

  // ── Render de un panel ──────────────────────────────────────
  function renderPanel(el, kpi, activar) {
    if (!kpi) return;

    const icono = iconoPorNombre(kpi.nombre);
    const valor = Math.max(0, Math.min(100, Number(kpi.valor) || 0));

    el.innerHTML = `
      <div class="kpi-top">
        <div class="kpi-icon">${icono}</div>
        <div class="kpi-value-wrap">
          <div class="kpi-value" id="kpi-val-${panelActual}">0%</div>
          <div class="kpi-nombre">${escHTML(kpi.nombre)}</div>
          <div class="kpi-periodo">${escHTML(kpi.periodo || '')}</div>
        </div>
      </div>
      <div class="kpi-progress-track">
        <div class="kpi-progress-bar" id="kpi-bar-${panelActual}" style="width:0%"></div>
      </div>
    `;

    if (activar) {
      // Animar contador y barra con pequeño delay para que la transición de opacidad sea visible
      setTimeout(() => {
        cancelarAnimaciones();
        const valEl = document.getElementById(`kpi-val-${panelActual}`);
        const barEl = document.getElementById(`kpi-bar-${panelActual}`);
        if (valEl) animarContador(valEl, valor, 1200);
        if (barEl) {
          requestAnimationFrame(() => {
            barEl.style.width = valor + '%';
          });
        }
      }, 100);
    }
  }

  // ── Mostrar panel N ─────────────────────────────────────────
  function mostrarPanel(idx) {
    if (!kpisData.length) return;
    const total = kpisData.length;
    panelActual = ((idx % total) + total) % total;

    // Obtener o crear el elemento del panel
    const carousel = document.getElementById('kpi-carousel');
    if (!carousel) return;

    // Ocultar todos
    carousel.querySelectorAll('.kpi-panel').forEach(p => p.classList.remove('active'));

    let panel = document.getElementById(`kpi-panel-${panelActual}`);
    if (panel) {
      panel.classList.add('active');
      renderPanel(panel, kpisData[panelActual], true);
    }

    // Actualizar dots
    document.querySelectorAll('#kpi-dots .carousel-dot').forEach((d, i) => {
      d.classList.toggle('active', i === panelActual);
    });
  }

  // ── Reconstruir todos los paneles cuando llegan nuevos datos
  function reconstruirPaneles() {
    const carousel = document.getElementById('kpi-carousel');
    const dotsEl   = document.getElementById('kpi-dots');
    if (!carousel || !dotsEl) return;

    carousel.innerHTML = '';
    dotsEl.innerHTML   = '';

    kpisData.forEach((kpi, i) => {
      // Panel
      const panel = document.createElement('div');
      panel.className = 'kpi-panel';
      panel.id = `kpi-panel-${i}`;
      carousel.appendChild(panel);

      // Dot (solo si hay más de 1 KPI)
      if (kpisData.length > 1) {
        const dot = document.createElement('span');
        dot.className = `carousel-dot${i === 0 ? ' active' : ''}`;
        dot.addEventListener('click', () => {
          mostrarPanel(i);
          iniciarRotacion();
        });
        dotsEl.appendChild(dot);
      }
    });

    mostrarPanel(0);
  }

  // ── Rotación automática ─────────────────────────────────────
  function iniciarRotacion() {
    if (intervalId) clearInterval(intervalId);
    if (kpisData.length <= 1) return; // no rotar si hay 1 solo
    intervalId = setInterval(() => mostrarPanel(panelActual + 1), INTERVALO_MS);
  }

  function escHTML(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init ────────────────────────────────────────────────────
  window.TMQ.kpis = {
    init() {
      window.TMQ.dataFetcher.onUpdate('kpis', datos => {
        if (!Array.isArray(datos) || datos.length === 0) return;
        kpisData = datos;
        cancelarAnimaciones();
        reconstruirPaneles();
        iniciarRotacion();
      });
    }
  };

})();
