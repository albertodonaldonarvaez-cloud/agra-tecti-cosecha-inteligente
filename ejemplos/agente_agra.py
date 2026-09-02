"""
Cliente de la API de Agra Tec-Ti para agentes de IA y scripts.

Es un archivo suelto, sin más dependencia que `requests`. La idea es que un
agente lo copie tal cual y a partir de ahí escriba sus propios análisis.

    pip install requests
    export AGRA_API_KEY="agt_live_..."
    export AGRA_API_URL="https://agra-tecti.com/api/v1"
    python agente_agra.py

Lo que conviene saber antes de interpretar cualquier cifra:

  · El peso ya viene en KILOS. En la base está en gramos, pero la API convierte.
    Por eso los campos se llaman `pesoKg` y no `peso`.
  · Las cortadoras 98 y 99 NO son personas: son las cajas marcadas como segunda
    calidad y como desperdicio. /cortadoras ya las excluye del ranking.
  · Todas las fechas son días de calendario en hora de México, formato YYYY-MM-DD.

Y si algo de esto se te olvida, el propio servidor lo explica:
    GET /diccionario   unidades, códigos y trampas
    GET /catalogo      qué endpoints existen y con qué parámetros
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Iterator

import requests


class ErrorApi(Exception):
    """Un rechazo de la API. `ayuda` dice qué hacer para que funcione."""

    def __init__(self, estado: int, codigo: str, mensaje: str, ayuda: str | None = None):
        super().__init__(f"[{estado} {codigo}] {mensaje}" + (f" — {ayuda}" if ayuda else ""))
        self.estado = estado
        self.codigo = codigo
        self.mensaje = mensaje
        self.ayuda = ayuda


class Agra:
    """
    Cliente de solo lectura.

    Reintenta solo cuando el servidor dice que se puede reintentar: si llega un
    429 con Retry-After, espera lo que pide y vuelve. Un 400 no se reintenta —
    volver a mandar la misma fecha mal escrita da el mismo error.
    """

    def __init__(
        self,
        url: str | None = None,
        llave: str | None = None,
        tiempo_limite: int = 60,
        reintentos: int = 3,
    ):
        self.url = (url or os.environ.get("AGRA_API_URL", "")).rstrip("/")
        self.llave = llave or os.environ.get("AGRA_API_KEY", "")
        if not self.url:
            raise ValueError("Falta la URL de la API (AGRA_API_URL)")
        if not self.llave:
            raise ValueError("Falta la llave (AGRA_API_KEY). Se crea en Configuración → Llaves de API")

        self.tiempo_limite = tiempo_limite
        self.reintentos = reintentos
        self.sesion = requests.Session()
        self.sesion.headers.update({"X-API-Key": self.llave, "Accept": "application/json"})

    # ── lo básico ──────────────────────────────────────────────

    def pedir(self, ruta: str, **parametros: Any) -> Any:
        """Una consulta. Devuelve directamente el contenido de `datos`."""
        parametros = {k: v for k, v in parametros.items() if v is not None}

        for intento in range(self.reintentos):
            r = self.sesion.get(f"{self.url}/{ruta.lstrip('/')}", params=parametros,
                                timeout=self.tiempo_limite)

            if r.status_code == 429 and intento < self.reintentos - 1:
                espera = int(r.headers.get("Retry-After", "5"))
                # La cuota diaria no se libera esperando: solo tiene sentido
                # reintentar cuando el freno es el límite por minuto
                if self._codigo(r) == "demasiadas_peticiones":
                    time.sleep(espera)
                    continue

            cuerpo = self._json(r)
            if r.ok and cuerpo.get("ok"):
                return cuerpo["datos"]

            error = cuerpo.get("error", {})
            raise ErrorApi(r.status_code, error.get("codigo", "desconocido"),
                           error.get("mensaje", r.text[:200]), error.get("ayuda"))

        raise ErrorApi(429, "demasiadas_peticiones", "Se agotaron los reintentos")

    @staticmethod
    def _json(r: requests.Response) -> dict:
        try:
            return r.json()
        except ValueError:
            return {}

    def _codigo(self, r: requests.Response) -> str:
        return self._json(r).get("error", {}).get("codigo", "")

    # ── descubrimiento ─────────────────────────────────────────

    def catalogo(self) -> dict:
        """Qué se puede consultar. Primera llamada recomendada."""
        return self.pedir("catalogo")

    def diccionario(self) -> dict:
        """Unidades y códigos. Léelo antes de sacar conclusiones de una cifra."""
        return self.pedir("diccionario")

    # ── consultas de uso diario ────────────────────────────────

    def contexto(self) -> dict:
        """Todo el estado de la finca en una llamada."""
        return self.pedir("contexto")

    def resumen(self, desde: str | None = None, hasta: str | None = None) -> dict:
        return self.pedir("cosecha/resumen", desde=desde, hasta=hasta)

    def diaria(self, desde: str | None = None, hasta: str | None = None) -> dict:
        return self.pedir("cosecha/diaria", desde=desde, hasta=hasta)

    def por_parcela(self, desde: str | None = None, hasta: str | None = None) -> dict:
        return self.pedir("cosecha/por-parcela", desde=desde, hasta=hasta)

    def cortadoras(self, desde: str | None = None, hasta: str | None = None, limite: int = 100) -> dict:
        return self.pedir("cortadoras", desde=desde, hasta=hasta, limite=limite)

    def serie(self, metrica: str = "kg", granularidad: str = "dia",
              desde: str | None = None, hasta: str | None = None,
              parcela: str | None = None) -> dict:
        """
        Métricas: cajas, kg, primera_kg, segunda_kg, desperdicio_kg,
                  calidad_pct, peso_promedio_kg
        Granularidad: dia, semana, mes
        """
        return self.pedir("series", metrica=metrica, granularidad=granularidad,
                          desde=desde, hasta=hasta, parcela=parcela)

    def parcelas(self, activas: bool = False) -> dict:
        return self.pedir("parcelas", activas="true" if activas else None)

    def labores(self, desde: str | None = None, hasta: str | None = None,
                tipo: str | None = None, estado: str | None = None) -> dict:
        return self.pedir("labores", desde=desde, hasta=hasta, tipo=tipo, estado=estado)

    def notas(self, estado: str | None = None, gravedad: str | None = None) -> dict:
        return self.pedir("notas", estado=estado, gravedad=gravedad)

    def clima(self, desde: str, hasta: str) -> dict:
        return self.pedir("clima", desde=desde, hasta=hasta)

    def ciclos(self) -> dict:
        return self.pedir("ciclos")

    # ── histórico completo ─────────────────────────────────────

    def todas_las_cajas(self, desde: str | None = None, hasta: str | None = None,
                        por_lote: int = 2000) -> Iterator[dict]:
        """
        Recorre el histórico caja por caja, sin cargarlo todo en memoria.

        Va por cursor y no por página a propósito: la sincronización con Kobo
        mete cajas nuevas dos veces al día, y con paginado normal las filas se
        recorren y terminarías con registros repetidos y otros que nunca viste.

            for caja in agra.todas_las_cajas(desde="2026-01-01"):
                ...
        """
        cursor = None
        while True:
            r = self.sesion.get(
                f"{self.url}/exportar/cajas",
                params={k: v for k, v in
                        {"cursor": cursor, "limite": por_lote, "desde": desde, "hasta": hasta}.items()
                        if v is not None},
                timeout=self.tiempo_limite,
                stream=True,
            )
            if not r.ok:
                cuerpo = self._json(r).get("error", {})
                raise ErrorApi(r.status_code, cuerpo.get("codigo", "desconocido"),
                               cuerpo.get("mensaje", "No se pudo exportar"), cuerpo.get("ayuda"))

            for linea in r.iter_lines(decode_unicode=True):
                if linea:
                    yield json.loads(linea)

            cursor = r.headers.get("X-Siguiente-Cursor")
            if not cursor:
                return


# ─────────────────────────── ejemplo ───────────────────────────

def _ejemplo() -> None:
    agra = Agra()

    ctx = agra.contexto()
    hoy = ctx["cosecha"]["hoy"]
    mes = ctx["cosecha"]["ultimos30Dias"]

    print(f"Hoy ({ctx['fecha']}): {hoy['cajas']} cajas, {hoy['pesoKg']} kg")
    print(f"Últimos 30 días: {mes['cajas']} cajas, {mes['pesoToneladas']} t, "
          f"{mes['primeraPorcentaje']}% de primera")

    print("\nParcelas con mejor rendimiento (kg por hectárea):")
    for p in ctx["parcelas"]["mejorRendimiento"]:
        print(f"  {p['nombre']:<20} {p['rendimientoKgPorHectarea']:>10,.0f} kg/ha")

    sin_hectareas = ctx["parcelas"]["sinHectareasRegistradas"]
    if sin_hectareas:
        print(f"  ({sin_hectareas} parcelas quedaron fuera: no tienen hectáreas registradas)")

    print("\nCalidad semana a semana:")
    for punto in agra.serie(metrica="calidad_pct", granularidad="semana")["puntos"][-8:]:
        print(f"  Semana del {punto['periodo']}: {punto['valor']}% de primera "
              f"({punto['cajas']} cajas)")

    print("\nMejores cortadoras del mes:")
    for c in agra.cortadoras(limite=5)["cortadoras"]:
        nombre = c["nombre"] or f"Cortadora {c['cortadora']}"
        print(f"  {c['posicion']}. {nombre:<20} {c['pesoKg']:>10,.1f} kg "
              f"en {c['diasTrabajados']} días")


if __name__ == "__main__":
    try:
        _ejemplo()
    except ErrorApi as e:
        print(f"La API rechazó la consulta: {e}")
    except ValueError as e:
        print(f"Falta configuración: {e}")
