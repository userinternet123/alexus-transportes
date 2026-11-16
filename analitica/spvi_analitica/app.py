"""
SERVICIO LOCAL DE ANALÍTICA (FastAPI). Escucha solo en este equipo (127.0.0.1) y exige un token compartido con
el API de SPVI. No lee la base de datos: el API le envía únicamente las series que necesita calcular, ya filtradas
por permisos. Sin documentación pública (/docs desactivado).
"""
from __future__ import annotations

import hmac
import math
import os
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from . import __version__
from .demanda import estimar
from .finanzas import analizar
from .temporadas import describir, detectar

def _cargar_archivo_env() -> None:
    """Como servicio de Windows, la configuración vive en un archivo protegido (ANALITICA_ENV=ruta).
    Lo ya definido en el entorno tiene prioridad; líneas vacías y comentarios (#) se ignoran."""
    ruta = os.environ.get("ANALITICA_ENV")
    if not ruta or not os.path.isfile(ruta):
        return
    with open(ruta, encoding="utf-8-sig") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            clave, valor = linea.split("=", 1)
            os.environ.setdefault(clave.strip(), valor.strip().strip('"').strip("'"))


_cargar_archivo_env()
TOKEN = os.environ.get("ANALITICA_TOKEN", "")
PERMITIDOS = {h.strip() for h in os.environ.get("ANALITICA_HOSTS", "127.0.0.1,::1").split(",") if h.strip()}

app = FastAPI(title="SPVI Analítica", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)


@app.exception_handler(RequestValidationError)
async def datos_invalidos(_request: Request, exc: RequestValidationError):
    """422 sin repetir lo recibido: no se devuelven cifras del negocio en un error, y un valor inválido
    (como un número infinito) no puede romper la respuesta."""
    detalles = [{"campo": ".".join(str(x) for x in e.get("loc", ())[1:]), "mensaje": str(e.get("msg", ""))[:200]} for e in exc.errors()[:20]]
    return JSONResponse({"error": "Datos inválidos", "detalles": detalles}, status_code=422)


@app.middleware("http")
async def solo_local(request: Request, siguiente):
    """Defensa adicional: aunque alguien lo publique por error en la red, solo responde a este equipo."""
    origen = request.client.host if request.client else ""
    if origen not in PERMITIDOS:
        return JSONResponse({"error": "Solo se atiende desde este equipo"}, status_code=403)
    return await siguiente(request)


def verificar_token(x_spvi_token: Annotated[str | None, Header()] = None) -> None:
    if not TOKEN:
        raise HTTPException(503, "El motor analítico no tiene configurado ANALITICA_TOKEN")
    if not x_spvi_token or not hmac.compare_digest(x_spvi_token.encode(), TOKEN.encode()):
        raise HTTPException(401, "Token inválido")


def _finitos(v: list[float]) -> list[float]:
    if any(not math.isfinite(x) or x < 0 for x in v):
        raise ValueError("los valores deben ser números positivos o cero")
    return v


class SerieIn(BaseModel):
    clave: str = Field(min_length=1, max_length=60)
    nombre: str = Field(min_length=1, max_length=120)
    inicio: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    valores: list[float] = Field(min_length=1, max_length=120)
    _v = field_validator("valores")(lambda cls, v: _finitos(v))


class DetectarIn(BaseModel):
    series: list[SerieIn] = Field(max_length=2000)
    umbral: float = Field(default=1.4, ge=1.1, le=4)
    minimo_mensual: float = Field(default=0, ge=0)


class ProductoIn(BaseModel):
    id: int
    historial: list[float] = Field(max_length=20)
    existencia: float
    decimales: bool = False
    _h = field_validator("historial")(lambda cls, v: _finitos(v))


class DemandaIn(BaseModel):
    productos: list[ProductoIn] = Field(max_length=10000)
    seguridad: float = Field(default=0.15, ge=0, le=1)


@app.get("/salud")
def salud() -> dict:
    return {"estado": "ok", "version": __version__}


@app.post("/v1/temporadas/detectar", dependencies=[Depends(verificar_token)])
def temporadas_detectar(d: DetectarIn) -> dict:
    salida = []
    for s in d.series:
        r = detectar(s.valores, int(s.inicio[5:7]), d.umbral, d.minimo_mensual)
        salida.append({
            "clave": s.clave, "nombre": s.nombre, "motivo": r.motivo, "indices": r.indices, "fuera_de_temporada": r.fuera_de_temporada,
            "temporadas": [{**t.__dict__, "descripcion": describir(t)} for t in r.temporadas],
        })
    return {"series": salida, "metodo": "Descomposición clásica: proporción contra el promedio móvil centrado de 12 meses, mediana entre años"}


@app.post("/v1/temporadas/demanda", dependencies=[Depends(verificar_token)])
def temporadas_demanda(d: DemandaIn) -> dict:
    filas = []
    for p in d.productos:
        e = estimar(p.historial, max(p.existencia, 0.0), d.seguridad, p.decimales)
        filas.append({"id": p.id, **e.__dict__})
    filas.sort(key=lambda f: -f["sugerido"])
    return {"productos": filas}


class MesFinanzas(BaseModel):
    mes: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    ventas_con_iva: float = 0
    iva_debito: float = 0
    costo: float = 0
    tickets: int = Field(default=0, ge=0)
    devol_con_iva: float = 0
    devol_costo: float = 0
    compras: float = 0
    egresos_caja: float = 0
    ingresos_caja: float = 0
    personal: float = 0
    gastos_otros: float = 0  # gastos pagados fuera de caja (módulo Gastos)
    cobros: dict[str, float] = Field(default_factory=dict)


class FinanzasIn(BaseModel):
    meses: list[MesFinanzas] = Field(max_length=60)
    inventario: dict[str, float] = Field(default_factory=dict)
    mes_actual: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    compras_con_iva: bool = True


@app.post("/v1/finanzas/analizar", dependencies=[Depends(verificar_token)])
def finanzas_analizar(d: FinanzasIn) -> dict:
    return analizar([m.model_dump() for m in d.meses], d.inventario, d.mes_actual, d.compras_con_iva)
