"""
SALUD FINANCIERA (cálculo puro). Recibe totales mensuales que el API ya consultó con permisos (ventas, costo,
devoluciones, compras, caja, planilla, cobros por medio de pago) y el inventario de hoy, y devuelve:
estado de resultados por mes, indicadores con semáforo y explicación sencilla, punto de equilibrio,
flujo de efectivo, IVA estimado y avisos sobre lo que falta registrar.

No sustituye a un contador: solo cuenta lo que se registra en SPVI. Los semáforos comparan el negocio
consigo mismo (su propia historia) o usan reglas generales prudentes, y siempre explican el porqué.
"""
from __future__ import annotations

from dataclasses import dataclass, field

IVA = 0.12


def _r(x: float) -> float:
    return round(float(x), 2)


def _pct(a: float, b: float) -> float | None:
    return None if not b else round(a / b * 100, 1)


def _var(nuevo: float, viejo: float) -> float | None:
    return None if not viejo else round((nuevo - viejo) / abs(viejo) * 100, 1)


@dataclass
class Mes:
    mes: str                      # "2026-10"
    ventas_con_iva: float = 0     # total cobrado en ventas confirmadas (incluye IVA)
    iva_debito: float = 0         # IVA de esas ventas
    costo: float = 0              # costo de lo vendido (costo promedio al vender)
    tickets: int = 0
    devol_con_iva: float = 0      # devoluciones (incluyen IVA)
    devol_costo: float = 0        # costo de lo devuelto que REGRESÓ al inventario
    compras: float = 0            # total de compras confirmadas
    egresos_caja: float = 0       # gastos pagados desde caja (no incluye retiros a bóveda)
    ingresos_caja: float = 0      # otros ingresos de caja (no ventas)
    personal: float = 0           # planilla aprobada o pagada: devengado + cuota patronal
    gastos_otros: float = 0       # gastos pagados FUERA de caja (alquiler, luz, servicios…): módulo Gastos
    cobros: dict = field(default_factory=dict)  # por medio de pago (efectivo ya sin el cambio)


@dataclass
class Indicador:
    clave: str
    nombre: str
    valor: float | None
    unidad: str                   # "%", "Q", "días", "veces"
    semaforo: str                 # verde | amarillo | rojo | gris (informativo / sin datos)
    explicacion: str              # qué significa, en palabras sencillas
    detalle: str                  # cómo se calculó
    meta: str = ""                # a qué apuntar


def resultados(m: Mes) -> dict:
    """Estado de resultados del mes (todo SIN IVA, porque el IVA no es del negocio sino de la SAT)."""
    ventas = m.ventas_con_iva - m.iva_debito
    devol = m.devol_con_iva / (1 + IVA)  # nota de crédito: también devuelve su IVA
    ventas_netas = ventas - devol
    costo = m.costo - m.devol_costo
    bruta = ventas_netas - costo
    gastos = m.personal + m.egresos_caja + m.gastos_otros
    operativa = bruta - gastos
    return {
        "mes": m.mes, "ventas_netas": _r(ventas_netas), "costo_ventas": _r(costo), "utilidad_bruta": _r(bruta),
        "margen_bruto": _pct(bruta, ventas_netas), "personal": _r(m.personal), "gastos_caja": _r(m.egresos_caja), "otros_gastos": _r(m.gastos_otros),
        # Los ingresos de caja NO son utilidad: en una tienda suelen ser efectivo puesto para dar cambio.
        # Solo cuentan en el flujo de efectivo.
        "otros_ingresos": _r(m.ingresos_caja), "utilidad_operativa": _r(operativa),
        "margen_operativo": _pct(operativa, ventas_netas), "tickets": m.tickets,
        "ticket_promedio": _r(m.ventas_con_iva / m.tickets) if m.tickets else None,
    }


def _suma(filas: list[dict]) -> dict:
    claves = ["ventas_netas", "costo_ventas", "utilidad_bruta", "personal", "gastos_caja", "otros_gastos", "otros_ingresos", "utilidad_operativa", "tickets"]
    t = {k: _r(sum(f[k] for f in filas)) for k in claves}
    t["margen_bruto"] = _pct(t["utilidad_bruta"], t["ventas_netas"])
    t["margen_operativo"] = _pct(t["utilidad_operativa"], t["ventas_netas"])
    t["meses"] = len(filas)
    return t


def _q(x: float) -> str:
    return f"Q{x:,.2f}"


def analizar(meses: list[dict], inventario: dict, mes_actual: str, compras_con_iva: bool = True) -> dict:
    """meses: del más antiguo al más reciente (puede incluir el mes en curso). inventario: {costo, sin_movimiento_costo, dias_sin_movimiento}."""
    ms = [Mes(**m) for m in meses]
    completos = [m for m in ms if m.mes < mes_actual]          # el mes en curso está incompleto
    er = [resultados(m) for m in ms]
    er_c = [r for r in er if r["mes"] < mes_actual]
    u12, a12 = er_c[-12:], er_c[-24:-12]
    t12, ta12 = _suma(u12) if u12 else None, _suma(a12) if len(a12) == 12 else None
    ind: list[Indicador] = []
    avisos: list[str] = []

    # ── Márgenes ──
    if t12:
        mb = t12["margen_bruto"]
        prev = ta12["margen_bruto"] if ta12 else None
        cambio = None if mb is None or prev is None else round(mb - prev, 1)
        sem = "gris" if mb is None else ("rojo" if cambio is not None and cambio <= -5 else "amarillo" if cambio is not None and cambio <= -2 else "verde")
        ind.append(Indicador("margen_bruto", "Margen bruto", mb, "%", sem,
            f"De cada Q100 que vende (sin IVA), le quedan Q{mb:.0f} después de pagar lo que le costó la mercadería." if mb is not None else "Sin ventas para calcularlo.",
            f"(Ventas netas − costo de lo vendido) ÷ ventas netas, últimos {t12['meses']} meses completos." + (f" Hace un año era {prev}% ({'+' if cambio >= 0 else ''}{cambio} puntos)." if cambio is not None else ""),
            "Que no baje: si baja, revise precios, descuentos y costos de compra."))
        mo = t12["margen_operativo"]
        ind.append(Indicador("margen_operativo", "Margen después de gastos", mo, "%",
            "gris" if mo is None else "rojo" if mo < 0 else "amarillo" if mo < 5 else "verde",
            ("Después de sueldos y gastos registrados el negocio PIERDE dinero." if mo is not None and mo < 0 else
             f"Después de sueldos y gastos registrados le quedan Q{mo:.0f} de cada Q100 vendidos." if mo is not None else "Sin ventas para calcularlo."),
            "(Utilidad bruta − sueldos − gastos de caja − otros gastos) ÷ ventas netas, últimos 12 meses. Solo cuenta los gastos registrados en SPVI.",
            "Positivo y estable. Menos de 5 % deja poco margen para imprevistos."))

    # ── Crecimiento ──
    if len(er_c) >= 13:
        ult, hace = er_c[-1], er_c[-13]
        v = _var(ult["ventas_netas"], hace["ventas_netas"])
        ind.append(Indicador("crecimiento_mes", f"Ventas de {ult['mes']} contra el mismo mes del año pasado", v, "%",
            "gris" if v is None else "rojo" if v < -10 else "amarillo" if v < 0 else "verde",
            ("Vendió más que el mismo mes del año pasado." if v is not None and v >= 0 else "Vendió menos que el mismo mes del año pasado." if v is not None else "No hay ventas del año pasado para comparar."),
            f"{_q(ult['ventas_netas'])} contra {_q(hace['ventas_netas'])} (sin IVA). Se compara con el mismo mes para no confundir la temporada con el crecimiento.",
            "Crecer al menos lo que suben los precios (inflación)."))
    if t12 and ta12:
        v = _var(t12["ventas_netas"], ta12["ventas_netas"])
        ind.append(Indicador("crecimiento_anual", "Ventas de los últimos 12 meses contra los 12 anteriores", v, "%",
            "gris" if v is None else "rojo" if v < -10 else "amarillo" if v < 0 else "verde",
            "Tendencia del año completo: mejor indicador que un solo mes.", f"{_q(t12['ventas_netas'])} contra {_q(ta12['ventas_netas'])} (sin IVA).", "Positivo."))

    # ── Punto de equilibrio (últimos 3 meses completos) ──
    u3 = er_c[-3:]
    if len(u3) == 3:
        s3 = _suma(u3)
        fijos = (s3["personal"] + s3["gastos_caja"] + s3["otros_gastos"]) / 3
        mbr = (s3["utilidad_bruta"] / s3["ventas_netas"]) if s3["ventas_netas"] else 0
        if fijos > 0 and mbr > 0:
            equilibrio = fijos / mbr
            cobertura = (s3["ventas_netas"] / 3) / equilibrio
            ind.append(Indicador("equilibrio", "Ventas mínimas al mes para no perder", _r(equilibrio), "Q",
                "rojo" if cobertura < 1 else "amarillo" if cobertura < 1.2 else "verde",
                f"Con sus gastos actuales necesita vender al menos {_q(equilibrio)} al mes (sin IVA) para no perder. "
                f"En los últimos 3 meses vendió en promedio {_q(s3['ventas_netas'] / 3)}: " + ("está POR DEBAJO." if cobertura < 1 else f"{(cobertura - 1) * 100:.0f} % por encima."),
                f"Gastos del mes ({_q(fijos)}: sueldos, gastos de caja y otros gastos) ÷ margen bruto ({mbr * 100:.1f} %), promedio de los últimos 3 meses.",
                "Vender al menos 20 % por encima del mínimo."))
        elif fijos == 0:
            avisos.append("No hay sueldos (planilla aprobada) ni gastos registrados: no se puede calcular cuánto necesita vender para no perder.")

    # ── Inventario ──
    inv = float(inventario.get("costo") or 0)
    costo90 = sum(r["costo_ventas"] for r in er_c[-3:])
    if inv > 0 and costo90 > 0:
        dias = inv / (costo90 / 90)
        ind.append(Indicador("dias_inventario", "Días de inventario", round(dias), "días",
            "verde" if dias <= 90 else "amarillo" if dias <= 180 else "rojo",
            f"Al ritmo de venta de los últimos 3 meses, lo que tiene en bodega alcanzaría para {dias:.0f} días.",
            f"Inventario a costo ({_q(inv)}) ÷ costo de lo vendido por día en los últimos 90 días.",
            "Entre 30 y 90 días en comercio general: menos arriesga quedarse sin producto; más es dinero detenido."))
    if inv > 0 and t12:
        gm = t12["utilidad_bruta"] / inv
        ind.append(Indicador("rendimiento_inventario", "Rendimiento del inventario", round(gm, 2), "veces",
            "verde" if gm >= 2 else "amarillo" if gm >= 1 else "rojo",
            f"Cada Q1 que tiene invertido en mercadería le dejó Q{gm:.2f} de utilidad bruta en el último año.",
            f"Utilidad bruta de 12 meses ({_q(t12['utilidad_bruta'])}) ÷ inventario a costo de hoy ({_q(inv)}).",
            "Más de 2: el inventario trabaja bien. Menos de 1: hay demasiado dinero en mercadería que rinde poco."))
    sm = float(inventario.get("sin_movimiento_costo") or 0)
    dsm = int(inventario.get("dias_sin_movimiento") or 180)
    if inv > 0:
        p = sm / inv * 100
        ind.append(Indicador("inventario_detenido", f"Inventario sin ventas en {dsm} días", round(p, 1), "%",
            "verde" if p < 15 else "amarillo" if p < 30 else "rojo",
            f"{_q(sm)} de su inventario no se ha vendido en {dsm} días: es dinero detenido (revise «Baja rotación»; los productos de temporada vienen marcados).",
            f"Valor a costo de productos con existencia y sin ventas en ese plazo ÷ inventario total ({_q(inv)}).", "Menos de 15 %."))

    # ── Personal y ticket ──
    if t12 and t12["ventas_netas"]:
        pp = _pct(t12["personal"], t12["ventas_netas"])
        if t12["personal"] > 0:
            ind.append(Indicador("peso_personal", "Sueldos sobre ventas", pp, "%", "gris",
                f"De cada Q100 vendidos, Q{pp:.0f} se van en sueldos y cuotas patronales.", "Planilla aprobada o pagada de 12 meses ÷ ventas netas.", "Depende del giro: compárelo mes a mes."))
        else:
            avisos.append("No hay planillas aprobadas en los últimos 12 meses: los sueldos NO están en el análisis (márgenes y punto de equilibrio salen más altos de lo real).")
    if len(er_c) >= 13 and er_c[-1]["ticket_promedio"] and er_c[-13]["ticket_promedio"]:
        tp, tpa = er_c[-1]["ticket_promedio"], er_c[-13]["ticket_promedio"]
        ind.append(Indicador("ticket", "Compra promedio por cliente", tp, "Q", "gris",
            f"Cada venta fue en promedio de {_q(tp)} (con IVA); hace un año era {_q(tpa)} ({_var(tp, tpa):+.1f} %).", f"Total vendido ÷ número de ventas en {er_c[-1]['mes']}.", "Que suba: combos, sugerencias en caja."))

    # ── Crédito ──
    if completos:
        ult = completos[-1]
        cred = float(ult.cobros.get("CREDITO", 0))
        total = sum(float(v) for v in ult.cobros.values())
        if total > 0 and cred > 0:
            pc = cred / total * 100
            ind.append(Indicador("ventas_credito", "Ventas al crédito (por cobrar)", round(pc, 1), "%", "amarillo" if pc > 30 else "gris",
                f"En {ult.mes}, {_q(cred)} se vendieron al crédito: es dinero que aún no entra a caja.", "Pagos con medio CRÉDITO ÷ total cobrado del mes.", "Llevar control de cobros."))

    # ── IVA estimado (orientativo) y efectivo ──
    iva = []
    for m in ms:
        debito = m.iva_debito - m.devol_con_iva * IVA / (1 + IVA)
        credito = m.compras * (IVA / (1 + IVA) if compras_con_iva else IVA)
        iva.append({"mes": m.mes, "debito": _r(debito), "credito_estimado": _r(credito), "a_pagar_estimado": _r(max(debito - credito, 0)), "remanente_estimado": _r(max(credito - debito, 0))})
    efectivo = [{"mes": m.mes, "cobros": {k: _r(v) for k, v in sorted(m.cobros.items())}, "total_cobrado": _r(sum(m.cobros.values()) - m.cobros.get("CREDITO", 0)),
                 "egresos_caja": _r(m.egresos_caja), "otros_gastos": _r(m.gastos_otros), "personal": _r(m.personal), "compras": _r(m.compras),
                 "neto_estimado": _r(sum(m.cobros.values()) - m.cobros.get("CREDITO", 0) + m.ingresos_caja - m.egresos_caja - m.gastos_otros - m.personal - m.compras)} for m in ms]

    # ── Resumen en palabras ──
    resumen: list[str] = []
    if t12:
        resumen.append(f"En los últimos {t12['meses']} meses vendió {_q(t12['ventas_netas'])} sin IVA y le quedaron {_q(t12['utilidad_bruta'])} después del costo de la mercadería ({t12['margen_bruto']} %).")
        resumen.append(("Después de sueldos y gastos registrados, el resultado fue una PÉRDIDA de " + _q(-t12["utilidad_operativa"]) + ".") if t12["utilidad_operativa"] < 0
                       else f"Después de sueldos y gastos registrados le quedaron {_q(t12['utilidad_operativa'])} ({t12['margen_operativo']} %).")
    rojos = [i.nombre for i in ind if i.semaforo == "rojo"]
    resumen.append(("Atención en: " + ", ".join(rojos) + ".") if rojos else "Ningún indicador en rojo.")
    if not any(m.egresos_caja or m.gastos_otros for m in ms):
        avisos.append("No hay gastos registrados (ni en caja ni en Gastos). Registre el alquiler, la luz y demás en Caja › Gastos para un análisis completo.")
    avisos.append("Análisis orientativo con lo que se registra en SPVI; no sustituye la contabilidad ni la declaración de impuestos. El IVA de compras es estimado (SPVI no guarda el IVA de cada factura de compra).")

    return {
        "estado_resultados": er, "ultimos_12": t12, "anteriores_12": ta12,
        "indicadores": [i.__dict__ for i in ind], "iva": iva, "efectivo": efectivo, "resumen": resumen, "avisos": avisos,
        "inventario": {"costo": _r(inv), "sin_movimiento_costo": _r(sm)},
    }
