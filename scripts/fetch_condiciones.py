#!/usr/bin/env python3
"""
fetch_condiciones.py
====================
Script ejecutado por GitHub Actions cada 3 horas.
Genera data/condiciones.json con:
  - Inversión Térmica (CSV pronaire.mma.gob.cl)
  - Ventilación Atmosférica (airecqp.mma.gob.cl)
  - Condición de Puerto / Estado de la bahía (sitport.directemar.cl)
"""

import json
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

# Zona horaria de Chile (UTC-4 invierno / UTC-3 verano)
TZ_CHILE = timezone(timedelta(hours=-4))

def ahora_chile():
    return datetime.now(TZ_CHILE).strftime('%d-%m-%Y %H:%M')

def log(msg):
    print(f"[fetch_condiciones] {msg}", flush=True)

def fetch_url(url, timeout=15):
    """Descarga una URL y retorna el texto. Lanza excepción si falla."""
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; TMQ-Dashboard/1.0)'
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or 'utf-8'
        return resp.read().decode(charset, errors='replace')

# ──────────────────────────────────────────────────────────────────────────────
# 1. INVERSIÓN TÉRMICA
# Fuente: CSV del pronaire (temperatura diferencial 48h)
# Umbral: delta > 0 → CON INVERSIÓN
# ──────────────────────────────────────────────────────────────────────────────
CSV_INVERSION = (
    "https://pronaire.mma.gob.cl/regiones/graficos/valparaiso/"
    "torre_met/Delta_48.csv"
)

def obtener_inversion():
    try:
        log("Descargando CSV inversión térmica...")
        texto = fetch_url(CSV_INVERSION)
        lineas = [l.strip() for l in texto.splitlines() if l.strip()]

        # Saltar cabecera "Fecha,Delta"
        datos = []
        for linea in lineas:
            if linea.lower().startswith("fecha"):
                continue
            partes = linea.split(",")
            if len(partes) >= 2:
                try:
                    datos.append((partes[0].strip(), float(partes[1].strip())))
                except ValueError:
                    continue

        if not datos:
            raise ValueError("CSV sin filas de datos válidos")

        fecha_raw, delta = datos[-1]  # última medición
        delta_rnd = round(delta, 2)
        con_inversion = delta_rnd > 0
        estado = "CON INVERSIÓN" if con_inversion else "SIN INVERSIÓN"

        # Parsear fecha "dd-mm-yy HH:MM"
        fecha_obj = None
        hora_str = "—"
        fecha_str = "—"
        try:
            fecha_obj = datetime.strptime(fecha_raw, "%d-%m-%y %H:%M")
            hora_str  = fecha_obj.strftime("%H:%M")
            fecha_str = fecha_obj.strftime("%d-%m-%Y")
        except ValueError:
            fecha_str = fecha_raw

        log(f"  ✓ Inversión: delta={delta_rnd} → {estado} ({fecha_str} {hora_str})")
        return {
            "delta":   delta_rnd,
            "estado":  estado,
            "inversion": con_inversion,
            "hora":    hora_str,
            "fecha":   fecha_str,
        }

    except Exception as e:
        log(f"  ✗ Error inversión: {e}")
        return {"estado": "Sin datos", "delta": None, "inversion": False, "hora": "—", "fecha": "—"}

# ──────────────────────────────────────────────────────────────────────────────
# 2. VENTILACIÓN ATMOSFÉRICA
# Fuente: airecqp.mma.gob.cl (WordPress/Elementor)
# Busca primero un endpoint JSON interno del plugin Elementor Pro,
# si no, parsea el HTML buscando el pronóstico B/R/M del turno actual.
# ──────────────────────────────────────────────────────────────────────────────
URL_VENTILACION = "https://airecqp.mma.gob.cl/pronostico-de-ventilacion/"

CODIGOS = {
    "buena":   ("B", "Buena"),
    "regular": ("R", "Regular"),
    "mala":    ("M", "Mala"),
    "pésima":  ("M", "Mala"),
    "pesima":  ("M", "Mala"),
}

def parsear_ventilacion_html(html: str):
    """
    Extrae el estado de ventilación del HTML de airecqp.mma.gob.cl.
    El sitio muestra tablas con los turnos AM/PM por día.
    Busca texto cercano a "hoy" o la primera celda de estado.
    """
    # Limpiar HTML de tags para buscar texto plano
    texto_plano = re.sub(r'<[^>]+>', ' ', html)
    texto_plano = re.sub(r'\s+', ' ', texto_plano).lower()

    # Buscar los patrones de ventilación
    for palabra, (codigo, label) in CODIGOS.items():
        if palabra in texto_plano:
            # Intentar extraer la hora asociada
            hora_match = re.search(r'(\d{1,2}:\d{2})', texto_plano)
            hora = hora_match.group(1) if hora_match else "—"
            return codigo, label, hora

    return None, "Sin datos", "—"

def obtener_ventilacion():
    try:
        log("Descargando página ventilación...")
        html = fetch_url(URL_VENTILACION)

        # Intentar extraer desde script JSON de WordPress (REST API)
        # El sitio puede exponer datos vía wp-json
        try:
            api_url = "https://airecqp.mma.gob.cl/wp-json/wp/v2/posts?per_page=1&categories=&_fields=content,title,date"
            json_text = fetch_url(api_url, timeout=8)
            posts = json.loads(json_text)
            if posts:
                content_html = posts[0].get('content', {}).get('rendered', '')
                codigo, estado, hora = parsear_ventilacion_html(content_html)
                if codigo:
                    log(f"  ✓ Ventilación (WP API): {codigo} → {estado}")
                    return {
                        "codigo":      codigo,
                        "estado":      estado,
                        "hora_actual": hora,
                        "actualizado": ahora_chile(),
                    }
        except Exception:
            pass  # Continúa con el HTML principal

        codigo, estado, hora = parsear_ventilacion_html(html)
        log(f"  ✓ Ventilación (HTML): {codigo or '?'} → {estado}")
        return {
            "codigo":      codigo or "?",
            "estado":      estado,
            "hora_actual": hora,
            "actualizado": ahora_chile(),
        }

    except Exception as e:
        log(f"  ✗ Error ventilación: {e}")
        return {"codigo": "?", "estado": "Sin datos", "hora_actual": "—", "actualizado": "—"}

# ──────────────────────────────────────────────────────────────────────────────
# 3. CONDICIÓN DE PUERTO (Estado de la Bahía — SITPORT)
# SITPORT es una app Angular que consume una API REST interna de Directemar.
# Probamos el endpoint conocido de la API de meteo/bahia.
# Si falla, retorna "Sin datos".
# ──────────────────────────────────────────────────────────────────────────────

# Endpoints candidatos de la API interna de SITPORT (descubiertos via DevTools)
SITPORT_API_CANDIDATES = [
    "https://sitport.directemar.cl/api/bahias/15",   # Puerto Quintero ID aproximado
    "https://sitport.directemar.cl/api/puertos/15",
    "https://sitport.directemar.cl/api/meteo/quintero",
    "https://sitport.directemar.cl/api/condicion/quintero",
]

def obtener_estado_puerto():
    """
    Intenta obtener el estado de la bahía de Quintero desde SITPORT API.
    Si todos los endpoints fallan, retorna "Sin datos" con nota de estado.
    """
    for url in SITPORT_API_CANDIDATES:
        try:
            log(f"  Probando endpoint SITPORT: {url}")
            texto = fetch_url(url, timeout=8)
            data = json.loads(texto)

            # Extrae el estado según la estructura que devuelva el endpoint
            estado = (
                data.get("estado") or
                data.get("condicion") or
                data.get("nombre_estado") or
                data.get("estadoBahia") or
                str(data.get("estado_id", ""))
            )
            if estado:
                log(f"  ✓ Puerto (SITPORT API): {estado}")
                return {
                    "estado":      estado,
                    "condicion":   estado,
                    "numero":      str(data.get("numero") or data.get("id") or "—"),
                    "emitida":     data.get("fecha") or data.get("fechaEmision") or ahora_chile(),
                    "fuente":      "SITPORT API",
                }
        except urllib.error.HTTPError as e:
            log(f"    HTTP {e.code} en {url}")
        except Exception as e:
            log(f"    Error en {url}: {e}")

    # Si ningún endpoint funcionó, retornar estado desconocido
    log("  ✗ No se pudo obtener estado del puerto desde SITPORT API")
    log("    → El estado del puerto debe actualizarse manualmente en cpuerto.js")
    return {
        "estado":    "Ver SITPORT",
        "condicion": "Ver SITPORT",
        "numero":    "—",
        "emitida":   ahora_chile(),
        "fuente":    "manual",
        "nota":      "Consultar sitport.directemar.cl para estado actualizado",
    }

# ──────────────────────────────────────────────────────────────────────────────
# MAIN — Ensamblar y guardar condiciones.json
# ──────────────────────────────────────────────────────────────────────────────
def main():
    log("=== Iniciando recolección de condiciones ===")

    inversion   = obtener_inversion()
    ventilacion = obtener_ventilacion()
    puerto      = obtener_estado_puerto()

    condiciones = {
        "actualizado": ahora_chile(),
        "puerto":      puerto,
        "ventilacion": ventilacion,
        "inversion":   inversion,
    }

    salida = "data/condiciones.json"
    with open(salida, "w", encoding="utf-8") as f:
        json.dump(condiciones, f, ensure_ascii=False, indent=2)

    log(f"=== condiciones.json generado correctamente ===")
    log(json.dumps(condiciones, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    sys.exit(main())
