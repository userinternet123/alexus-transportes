from spvi_analitica.finanzas import Mes, resultados, analizar


def mes(m, **k):
    base = dict(mes=m, ventas_con_iva=1120, iva_debito=120, costo=600, tickets=10, devol_con_iva=0, devol_costo=0, compras=700, egresos_caja=50, ingresos_caja=0, personal=100, cobros={"EFECTIVO": 1000, "TARJETA": 120})
    base.update(k)
    return base


def serie(n=25, desde=(2024, 10), **k):
    y, m = desde
    out = []
    for _ in range(n):
        out.append(mes(f"{y}-{m:02d}", **k))
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def ind(r, clave):
    return next((i for i in r["indicadores"] if i["clave"] == clave), None)


def test_estado_de_resultados_a_mano():
    r = resultados(Mes(**mes("2026-10", devol_con_iva=112, devol_costo=50, ingresos_caja=10)))
    # ventas 1120 - IVA 120 = 1000; devolución 112 con IVA = 100 sin IVA -> 900 netas
    assert r["ventas_netas"] == 900 and r["costo_ventas"] == 550 and r["utilidad_bruta"] == 350
    assert r["margen_bruto"] == 38.9 and r["utilidad_operativa"] == 200 and r["margen_operativo"] == 22.2  # los 10 de ingreso de caja NO son utilidad
    assert r["ticket_promedio"] == 112


def test_mes_en_curso_no_entra_en_los_12_meses():
    r = analizar(serie(25), {}, mes_actual="2026-10")  # el último de la serie es 2026-10 (en curso)
    assert r["ultimos_12"]["meses"] == 12 and len(r["estado_resultados"]) == 25
    assert r["ultimos_12"]["ventas_netas"] == 12 * 1000


def test_negocio_estable_todo_en_verde_menos_inventario():
    r = analizar(serie(25), {"costo": 2000, "sin_movimiento_costo": 100, "dias_sin_movimiento": 180}, mes_actual="2026-10")
    assert ind(r, "margen_bruto")["valor"] == 40.0 and ind(r, "margen_bruto")["semaforo"] == "verde"
    assert ind(r, "margen_operativo")["valor"] == 25.0 and ind(r, "crecimiento_anual")["valor"] == 0.0
    d = ind(r, "dias_inventario")  # 2000 / (1800/90) = 100 días -> amarillo
    assert d["valor"] == 100 and d["semaforo"] == "amarillo"
    assert ind(r, "rendimiento_inventario")["valor"] == 2.4 and ind(r, "inventario_detenido")["valor"] == 5.0


def test_punto_de_equilibrio_a_mano():
    r = analizar(serie(25), {}, mes_actual="2026-10")
    e = ind(r, "equilibrio")  # gastos 150 / margen 40 % = 375; vende 1000 -> 2.67 veces: verde
    assert e["valor"] == 375.0 and e["semaforo"] == "verde" and "por encima" in e["explicacion"]


def test_margen_que_cae_se_pone_en_rojo():
    datos = serie(25)
    for d in datos[12:]:
        d["costo"] = 680  # el último año: margen baja de 40 % a 32 %
    r = analizar(datos, {}, mes_actual="2026-10")
    mb = ind(r, "margen_bruto")
    assert mb["semaforo"] == "rojo" and "puntos" in mb["detalle"]


def test_perdida_en_rojo_y_dicha_claramente():
    r = analizar(serie(25, personal=600), {}, mes_actual="2026-10")
    assert ind(r, "margen_operativo")["semaforo"] == "rojo" and ind(r, "equilibrio")["semaforo"] == "rojo"
    assert any("PÉRDIDA" in s for s in r["resumen"]) and any("Atención en" in s for s in r["resumen"])


def test_avisos_de_lo_que_falta_registrar():
    r = analizar(serie(25, personal=0, egresos_caja=0), {}, mes_actual="2026-10")
    texto = " ".join(r["avisos"])
    assert "planillas" in texto and "No hay gastos registrados" in texto and "no sustituye" in texto
    assert ind(r, "equilibrio") is None


def test_iva_estimado():
    r = analizar([mes("2026-09", devol_con_iva=112, compras=1120)], {}, mes_actual="2026-10")
    i = r["iva"][0]  # débito 120 - 12 de la devolución = 108; crédito 1120 con IVA -> 120
    assert i["debito"] == 108 and i["credito_estimado"] == 120 and i["a_pagar_estimado"] == 0 and i["remanente_estimado"] == 12
    sin = analizar([mes("2026-09", compras=1000)], {}, mes_actual="2026-10", compras_con_iva=False)["iva"][0]
    assert sin["credito_estimado"] == 120


def test_ventas_al_credito():
    datos = serie(25)
    datos[-2]["cobros"] = {"EFECTIVO": 500, "CREDITO": 620}
    c = ind(analizar(datos, {}, mes_actual="2026-10"), "ventas_credito")
    assert c["valor"] == 55.4 and c["semaforo"] == "amarillo"


def test_poca_historia_no_falla():
    r = analizar(serie(5, desde=(2026, 6)), {}, mes_actual="2026-10")
    assert ind(r, "crecimiento_anual") is None and ind(r, "crecimiento_mes") is None and r["ultimos_12"]["meses"] == 4
    assert analizar([], {}, mes_actual="2026-10")["indicadores"] == []


def test_efectivo():
    e = analizar([mes("2026-09", ingresos_caja=20)], {}, mes_actual="2026-10")["efectivo"][0]
    assert e["total_cobrado"] == 1120 and e["neto_estimado"] == 1120 + 20 - 50 - 100 - 700


def test_gastos_fuera_de_caja_entran_al_resultado():
    from spvi_analitica.finanzas import resultados, Mes
    r = resultados(Mes(**mes("2026-10", gastos_otros=1500)))
    # ventas netas 1000, costo 600 → bruta 400; gastos: sueldos 100 + caja 50 + otros 1500 → resultado −1250
    assert r["otros_gastos"] == 1500 and r["utilidad_operativa"] == -1250


def test_gastos_fuera_de_caja_en_equilibrio_y_efectivo():
    r = analizar(serie(25, gastos_otros=300), {}, mes_actual="2026-10")
    e = ind(r, "equilibrio")  # gastos 100 + 50 + 300 = 450 / margen 40 % = 1125 > ventas 1000 → rojo
    assert e["valor"] == 1125.0 and e["semaforo"] == "rojo"
    ef = r["efectivo"][-2]
    assert ef["otros_gastos"] == 300 and ef["neto_estimado"] == 1120 - 50 - 300 - 100 - 700


def test_aviso_de_gastos_no_aparece_si_hay_gastos_fuera_de_caja():
    r = analizar(serie(25, egresos_caja=0, gastos_otros=200), {}, mes_actual="2026-10")
    assert not any("No hay gastos registrados" in a for a in r["avisos"])
