"""
DETECCIÓN DE TEMPORADAS (cálculo puro, sin base de datos ni red).

Método: descomposición multiplicativa clásica. Cada mes se compara con el promedio móvil centrado de 12 meses
(que elimina la tendencia: crecer no es "temporada"), y para cada mes del calendario se toma la MEDIANA de esas
proporciones entre años (un año raro no inventa una temporada). Los meses cuyo índice supera el umbral y están
juntos (diciembre y enero cuentan como vecinos) forman una temporada.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
HISTORIA_MINIMA = 24  # meses: con menos no se distingue una temporada de una casualidad


@dataclass
class Temporada:
    meses: list[int]          # 1..12, en orden del calendario de la temporada (p. ej. [12, 1, 2])
    factor: float             # cuántas veces el promedio se vende en esos meses
    participacion: float      # parte de las ventas del año que cae en la temporada (0..1)
    confianza: str            # alta | media | baja
    consistencia: float       # proporción de años en que se repitió el pico
    anios_observados: int


@dataclass
class Resultado:
    indices: list[float] = field(default_factory=list)   # índice de cada mes (enero..diciembre), promedio 1
    temporadas: list[Temporada] = field(default_factory=list)
    fuera_de_temporada: list[int] = field(default_factory=list)  # meses que venden mucho menos que el promedio
    motivo: str | None = None                            # por qué no se analizó (historia insuficiente, poco volumen)


def _media_movil_centrada(v: np.ndarray) -> np.ndarray:
    """Promedio móvil 2x12 centrado: para cada mes, el promedio del año que lo rodea."""
    mm = np.full(len(v), np.nan)
    for t in range(6, len(v) - 6):
        mm[t] = (0.5 * v[t - 6] + v[t - 5:t + 6].sum() + 0.5 * v[t + 6]) / 12.0
    return mm


def indices_estacionales(valores: list[float], mes_inicial: int) -> tuple[np.ndarray, list[list[float]]]:
    """mes_inicial: 1..12 (mes del primer valor). Devuelve los 12 índices (promedio 1) y las proporciones observadas por mes."""
    v = np.asarray(valores, dtype=float)
    mm = _media_movil_centrada(v)
    proporciones: list[list[float]] = [[] for _ in range(12)]
    for t in range(len(v)):
        if np.isfinite(mm[t]) and mm[t] > 0:
            proporciones[(mes_inicial - 1 + t) % 12].append(v[t] / mm[t])
    crudo = np.array([np.median(p) if p else np.nan for p in proporciones])
    if np.all(np.isnan(crudo)):
        return np.ones(12), proporciones
    crudo = np.where(np.isnan(crudo), np.nanmean(crudo), crudo)
    return crudo * 12.0 / crudo.sum(), proporciones


def grupos_circulares(marcas: list[bool]) -> list[list[int]]:
    """Meses marcados que están juntos, considerando diciembre vecino de enero. Índices 0..11 en orden."""
    if all(marcas) or not any(marcas):
        return []
    inicio = next(i for i in range(12) if not marcas[i])  # se empieza a recorrer después de un mes sin marca
    grupos: list[list[int]] = []
    actual: list[int] = []
    for k in range(1, 13):
        i = (inicio + k) % 12
        if marcas[i]:
            actual.append(i)
        elif actual:
            grupos.append(actual)
            actual = []
    if actual:
        grupos.append(actual)
    return grupos


def detectar(valores: list[float], mes_inicial: int, umbral: float = 1.4, minimo_mensual: float = 0.0) -> Resultado:
    v = np.asarray(valores, dtype=float)
    if len(v) < HISTORIA_MINIMA:
        return Resultado(motivo=f"historia_insuficiente: {len(v)} meses (se necesitan {HISTORIA_MINIMA})")
    if v.mean() <= 0 or v.mean() < minimo_mensual:
        return Resultado(motivo="poco_volumen")
    indices, proporciones = indices_estacionales(valores, mes_inicial)
    mitad = 1 + (umbral - 1) / 2  # un año "cuenta" si ese mes superó al menos la mitad del umbral
    temporadas: list[Temporada] = []
    for g in grupos_circulares([bool(x >= umbral) for x in indices]):
        obs = [p for m in g for p in proporciones[m]]
        por_mes = [len(proporciones[m]) for m in g]
        consistencia = float(np.mean([p >= mitad for p in obs])) if obs else 0.0
        anios = min(por_mes) if por_mes else 0
        confianza = "alta" if consistencia >= 0.8 and anios >= 2 else "media" if consistencia >= 0.6 and anios >= 1 else "baja"
        temporadas.append(Temporada(
            meses=[m + 1 for m in g], factor=round(float(indices[g].mean()), 2),
            participacion=round(float(indices[g].sum() / 12.0), 3), confianza=confianza,
            consistencia=round(consistencia, 2), anios_observados=int(anios),
        ))
    temporadas.sort(key=lambda t: -t.factor)
    return Resultado(indices=[round(float(x), 3) for x in indices], temporadas=temporadas,
                     fuera_de_temporada=[m + 1 for m in range(12) if indices[m] <= 0.6])


def describir(t: Temporada) -> str:
    """Texto para el dueño: "enero a febrero: se vende 3.1 veces el promedio (38 % del año)"."""
    rango = MESES[t.meses[0] - 1] if len(t.meses) == 1 else f"{MESES[t.meses[0] - 1]} a {MESES[t.meses[-1] - 1]}"
    return f"{rango}: se vende {t.factor:g} veces el promedio ({round(t.participacion * 100)} % del año)"
