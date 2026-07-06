/**
 * dataFetcher.js — Módulo unificado de fetching de datos
 *
 * - Mantiene caché del último valor válido para cada fuente
 * - Si un fetch falla, retorna el último dato válido y marca error
 * - Polling automático configurable por fuente
 */

'use strict';

window.TMQ = window.TMQ || {};

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR8HsbsBKbuv6xzJgBG34db5NtBfjPc9Vm9MZvL6vStnI6x9jRQInxrQ8V1SIPmoA/pub?gid=2070743900&single=true&output=csv';

// ── Caché de último valor válido ─────────────────────────────
const cache = {
  naves:       null,
  ventilacion: null,
  inversion:   null,
  cpuerto:     null,
  kpis:        null,
  turnos:      null,
};

// ── Estado de conexión por fuente ────────────────────────────
const connState = {};

// ── Callbacks de actualización ───────────────────────────────
const callbacks = {};

/**
 * Registra un callback para ser llamado cuando una fuente se actualiza.
 * @param {string} key - clave de la fuente
 * @param {Function} fn - función a llamar con los nuevos datos
 */
function onUpdate(key, fn) {
  callbacks[key] = callbacks[key] || [];
  callbacks[key].push(fn);
}

function notificar(key, data) {
  (callbacks[key] || []).forEach(fn => { try { fn(data); } catch(e) { console.error(e); } });
}

/**
 * Actualiza el indicador visual de conexión para una fuente.
 * @param {string} key
 * @param {'ok'|'error'|'loading'} estado
 */
function setConexion(key, estado) {
  connState[key] = estado;
  const dots = document.querySelectorAll(`[data-conn="${key}"]`);
  dots.forEach(el => {
    el.className = `conn-dot ${estado}`;
    el.title = estado === 'ok' ? 'Conexión activa' : estado === 'error' ? 'Error de conexión' : 'Actualizando...';
  });

  // Actualizar el indicador global del header
  const mainDot = document.getElementById('main-live-dot');
  if (mainDot) {
    const hayError = Object.values(connState).some(s => s === 'error');
    mainDot.className = `live-dot ${hayError ? 'warn' : ''}`;
  }

  // Actualizar timestamp de última actualización si es OK
  if (estado === 'ok') {
    const el = document.getElementById('last-update');
    if (el) {
      const ahora = new Date();
      el.textContent = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
    }
  }
}

/**
 * Carga un archivo .js local insertando un tag <script>.
 * Esto evita el bloqueo CORS de file:/// en navegadores.
 * El archivo .js debe definir window.DATA_CLAVE = {...}
 * @param {string} key - identificador de la fuente
 * @param {string} url - URL del archivo .js
 * @returns {Promise<any>}
 */
function fetchJS(key, url) {
  setConexion(key, 'loading');
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = url + '?t=' + new Date().getTime(); // cache buster
    
    script.onload = () => {
      const data = window['DATA_' + key.toUpperCase()];
      if (data) {
        cache[key] = data;
        setConexion(key, 'ok');
        notificar(key, data);
        resolve(data);
      } else {
        script.onerror();
      }
      script.remove();
    };

    script.onerror = () => {
      console.warn(`[dataFetcher] Error al cargar ${key} desde ${url}`);
      setConexion(key, 'error');
      
      const fallback = cache[key] !== null ? cache[key] : (key === 'kpis' ? [] : null);
      notificar(key, fallback);
      resolve(fallback);
      script.remove();
    };

    document.head.appendChild(script);
  });
}

/**
 * Carga de naves inteligente:
 * - En Vercel / Web (http/https): Obtiene los datos en vivo desde Google Drive.
 * - En Local (file:///): Lee naves.js actualizado por el .bat para evitar el bloqueo del navegador.
 * @returns {Promise<Array>}
 */
async function fetchNaves() {
  try {
    let csvData = "";
    
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      // Estamos en la web (ej. Vercel), podemos leer en vivo sin problemas de CORS local
      setConexion('naves', 'loading');
      const res = await fetch(CSV_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      csvData = await res.text();
    } else {
      // Estamos local, leemos el archivo generado por ACTUALIZAR_NAVES.bat
      csvData = await fetchJS('naves', dataURL('naves.js'));
      if (!csvData) throw new Error("No hay datos en naves.js");
    }
    
    const datos = window.TMQ.csvParser.parsearCSV(csvData);
    cache.naves = datos;
    setConexion('naves', 'ok');
    notificar('naves', datos);

    // Exponer en window para debugging
    window._debug_naves = datos;

    return datos;
  } catch (err) {
    console.warn('[dataFetcher] Error al cargar naves:', err.message);
    setConexion('naves', 'error');
    
    // Fallback de muestra para que no quede vacía al principio
    if (cache.naves === null) {
      const fHoy = window.TMQ.csvParser.formatearFecha(new Date());
      const origen = window.location.protocol.startsWith('http') ? 'Google Drive' : 'Descarga Naves.bat';
      const mockNaves = [
        { fecha: fHoy, fechaDate: new Date(), horario: 'AM', lpg: origen, multicrudo: '', monoboya: '', barcaza: '', oxiquim: '' }
      ];
      notificar('naves', mockNaves);
      return mockNaves;
    }

    const fallback = cache.naves !== null ? cache.naves : [];
    notificar('naves', fallback);
    return fallback;
  }
}

/**
 * Construye la URL relativa a /data/ según entorno.
 * - Si corre en localhost/file: usa ruta relativa ./data/
 * - Si corre en GitHub Pages / Vercel: misma lógica funciona
 * @param {string} archivo
 * @returns {string}
 */
function dataURL(archivo) {
  return `./data/${archivo}`;
}

/**
 * Carga inicial de todas las fuentes de datos.
 */
async function cargarTodo() {
  await Promise.allSettled([
    fetchNaves(),
    fetchJS('ventilacion', dataURL('ventilacion.js')),
    fetchJS('inversion',   dataURL('inversion.js')),
    fetchJS('cpuerto',     dataURL('cpuerto.js')),
    fetchJS('kpis',        dataURL('kpis.js')),
    fetchJS('turnos',      dataURL('turnos.js')),
  ]);
}

/**
 * Inicia el polling automático.
 * - Naves: cada 5 minutos
 * - JSONs: cada 5 minutos (ventilacion e inversion se actualizan cada 30 min en Actions)
 */
function iniciarPolling() {
  const CINCO_MIN = 5 * 60 * 1000;

  setInterval(fetchNaves, CINCO_MIN);
  setInterval(() => fetchJS('ventilacion', dataURL('ventilacion.js')), CINCO_MIN);
  setInterval(() => fetchJS('inversion',   dataURL('inversion.js')),   CINCO_MIN);
  setInterval(() => fetchJS('cpuerto',     dataURL('cpuerto.js')),     CINCO_MIN);
  setInterval(() => fetchJS('kpis',        dataURL('kpis.js')),        CINCO_MIN);
  setInterval(() => fetchJS('turnos',      dataURL('turnos.js')),      CINCO_MIN);
}

// ── API pública ──────────────────────────────────────────────
window.TMQ.dataFetcher = {
  cargarTodo,
  iniciarPolling,
  onUpdate,
  getCache: key => cache[key],
};
