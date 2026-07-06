# PLAN DE DESARROLLO — Dashboard Operacional TMQ (ENAP)
## Instrucción técnica para IA de desarrollo (prompt de construcción)

---

## 0. CONTEXTO DEL PROYECTO

**Cliente:** División de Operaciones Marítimas — Terminal Marítimo Quintero (TMQ), ENAP.

**Qué se debe construir:** Una pantalla web tipo "Dashboard Operacional" para monitoreo en tiempo real, pensada para ser exhibida simultáneamente en:
- Pantallas de TV en sala de control (formato horizontal grande, sin interacción de mouse/teclado).
- PC/notebook (uso de escritorio, con interacción de filtros).
- Celular (consulta rápida en movilidad, formato vertical).

**Objetivo funcional:** Mostrar de un vistazo el estado de los buques en el terminal, condiciones del puerto, un mapa en vivo y KPIs de rendimiento operacional.

**Formato de entrega esperado:** Una aplicación web (HTML/CSS/JS o React) autocontenida, desplegable en un hosting estático (Vercel, Netlify, GitHub Pages o similar), accesible por URL única desde cualquier dispositivo.

---

## 1. FUENTE DE DATOS

### 1.1 Planilla de naves (fuente real ya identificada)

URL pública (Google Sheets publicado como HTML):
```
https://docs.google.com/spreadsheets/d/e/2PACX-1vR8HsbsBKbuv6xzJgBG34db5NtBfjPc9Vm9MZvL6vStnI6x9jRQInxrQ8V1SIPmoA/pubhtml?gid=2070743900&single=true&widget=false&headers=false
```

**IMPORTANTE:** Para consumir estos datos de forma programática (no scraping de HTML), se debe usar la versión exportable en CSV del mismo Google Sheet, con el mismo `gid`:
```
https://docs.google.com/spreadsheets/d/e/2PACX-1vR8HsbsBKbuv6xzJgBG34db5NtBfjPc9Vm9MZvL6vStnI6x9jRQInxrQ8V1SIPmoA/pub?gid=2070743900&single=true&output=csv
```
> La IA de desarrollo debe generar este link de exportación CSV a partir del ID publicado, y probarlo en tiempo de build. Si Google bloquea CORS desde el navegador, se debe implementar un pequeño proxy/función serverless (ver sección 7.3) que descargue el CSV en el servidor y lo entregue como JSON al frontend.

**Estructura real de columnas detectada (fila de encabezado en la fila 3 de la planilla):**

| Columna | Contenido | Ejemplo |
|---|---|---|
| FECHA | Día y mes (formato "1-jul", "26-ago") | `26-ago` |
| Horario | Turno AM o PM | `AM` |
| LPG | Nombre de nave operando en terminal LPG (o vacío) | `Antofagasta` |
| MULTICRUDO | Nombre de nave operando en terminal Multicrudo | `Pudu` |
| MONOBOYA | Nombre de nave operando en Monoboya | `Cabo Victoria` |
| BARCAZA | Nombre de nave operando en Barcaza | `Mantención` |
| OXIQUIM | Nombre de nave operando en terminal Oxiquim | `Culpeo` |

**Estados especiales que pueden aparecer en cualquier celda de terminal (no son nombres de nave, deben tratarse como estados):**
- `Mantención` → mostrar con color naranja/ámbar, ícono de herramienta.
- `Corte De Energía` → mostrar con color rojo, ícono de alerta, aplica normalmente a todas las terminales el mismo día (evento transversal).
- `*Prob. Mal Tiempo` → mostrar con color amarillo, ícono de clima.
- Celda vacía → terminal sin operación programada ese turno (mostrar "Sin operación" en gris tenue).

**Cada fila representa un turno (AM o PM) de un día, y cada nave en una columna representa una operación programada en esa terminal durante ese turno.** Una misma nave puede aparecer en días/turnos consecutivos (indica que continúa operando).

### 1.2 Frecuencia de actualización
La planilla de Google Sheets se autoactualiza cada 5 minutos (mensaje visible al pie de la publicación). El dashboard debe:
- Refrescar los datos automáticamente cada 5 minutos (polling), sin recargar la página completa.
- Mostrar un indicador visual de "última actualización" (hora) y un punto verde parpadeante mientras hay conexión de datos activa.
- Si el fetch falla, mostrar un indicador de error discreto (punto rojo/gris) sin romper la interfaz, y mantener los últimos datos válidos en pantalla (no dejar la tabla vacía).

### 1.3 Datos automatizados vía GitHub Actions (fuentes reales ya existentes)

**Este proyecto ya tiene una arquitectura de datos parcialmente construida y en producción**, que la IA de desarrollo debe reutilizar y respetar, no reinventar. Existen workflows de GitHub Actions que se ejecutan por cron y hacen scraping/descarga de fuentes oficiales, generando archivos JSON que se commitean automáticamente al repositorio. El dashboard debe consumir esos JSON directamente (no volver a scrapear nada desde el frontend).

**Recomendación de arquitectura:** el dashboard debe vivir en el **mismo repositorio de GitHub** donde corren estos workflows, en una carpeta `/data`, de modo que el frontend pueda leer los JSON con un simple `fetch('./data/archivo.json')` (mismo origen, sin problemas de CORS) si se despliega con GitHub Pages, o vía `fetch('https://raw.githubusercontent.com/usuario/repo/main/data/archivo.json')` si se despliega en Vercel/Netlify apuntando al mismo repo.

#### a) `ventilacion.json` — Condición de ventilación atmosférica (Quintero)
**Automatizado** por `ventilacion.yml`: cron cada 30 min, scrapea `https://airecqp.mma.gob.cl/pronostico-de-ventilacion/` y commitea el resultado.

```json
{
  "hora_actual": "19:00",
  "codigo": "B",
  "estado": "BUENA",
  "actualizado": "04-07-2026 19:35"
}
```
- `codigo`: `B` (Buena), `R` (Regular), `M` (Mala).
- **Mapeo de color:** B → verde, R → amarillo, M → rojo.
- **Nota de nomenclatura:** esto es la *condición de ventilación atmosférica* (dispersión de contaminantes en el aire), no viento náutico/marítimo. El plan original decía "condiciones de viento"; se corrige aquí — mostrar la tarjeta con el nombre real "Ventilación" para no confundir al usuario final.
- `test.yml` es un script de depuración usado para explorar la estructura del HTML de origen; no es parte de la app en producción, solo referencia de cómo se construyó el scraper.

#### b) `inversion.json` — Inversión térmica
**Automatizado** por `inversionT.yml`: cron cada 30 min, descarga `https://pronaire.mma.gob.cl/regiones/graficos/valparaiso/torre_met/Delta_48.csv`, toma el último registro y calcula el estado (umbral `delta < 2` → sin inversión).

```json
{
  "delta": 1.1,
  "estado": "SIN INVERSION",
  "inversion": false,
  "hora": "19:00",
  "fecha": "04-07-26"
}
```
- **Mapeo de color:** `inversion: false` → verde ("SIN INVERSION"), `inversion: true` → rojo/ámbar ("CON INVERSION").
- Mostrar también el valor `delta` como dato de respaldo (más técnico, tamaño de letra menor).

#### c) `cpuerto.json` — Condición de puerto (Capitanía de Puerto)
**Estructura conocida, fuente de scraping aún no automatizada** (no se incluyó workflow para este archivo). Se debe asumir que, por ahora, este archivo se actualiza manualmente o mediante un proceso a definir, y dejar la lógica de consumo ya lista para cuando se automatice.

```json
{
  "numero": "162",
  "condicion": "MAREJADA",
  "emitida": "29/05/2026 13:48",
  "lpg_amarre": "SI",
  "lpg_desamarre": "SI",
  "monoboya_amarre": "SI",
  "monoboya_desamarre": "SI",
  "practicos": "SI",
  "fondeo": "SI",
  "buceo": "SI"
}
```
- `numero`: número de la resolución/parte de la Capitanía de Puerto.
- `condicion`: condición general del mar (ej. "MAREJADA").
- `emitida`: fecha/hora de emisión del parte.
- Resto de campos (`lpg_amarre`, `lpg_desamarre`, `monoboya_amarre`, `monoboya_desamarre`, `practicos`, `fondeo`, `buceo`): habilitaciones puntuales por tipo de maniobra/operación, valor `"SI"` o `"NO"`.
- **Esto reemplaza el concepto simplificado de "puerto habilitado/no habilitado" del plan original** por una lista granular de habilitaciones por operación — mostrar como una mini-tabla o grilla de chips: cada ítem en verde si `"SI"`, en rojo si `"NO"`.

#### d) `kpis.json` — KPIs de rendimiento
**Estructura conocida, fuente no automatizada aún** (probablemente carga manual/periódica desde otra planilla o sistema interno).

```json
[
  { "nombre": "% Cumplimiento Volúmen", "valor": 81, "periodo": "P7 25 de Junio" },
  { "nombre": "% Cumplimiento Faenas", "valor": 30, "periodo": "P7 25 de Junio" }
]
```
- Es un **array de largo variable** (hoy 2 KPIs, pero puede crecer) → la IA debe iterar dinámicamente sobre el array, no hardcodear 2 cards fijas.
- `valor` es numérico (0–100, %), usar directamente como número grande y como porcentaje de la barra de progreso animada.
- No trae `icono` — la IA debe asignar un ícono genérico según palabras clave del `nombre` (ej. "Volumen" → ícono de tanque/barril, "Faenas" → ícono de operación/engranaje) o usar un ícono neutro por defecto.

#### e) `turnos.json` — Turno vigente (significado exacto AÚN NO CONFIRMADO por el cliente)

```json
{ "dia": "C", "noche": "A" }
```
- **Este archivo fue entregado por el cliente sin explicación de qué representan las letras** (A/B/C/D). No se debe asumir que son "turnos de guardia", "equipos" ni ningún otro significado específico — la IA debe tratarlo como un dato genérico de dos valores (`dia`, `noche`) y mostrarlo de forma **literal y neutra**, sin lógica adicional inventada:
  - Mostrar simplemente como un indicador pequeño, ej. **"Turno Día: C   ·   Turno Noche: A"**, en el header o en el panel de condiciones.
  - **No** implementar lógica de "resaltar cuál está vigente según la hora" ni ningún otro comportamiento condicional basado en estas letras, ya que no se conoce la regla real de corte horario ni si esa interpretación es correcta.
  - Dejar un comentario explícito en el código: `// turnos.json: significado de A/B/C/D pendiente de confirmación con el cliente TMQ. Por ahora se muestra tal cual, sin lógica adicional.`
- Cuando el cliente aclare el significado, este bloque se debe actualizar (y posiblemente agregar la lógica de resaltado que se dejó pendiente).

#### f) Capas del mapa
No tiene fuente de datos identificada — se mantiene como configuración estática simple (lista de nombres de capas) dentro del propio código o en un `data/mapa.json` liviano, ya que depende del proveedor de mapa que se elija (ver sección 4.3.1).

> **Instrucción a la IA:** todos los archivos `/data/*.json` deben leerse con un módulo único de "data fetcher" que maneje errores de forma uniforme (si un JSON no carga, mantener el último valor válido en memoria y mostrar el indicador de error correspondiente, igual que con la planilla de naves).

---

## 2. STACK TÉCNICO RECOMENDADO

- **Frontend:** HTML + CSS + JavaScript puro, o React (a elección de la IA/desarrollador, pero priorizando simplicidad de despliegue).
- **Sin backend propio obligatorio:** usar fetch directo al CSV publicado; si hay bloqueo CORS, usar una función serverless liviana (Vercel Function / Netlify Function) solo como proxy de lectura.
- **Mapa:** iframe embebido (Google Maps, MarineTraffic, VesselFinder o mapa propio vía Leaflet/Mapbox si se dispone de API key). Definir cuál según disponibilidad de licencia.
- **Hosting sugerido:** Vercel o Netlify (despliegue gratuito, HTTPS automático, URL estable para dejar abierta en TV vía Chromecast/mini PC/Smart TV browser).
- **Responsive:** diseño mobile-first con breakpoints específicos para TV (ver sección 6).
- **Sin dependencia de librerías pesadas** innecesarias; priorizar tiempos de carga rápidos (pantalla va a estar encendida 24/7).

---

## 3. ESTRUCTURA GENERAL DE LA PANTALLA

Layout general en desktop/TV: **Header fijo arriba + 2 columnas (izquierda 55% / derecha 45% aproximado, ajustable)**.
En mobile: todo se apila verticalmente en una sola columna, con navegación por scroll o tabs.

```
┌───────────────────────────────────────────────────────────┐
│                        HEADER                              │
├───────────────────────────┬─────────────────────────────────┤
│                           │                                 │
│   COLUMNA IZQUIERDA        │        COLUMNA DERECHA          │
│   - Tabla de Naves         │   - Mapa interactivo (iframe)   │
│   - Panel de Condiciones   │   - Panel de KPIs rotativos     │
│                           │                                 │
└───────────────────────────┴─────────────────────────────────┘
```

---

## 4. ESPECIFICACIÓN DETALLADA POR BLOQUE

### 4.1 HEADER

**Contenido:**
- Logo de ENAP (usar placeholder si no se dispone del archivo, dejar `<img>` con comentario `<!-- reemplazar por logo oficial ENAP -->`).
- Título: "Dashboard Operacional — División de Operaciones Marítimas · Terminal Marítimo Quintero".
- Subtítulo pequeño: "Monitoreo en vivo" con punto verde parpadeante + texto "EN VIVO".
- Reloj digital grande (HH:MM:SS, actualizado cada segundo, tipografía monoespaciada o estilo digital).
- Fecha completa en español (ej: "domingo, 6 de julio de 2026").
- Indicador de "Última actualización de datos: hh:mm".

**Comportamiento:**
- Fijo (sticky) en la parte superior en todas las resoluciones.
- Reloj basado en hora local del navegador (zona horaria de Chile).

### 4.2 COLUMNA IZQUIERDA

#### 4.2.1 Tabla de Naves (bloque principal)

**Fuente:** planilla descrita en sección 1.1.

**Filtros tipo "píldora" (pills), ubicados sobre la tabla:**
- Por terminal: `Todas` | `LPG` | `Multicrudo` | `Monoboya` | `Barcaza` | `Oxiquim`.
- Por turno: `Todos` | `AM` | `PM`.
- Por estado: `Operando` | `Mantención` | `Corte de energía` | `Prob. mal tiempo` (opcional, según espacio).
- Selector de rango de fecha por defecto: mostrar desde "hoy" hacia adelante (ej: próximos 7 a 10 días), con opción de ver más.

**Columnas de la tabla:**
| Fecha | Turno | Terminal | Nave | Estado |
|---|---|---|---|---|

- Cuando una celda de la planilla tiene un nombre de nave real → fila normal, estado "Operando" (verde/celeste).
- Cuando la celda dice "Mantención" → fila en ámbar/naranja.
- Cuando dice "Corte De Energía" → fila en rojo, con ícono de alerta, y aplicar a todas las terminales del día.
- Cuando dice "*Prob. Mal Tiempo" → fila en amarillo con ícono de clima.
- Fila del día/turno actual debe resaltarse visualmente (ej: borde celeste neón o fondo levemente más claro) para ubicar "el ahora" de inmediato.

**Interacción y animación:**
- Punto verde parpadeante (indicador "datos en vivo") en la cabecera de la tabla.
- Animación de entrada de filas (fade + slide sutil) cuando se cargan o filtran datos nuevos.
- Scroll interno si la lista excede el alto disponible (no debe romper el layout de la pantalla, especialmente en modo TV donde no hay mouse para scrollear — considerar auto-scroll lento tipo "cinta" en modo TV, opcional).

#### 4.2.2 Panel Inferior de Condiciones (rotativo)

**Fuente:** `data/inversion.json`, `data/ventilacion.json`, `data/cpuerto.json` (ver sección 1.3 para esquemas exactos).

Panel que rota automáticamente cada X segundos (sugerido 8–10 seg) entre 3 vistas:

1. **Inversión térmica** (`inversion.json`): mostrar `estado` en texto grande ("SIN INVERSION" en verde / "CON INVERSION" en rojo-ámbar), y como dato secundario más pequeño: `delta`, `hora` y `fecha`.
2. **Ventilación** (`ventilacion.json`): mostrar `estado` en texto grande (BUENA/REGULAR/MALA) con semáforo de color según `codigo` (B=verde, R=amarillo, M=rojo), y como dato secundario `hora_actual` y `actualizado` (timestamp de la última lectura).
3. **Condición de puerto** (`cpuerto.json`): mostrar `condicion` (ej. "MAREJADA") y número de parte (`numero`) como encabezado de la card, y debajo una grilla/lista de chips con las 7 habilitaciones (`lpg_amarre`, `lpg_desamarre`, `monoboya_amarre`, `monoboya_desamarre`, `practicos`, `fondeo`, `buceo`): cada chip en verde si el valor es `"SI"`, en rojo si es `"NO"`. Mostrar `emitida` como fecha de referencia del parte.

**Comportamiento:**
- Transición con fade/slide entre paneles.
- Indicadores tipo "dots" (puntos) abajo para saber en qué panel de la rotación se está, igual que un carrusel.
- Debe poder pausarse al pasar el mouse (en PC) pero seguir rotando automáticamente en TV/mobile.
- Si alguno de los 3 JSON no logra cargar, saltar esa vista del carrusel (no mostrar una card vacía) y seguir rotando entre las que sí tengan datos válidos.

**Turno (`turnos.json`):** mostrar como indicador pequeño y fijo (no rotativo) en este panel o en el header, de forma literal — ej. "Turno Día: C · Turno Noche: A" — **sin resaltar ninguno como "vigente"** y sin lógica condicional por hora, ya que el significado exacto de las letras no está confirmado por el cliente (ver detalle en sección 1.3.e). Ajustar esto cuando el cliente aclare qué representan.

### 4.3 COLUMNA DERECHA

#### 4.3.1 Mapa Interactivo

- Contenedor superior con `iframe` del mapa (definir proveedor: MarineTraffic, VesselFinder o Google Maps con marcadores custom).
- Botones superpuestos (overlay, esquina superior o lateral) para activar/desactivar capas: ej. `Buques`, `Zonas de fondeo`, `Boyas`, `Meteorología`, `Batimetría` (ajustar según capas reales disponibles del proveedor elegido).
- Los botones deben tener estado visual claro (activo = resaltado en celeste neón / inactivo = translúcido).
- El iframe debe ser responsive (ajustar alto según viewport) y no debe capturar el scroll de toda la página (comportamiento controlado con `pointer-events` si es necesario).

#### 4.3.2 Panel de KPIs (Métricas de Rendimiento)

**Fuente:** `data/kpis.json` — array de largo variable, ej.:
```json
[
  { "nombre": "% Cumplimiento Volúmen", "valor": 81, "periodo": "P7 25 de Junio" },
  { "nombre": "% Cumplimiento Faenas", "valor": 30, "periodo": "P7 25 de Junio" }
]
```

- Fondo con efecto de brillo/pulso (glow) sutil y animado, para diferenciarlo visualmente del resto (zona "destacada").
- Cards rotativas (carrusel automático, similar al panel de condiciones), **una por cada elemento del array** — la IA debe iterar dinámicamente, sin asumir una cantidad fija de KPIs (hoy son 2, pero el archivo puede crecer).
- Cada card incluye: ícono (asignado por palabra clave del campo `nombre`, o ícono neutro por defecto si no coincide con ninguna regla), número grande animado con el valor de `valor` (contador que sube desde 0 al valor final al aparecer, sufijo `%`), el texto de `nombre` como etiqueta descriptiva, el texto de `periodo` como referencia temporal, y una barra de progreso animada que se llena hasta `valor`% (0–100).
- Transición entre cards con animación fluida (fade/slide), rotación automática cada 6–8 segundos. Si solo hay 1 KPI en el array, no rotar (mostrar fijo).

---

## 5. DISEÑO VISUAL (DESIGN SYSTEM)

**Estilo general:** Dark Mode moderno, "sala de control".

**Paleta de colores (sugerida, ajustable):**
- Fondo principal: azul marino muy oscuro, casi negro (`#0A0E1A` a `#0F1526`).
- Fondo de tarjetas/paneles: azul oscuro levemente más claro (`#131B2E` a `#1A2438`), con bordes sutiles (`#2A3752`, opacidad baja).
- Color de acento primario: celeste/neón (`#00D9FF` o similar cyan brillante).
- Color de acento secundario: verde neón para "en vivo" y estados positivos (`#00FF9C` o similar).
- Alertas: amarillo (`#FFD84D`), naranja (`#FF9F45`), rojo (`#FF4B5C`).
- Texto principal: blanco/gris muy claro (`#E8EDF5`). Texto secundario: gris azulado (`#8B98B3`).

**Tipografía:**
- Sans-serif moderna (ej: Inter, Roboto, o system-ui) para textos generales.
- Fuente monoespaciada o estilo "digital/LED" para el reloj del header (ej: "Roboto Mono", "Orbitron" o similar, según licencia).
- Jerarquía clara: números de KPIs deben ser muy grandes (48–72px en TV), títulos de sección medianos, texto de tabla legible incluso a distancia.

**Animaciones (todas sutiles, sin distraer, pensadas para exhibición pasiva prolongada):**
- Parpadeo del punto "en vivo" (verde), ciclo de 1.5–2 seg.
- Entrada de filas de tabla (fade + slight translateY).
- Pulso de fondo en la sección de KPIs (glow que respira, ciclo lento de 3–4 seg).
- Transiciones de carrusel (paneles de condiciones y KPIs) con fade/slide de 400–600ms.
- Barra de progreso animada (crece de 0 al valor final al entrar en pantalla).
- Todas las animaciones deben poder desactivarse o reducirse si el navegador tiene activado `prefers-reduced-motion` (accesibilidad).

---

## 6. RESPONSIVE / MULTI-DISPOSITIVO

Este es un requisito crítico: la misma URL debe verse bien en 3 contextos muy distintos.

### 6.1 TV / Pantalla grande (1920×1080 o superior, sin mouse/teclado)
- Layout de 2 columnas como en la sección 3.
- Tipografía y elementos más grandes que en desktop normal (usar unidades relativas `vw`/`rem` con escalado).
- Sin elementos que requieran hover para ser vistos (todo debe ser visible siempre, sin depender de `:hover`).
- Rotaciones automáticas de paneles habilitadas siempre (no depender de interacción).
- Considerar un modo "kiosco" (full screen, sin scrollbars visibles).

### 6.2 PC / Escritorio (1280–1920px)
- Mismo layout de 2 columnas, con filtros interactivos habilitados (click en píldoras, botones de capas del mapa, hover states).
- Scroll normal donde sea necesario (ej. tabla de naves si excede alto disponible).

### 6.3 Mobile (< 768px)
- Layout de 1 columna, orden sugerido: Header (compacto) → Estado del puerto/condiciones (resumen rápido, lo más urgente primero) → Tabla de naves (con filtros colapsables) → KPIs → Mapa (al final o en pestaña separada, ya que un iframe de mapa completo consume mucho espacio vertical).
- Header compacto: reloj y fecha en una sola línea, logo pequeño.
- Considerar tabs o acordeones para no forzar scroll infinito: `Naves | Condiciones | Mapa | KPIs`.
- Todos los tap targets (botones, píldoras) con tamaño mínimo cómodo para dedo (44×44px).

### 6.4 Breakpoints sugeridos
```
Mobile:      hasta 767px   → 1 columna
Tablet:      768px–1279px  → 1 o 2 columnas según orientación
Desktop:     1280px–1919px → 2 columnas estándar
TV / 4K:     1920px+       → 2 columnas, escalado tipográfico mayor
```

---

## 7. REQUISITOS TÉCNICOS Y DE DESPLIEGUE

### 7.1 Actualización de datos en vivo
- Polling cada 5 minutos al CSV de la planilla (sección 1.1).
- Reloj del header actualizado cada segundo vía `setInterval`/`requestAnimationFrame`.
- Todo el estado de datos debe manejarse de forma que un fallo de red no rompa la interfaz (mostrar últimos datos + indicador de estado de conexión).

### 7.2 Modo TV / Kiosco
- La app debe funcionar correctamente dejada abierta indefinidamente en un navegador (sin memory leaks por los intervals/carruseles — usar `clearInterval` correctamente si el componente se desmonta, aunque en un dashboard de una sola pantalla esto es menos crítico).
- Recomendar al cliente, en la documentación de entrega, cómo poner el navegador en pantalla completa (`F11` o modo kiosco de Chrome: `chrome --kiosk [URL]`) en el PC/mini-PC conectado a la TV.

### 7.3 Manejo de CORS del Google Sheet (si aplica)
- Primero intentar fetch directo al CSV publicado desde el navegador.
- Si el navegador bloquea por CORS, implementar una función serverless simple (Vercel Serverless Function o Netlify Function) que:
  1. Reciba una request GET del frontend.
  2. Descargue el CSV desde Google Sheets en el servidor.
  3. Lo parsee a JSON.
  4. Lo devuelva al frontend con headers CORS abiertos.
- Documentar esta función claramente en el código para que el equipo de TMQ pueda mantenerla.

### 7.4 Arquitectura de datos automatizados (GitHub Actions) — YA EXISTENTE, reutilizar
El proyecto ya cuenta con workflows de GitHub Actions funcionando (`ventilacion.yml`, `inversionT.yml`) que actualizan `ventilacion.json` e `inversion.json` cada 30 minutos mediante scraping de fuentes oficiales (MMA/Pronaire), y los commitean al repositorio. La IA de desarrollo **no debe recrear estos scrapers**; debe:
1. Ubicar el código del dashboard en el **mismo repositorio** donde ya corren estos workflows (o en uno que los incluya), dentro de una carpeta `/data` para los JSON y, por ejemplo, `/app` o raíz para el frontend.
2. Si en el futuro se automatizan `cpuerto.json`, `kpis.json` o `turnos.json`, deben seguir el mismo patrón: un workflow con cron que escribe el JSON correspondiente en `/data` y hace commit — dejar esto documentado como próximo paso, no como parte obligatoria de esta entrega.
3. El frontend debe leer todos los JSON de `/data` con un mismo método de fetch reutilizable (ver nota al final de la sección 1.3).

**Recomendación de hosting dado que los datos ya viven en GitHub:** usar **GitHub Pages** para el frontend (mismo repo, sin costo, despliegue automático en cada push) — esto permite leer los JSON de `/data` con rutas relativas y sin CORS. Si se prefiere Vercel/Netlify por otras razones (dominio propio, funciones serverless para el CSV de naves), el frontend puede seguir leyendo los JSON vía `raw.githubusercontent.com`.

### 7.5 Despliegue
- Repositorio Git (el mismo donde están los workflows de datos) conectado a GitHub Pages, Vercel o Netlify para despliegue continuo (cada cambio se publica automáticamente).
- Entregar al cliente: URL final pública, y documentación breve de cómo:
  - Editar manualmente `cpuerto.json`, `kpis.json` y `turnos.json` mientras no estén automatizados (formato exacto de cada archivo, ver sección 1.3).
  - Verificar que la planilla de Google Sheets siga compartida como "pública en la web" (si se despublica, el dashboard deja de recibir datos de naves).
  - Verificar periódicamente que los workflows de `ventilacion.yml` e `inversionT.yml` sigan ejecutándose sin errores (GitHub notifica por correo si un workflow falla).

---

## 8. ENTREGABLES ESPERADOS DE LA IA DE DESARROLLO

1. Código fuente completo de la aplicación (HTML/CSS/JS o React), organizado y comentado.
2. Módulo de "data fetcher" que lea `ventilacion.json`, `inversion.json`, `cpuerto.json`, `kpis.json`, `turnos.json` desde `/data`, con manejo uniforme de errores (mantener último valor válido si un fetch falla).
3. Función/lógica de obtención y parseo del CSV de la planilla de naves, con manejo de estados especiales (Mantención, Corte de Energía, Prob. Mal Tiempo).
4. Diseño responsive funcionando en los 3 escenarios (TV, PC, mobile).
5. Breve documento de despliegue (cómo publicar en GitHub Pages/Vercel/Netlify y cómo dejarlo en modo kiosco en una TV), incluyendo mención de que `ventilacion.json` e `inversion.json` ya se actualizan solos vía GitHub Actions.
6. Placeholders claramente marcados donde falte información real (logo oficial, proveedor final de mapa, fuente/automatización de `cpuerto.json`, `kpis.json` y `turnos.json`) para que el equipo de TMQ los complete.

---

## 9. CRITERIOS DE ACEPTACIÓN (checklist final)

- [ ] El reloj y la fecha se actualizan correctamente y en tiempo real.
- [ ] La tabla de naves refleja los datos reales de la planilla, incluyendo estados especiales (Mantención, Corte de Energía, Mal Tiempo).
- [ ] Los filtros por terminal/turno funcionan correctamente sobre la tabla.
- [ ] El punto "en vivo" parpadea y el timestamp de última actualización es correcto.
- [ ] El panel de condiciones rota automáticamente entre inversión térmica / ventilación / condición de puerto, con los colores correctos según cada estado.
- [ ] El turno (`turnos.json`) se muestra de forma literal ("Turno Día: X · Turno Noche: Y"), sin lógica de resaltado inventada, ya que su significado real está pendiente de confirmación con el cliente.
- [ ] El mapa carga correctamente y los botones de capas cambian su estado visual al activarse/desactivarse.
- [ ] Las cards de KPIs rotan automáticamente, con números animados y barra de progreso.
- [ ] La pantalla se ve correctamente en: TV 1920×1080+, PC/laptop estándar, y celular (portrait).
- [ ] El diseño respeta la paleta dark mode + acentos celeste/neón descrita.
- [ ] La app sigue funcionando (sin romperse) si el fetch a la planilla falla temporalmente.
- [ ] Existe una URL pública desplegada y accesible desde cualquier dispositivo con navegador.

---

### Nota final para quien use este documento como prompt
Al entregar este plan a una IA de desarrollo, se recomienda pedirle primero que **liste sus dudas o supuestos antes de escribir código** (ej. qué proveedor de mapa usará, cómo resolverá el CORS, qué librería de gráficos usará para las barras de progreso), para validar decisiones antes de que construya la versión completa.
