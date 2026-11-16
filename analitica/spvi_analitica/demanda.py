"""
DEMANDA ESPERADA EN UNA TEMPORADA (cálculo puro). Para cada producto recibe lo vendido en esa temporada en años
anteriores (del más antiguo al más reciente) y su existencia, y estima cuánto se venderá y cuánto conviene comprar.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class Estimacion:
    esperado: float | None     # unidades que se espera vender en la temporada (None = sin historia)
    sugerido: float            # cuánto comprar (0 si la existencia alcanza)
    cobertura: float | None    # existencia / esperado (1 = alcanza justo)
    confianza: str             # alta | media | baja | sin_historia
    tendencia: str             # sube | estable | baja | -


def estimar(historial: list[float], existencia: float, seguridad: float = 0.15, decimales: bool = False) -> Estimacion:
    h = np.asarray([x for x in historial if x is not None], dtype=float)
    if len(h) == 0 or h.sum() <= 0:
        return Estimacion(None, 0.0, None, "sin_historia", "-")
    pesos = np.arange(1, len(h) + 1, dtype=float)  # lo reciente pesa más
    promedio = float((h * pesos).sum() / pesos.sum())
    tendencia = "-"
    esperado = promedio
    if len(h) >= 2:
        pendiente = float(np.polyfit(np.arange(len(h)), h, 1)[0])
        proyectado = float(h[-1] + pendiente) if len(h) >= 3 else promedio + pendiente / 2
        esperado = float(np.clip(proyectado, 0.5 * promedio, 1.5 * promedio))  # sin saltos absurdos
        rel = pendiente / max(promedio, 1e-9)
        tendencia = "sube" if rel > 0.08 else "baja" if rel < -0.08 else "estable"
    variacion = float(h.std() / h.mean()) if len(h) >= 2 and h.mean() > 0 else 1.0
    confianza = "baja" if len(h) < 2 or variacion >= 0.5 else "media" if variacion >= 0.25 or len(h) < 3 else "alta"
    falta = esperado * (1 + seguridad) - existencia
    sugerido = 0.0 if falta <= 0 else (round(falta, 3) if decimales else float(math.ceil(falta - 1e-9)))
    return Estimacion(round(esperado, 3), sugerido, round(existencia / esperado, 2) if esperado > 0 else None, confianza, tendencia)
