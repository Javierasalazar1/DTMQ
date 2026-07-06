/**
 * csvParser.js — Parser del CSV de planilla de naves TMQ
 *
 * Estrategia:
 *  - Fila 0 (row[0]): nombres de terminales → detección dinámica de columnas
 *  - Filas 1-3: sub-cabeceras (ignoradas)
 *  - Fila 4+: datos reales de operaciones
 *
 * Formato de fecha en CSV: "D-mes" ej: "1-oct", "26-ago"
 */

'use strict';

// ── Terminales que nos interesan ────────────────────────────
const TERMINALES = ['LPG', 'MULTICRUDO', 'MONOBOYA', 'BARCAZA', 'OXIQUIM'];

// ── Mapa de meses en español ────────────────────────────────
const MES_MAP = {
  'ene': 0, 'feb': 1, 'mar': 2,  'abr': 3,
  'may': 4, 'jun': 5, 'jul': 6,  'ago': 7,
  'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
};

// ── Estados especiales (en mayúsculas para comparación) ─────
const ESTADOS = {
  'MANTENCIÓN':       { css: 'estado-mantencion',    icono: '🔧', label: 'Mantención' },
  'MANTENCION':       { css: 'estado-mantencion',    icono: '🔧', label: 'Mantención' },
  'CORTE DE ENERGÍA': { css: 'estado-corte',         icono: '⚡', label: 'Corte de Energía' },
  'CORTE DE ENERGIA': { css: 'estado-corte',         icono: '⚡', label: 'Corte de Energía' },
  '*PROB. MAL TIEMPO':{ css: 'estado-prob-tiempo',   icono: '⚠️', label: 'Prob. Mal Tiempo' },
  'MAL TIEMPO':       { css: 'estado-mal-tiempo',    icono: '⛈️', label: 'Mal Tiempo' },
  'MAREJADAS':        { css: 'estado-marejadas',     icono: '🌊', label: 'Marejadas' },
  'VIENTO F/P':       { css: 'estado-viento',        icono: '💨', label: 'Viento F/P' },
  'INSPECCIÓN':       { css: 'estado-inspeccion',    icono: '🔍', label: 'Inspección' },
  'INSPECCION':       { css: 'estado-inspeccion',    icono: '🔍', label: 'Inspección' },
  'FUERZA MAYOR':     { css: 'estado-fuerza-mayor',  icono: '⚡', label: 'Fuerza Mayor' },
  'NO DISPONIBLE':    { css: 'estado-no-disponible', icono: '⛔', label: 'No Disponible' },
};

/**
 * Parsea una línea CSV respetando campos entre comillas.
 * @param {string} line
 * @returns {string[]}
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Detecta los índices de columna de cada terminal buscando
 * su nombre exacto en la fila de cabecera de terminales (row[0]).
 * @param {string[]} headerRow - Primera fila del CSV
 * @returns {Object} - { LPG: N, MULTICRUDO: N, ... }
 */
function detectarIndices(headerRow) {
  const indices = {};
  TERMINALES.forEach(terminal => {
    const idx = headerRow.findIndex(col =>
      col.trim().toUpperCase() === terminal.toUpperCase()
    );
    indices[terminal] = idx >= 0 ? idx : -1;
  });
  return indices;
}

/**
 * Convierte "D-mes" → objeto Date.
 * Infiere el año por proximidad (dentro de ±6 meses desde hoy).
 * @param {string} fechaStr  ej: "6-jul", "1-oct"
 * @returns {Date|null}
 */
function parsearFecha(fechaStr) {
  if (!fechaStr || !fechaStr.includes('-')) return null;
  const partes = fechaStr.toLowerCase().split('-');
  if (partes.length < 2) return null;

  const dia = parseInt(partes[0], 10);
  const mesStr = partes[1];
  const mes = MES_MAP[mesStr];

  if (isNaN(dia) || mes === undefined) return null;

  const hoy = new Date();
  let anio = hoy.getFullYear();
  let candidata = new Date(anio, mes, dia);

  const diffDias = (candidata - hoy) / 86400000;

  // Si está más de 180 días en el pasado → probablemente año siguiente
  if (diffDias < -180) {
    anio++;
    candidata = new Date(anio, mes, dia);
  }
  // Si está más de 180 días en el futuro → probablemente año anterior
  else if (diffDias > 180) {
    anio--;
    candidata = new Date(anio, mes, dia);
  }

  return candidata;
}

/**
 * Formatea una Date a "D-mes" en español.
 * @param {Date} date
 * @returns {string}
 */
function formatearFecha(date) {
  if (!date) return '';
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${date.getDate()}-${meses[date.getMonth()]}`;
}

/**
 * Clasifica el contenido de una celda de terminal.
 * @param {string} valor
 * @returns {{ tipo: 'vacia'|'estado'|'nave', css: string, icono: string, label: string }}
 */
function clasificarCelda(valor) {
  if (!valor || valor === '') {
    return { tipo: 'vacia', css: 'nave-vacia', icono: '', label: '' };
  }

  const KEY = valor.trim().toUpperCase();
  const estado = ESTADOS[KEY];

  if (estado) {
    return { tipo: 'estado', css: estado.css, icono: estado.icono, label: estado.label };
  }

  return { tipo: 'nave', css: 'nave-operando', icono: '⚓', label: valor.trim() };
}

/**
 * Parsea el texto CSV completo y retorna un array de filas de operación.
 * @param {string} csvText
 * @returns {Array<{fecha: string, fechaDate: Date|null, horario: string, lpg: string, multicrudo: string, monoboya: string, barcaza: string, oxiquim: string}>}
 */
function parsearCSV(csvText) {
  // Dividir en líneas preservando CRLF y LF
  const lineas = csvText.split(/\r?\n/);
  const filas = lineas.map(parseCSVLine);

  if (filas.length < 5) {
    console.warn('[csvParser] CSV demasiado corto — menos de 5 filas');
    return [];
  }

  // Detectar índices de columnas usando la fila 0 (terminales)
  const indices = detectarIndices(filas[0]);

  const terminalesNoEncontradas = TERMINALES.filter(t => indices[t] === -1);
  if (terminalesNoEncontradas.length > 0) {
    console.warn('[csvParser] Terminales no encontradas en cabecera:', terminalesNoEncontradas);
  }

  // Procesar filas de datos (desde la fila 4, índice 4)
  const resultado = [];

  for (let i = 4; i < filas.length; i++) {
    const f = filas[i];
    if (!f || !f[0] || !f[0].trim()) continue; // ignorar vacías

    const fecha = f[0]?.trim() || '';
    const horario = f[1]?.trim().toUpperCase() || '';

    // Solo procesar filas con fecha válida y turno AM/PM
    if (!fecha || (horario !== 'AM' && horario !== 'PM')) continue;

    resultado.push({
      fecha:      fecha,
      fechaDate:  parsearFecha(fecha),
      horario:    horario,
      lpg:        indices.LPG       >= 0 ? (f[indices.LPG]?.trim()       || '') : '',
      multicrudo: indices.MULTICRUDO >= 0 ? (f[indices.MULTICRUDO]?.trim() || '') : '',
      monoboya:   indices.MONOBOYA  >= 0 ? (f[indices.MONOBOYA]?.trim()  || '') : '',
      barcaza:    indices.BARCAZA   >= 0 ? (f[indices.BARCAZA]?.trim()   || '') : '',
      oxiquim:    indices.OXIQUIM   >= 0 ? (f[indices.OXIQUIM]?.trim()   || '') : '',
    });
  }

  return resultado;
}

// ── Exportar como módulo global ──────────────────────────────
window.TMQ = window.TMQ || {};
window.TMQ.csvParser = { parsearCSV, parsearFecha, clasificarCelda, formatearFecha, TERMINALES };
