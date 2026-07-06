/**
 * tabla.js — Tabla de naves con filtros de fecha, terminal y turno
 *
 * Filtros:
 *   - Fecha: Hoy | +1d | 7d | 14d | 1m | 2m | Todo
 *   - Terminal: Todas | LPG | Multicrudo | Monoboya | Barcaza | Oxiquim
 *   - Turno: Todos | AM | PM
 *
 * La fila del turno actual (hoy + AM antes de mediodía / PM después) se resalta.
 */

'use strict';

window.TMQ = window.TMQ || {};

(function () {

  // ── Estado del módulo ──────────────────────────────────────
  let todosLosDatos   = [];
  let filtroFecha     = 7;     // días adelante (null = todo)
  let filtroTerminal  = 'todas';
  let filtroTurno     = 'todos';

  const TERMINALES_COLS = [
    { key: 'lpg',        label: 'LPG',        display: 'LPG' },
    { key: 'multicrudo', label: 'Multicrudo', display: 'MULTICRUDO' },
    { key: 'monoboya',   label: 'Monoboya',   display: 'MONOBOYA' },
    { key: 'barcaza',    label: 'Barcaza',     display: 'BARCAZA' },
    { key: 'oxiquim',    label: 'Oxiquim',     display: 'OXIQUIM' },
  ];

  const FILTROS_FECHA = [
    { label: 'Hoy',     valor: 0 },
    { label: '+1 día',  valor: 1 },
    { label: '7 días',  valor: 7 },
    { label: '14 días', valor: 14 },
    { label: '1 mes',   valor: 30 },
    { label: '2 meses', valor: 60 },
    { label: 'Todo',    valor: null },
  ];

  // ── Helpers de fecha ───────────────────────────────────────
  function hoyMidnight() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function turnoActual() {
    return new Date().getHours() < 12 ? 'AM' : 'PM';
  }

  function esFilaActual(fila) {
    if (!fila.fechaDate) return false;
    const hoy = hoyMidnight();
    const fd = new Date(fila.fechaDate);
    fd.setHours(0, 0, 0, 0);
    return fd.getTime() === hoy.getTime() && fila.horario === turnoActual();
  }

  // ── Filtrado ───────────────────────────────────────────────
  function filtrar(datos) {
    const hoy = hoyMidnight();

    return datos.filter(fila => {
      // Filtro de fecha
      if (filtroFecha !== null) {
        if (!fila.fechaDate) return false;
        const fd = new Date(fila.fechaDate);
        fd.setHours(0, 0, 0, 0);
        const limite = new Date(hoy);
        limite.setDate(hoy.getDate() + filtroFecha);
        if (fd < hoy || fd > limite) return false;
      }

      // Filtro de turno
      if (filtroTurno !== 'todos' && fila.horario !== filtroTurno) return false;

      return true;
    });
  }

  // ── Renderizado de celda ───────────────────────────────────
  function renderCelda(valor) {
    const info = window.TMQ.csvParser.clasificarCelda(valor);
    const td = document.createElement('td');

    if (info.tipo === 'vacia') {
      const span = document.createElement('span');
      span.className = 'celda-nave nave-vacia';
      span.textContent = '—';
      td.appendChild(span);
    } else {
      const span = document.createElement('span');
      span.className = `celda-nave ${info.css}`;
      span.innerHTML = `<span>${info.icono}</span><span>${escHTML(info.label)}</span>`;
      td.appendChild(span);
    }

    return td;
  }

  function escHTML(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Render de la tabla ─────────────────────────────────────
  function renderTabla() {
    const tbody = document.getElementById('tabla-naves-body');
    const vacioEl = document.getElementById('tabla-vacia');
    if (!tbody) return;

    const datos = filtrar(todosLosDatos);

    // Actualizar contador
    const counter = document.getElementById('tabla-counter');
    if (counter) counter.textContent = `${datos.length} registros`;

    if (datos.length === 0) {
      tbody.innerHTML = '';
      if (vacioEl) vacioEl.classList.remove('hidden');
      return;
    }

    if (vacioEl) vacioEl.classList.add('hidden');

    // Construir filas
    const fragment = document.createDocumentFragment();

    datos.forEach(fila => {
      const tr = document.createElement('tr');
      if (esFilaActual(fila)) tr.classList.add('fila-actual');

      // Celda FECHA
      const tdFecha = document.createElement('td');
      tdFecha.className = 'td-fecha';
      tdFecha.textContent = fila.fecha;
      tr.appendChild(tdFecha);

      // Celda TURNO
      const tdTurno = document.createElement('td');
      tdTurno.className = 'td-turno';
      const badge = document.createElement('span');
      const esActual = esFilaActual(fila);
      badge.className = `badge-turno ${fila.horario.toLowerCase()}${esActual ? ' actual' : ''}`;
      badge.textContent = fila.horario;
      tdTurno.appendChild(badge);
      tr.appendChild(tdTurno);

      // Celdas de terminales
      TERMINALES_COLS.forEach(col => {
        // Si hay filtro de terminal activo y no es esta columna, skip pero añadir celda oculta
        const visible = filtroTerminal === 'todas' || filtroTerminal === col.key;
        const tdCol = renderCelda(fila[col.key]);
        if (!visible) tdCol.classList.add('hidden');
        tr.appendChild(tdCol);
      });

      fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);

    // Scroll al turno actual
    const filaActual = tbody.querySelector('.fila-actual');
    if (filaActual) {
      setTimeout(() => filaActual.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
  }

  // ── Actualizar visibilidad de columnas ────────────────────
  function actualizarColumnas() {
    const ths = document.querySelectorAll('.th-terminal');
    const tds = document.querySelectorAll('.td-terminal');

    ths.forEach(th => {
      const col = th.dataset.col;
      th.classList.toggle('hidden', filtroTerminal !== 'todas' && filtroTerminal !== col);
    });

    // También en tbody — re-renderizar es más seguro
    renderTabla();
  }

  // ── Inicializar filtros ────────────────────────────────────
  function initFiltros() {
    // Filtros de fecha
    const wrapFecha = document.getElementById('filtros-fecha');
    if (wrapFecha) {
      FILTROS_FECHA.forEach(f => {
        const btn = document.createElement('button');
        btn.className = `pill${f.valor === filtroFecha ? ' active' : ''}`;
        btn.textContent = f.label;
        btn.dataset.valor = f.valor === null ? 'null' : f.valor;
        btn.addEventListener('click', () => {
          filtroFecha = f.valor;
          wrapFecha.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderTabla();
        });
        wrapFecha.appendChild(btn);
      });
    }

    // Filtros de terminal
    const wrapTerminal = document.getElementById('filtros-terminal');
    if (wrapTerminal) {
      const opciones = [{ key: 'todas', label: 'Todas' }, ...TERMINALES_COLS];
      opciones.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = `pill${opt.key === 'todas' ? ' active' : ''}`;
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
          filtroTerminal = opt.key;
          wrapTerminal.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          actualizarColumnas();
        });
        wrapTerminal.appendChild(btn);
      });
    }

    // Filtros de turno
    const wrapTurno = document.getElementById('filtros-turno');
    if (wrapTurno) {
      [{ key: 'todos', label: 'Todos' }, { key: 'AM', label: 'AM ☀️' }, { key: 'PM', label: 'PM 🌙' }].forEach(opt => {
        const btn = document.createElement('button');
        btn.className = `pill${opt.key === 'todos' ? ' active' : ''}`;
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
          filtroTurno = opt.key;
          wrapTurno.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderTabla();
        });
        wrapTurno.appendChild(btn);
      });
    }
  }

  // ── API pública ───────────────────────────────────────────
  window.TMQ.tabla = {
    init() {
      initFiltros();
      // Escuchar actualizaciones de datos
      window.TMQ.dataFetcher.onUpdate('naves', datos => {
        todosLosDatos = datos || [];
        renderTabla();
      });
    },
    actualizar(datos) {
      todosLosDatos = datos || [];
      renderTabla();
    }
  };

})();
