import importlib
import os
import pytest
from fastapi.testclient import TestClient


def cliente(hosts="testclient", token="t0k3n-secreto"):
    os.environ["ANALITICA_HOSTS"] = hosts
    os.environ["ANALITICA_TOKEN"] = token
    import spvi_analitica.app as m
    importlib.reload(m)
    return TestClient(m.app)


SERIE = {"clave": "categoria:3", "nombre": "Útiles", "inicio": "2023-11", "valores": [100.0] * 2 + [350, 300] + [100.0] * 8 + [100, 100, 350, 300] + [100.0] * 8 + [100, 100, 350, 300] + [100.0] * 8}
H = {"X-SPVI-Token": "t0k3n-secreto"}


def test_salud_y_sin_documentacion_publica():
    c = cliente()
    assert c.get("/salud").json()["estado"] == "ok"
    assert c.get("/docs").status_code == 404 and c.get("/openapi.json").status_code == 404


def test_token():
    c = cliente()
    assert c.post("/v1/temporadas/detectar", json={"series": [SERIE]}).status_code == 401
    assert c.post("/v1/temporadas/detectar", json={"series": [SERIE]}, headers={"X-SPVI-Token": "otro"}).status_code == 401
    r = c.post("/v1/temporadas/detectar", json={"series": [SERIE]}, headers=H)
    assert r.status_code == 200 and r.json()["series"][0]["temporadas"][0]["meses"] == [1, 2]


def test_sin_token_configurado_no_atiende():
    c = cliente(token="")
    assert c.post("/v1/temporadas/detectar", json={"series": [SERIE]}, headers=H).status_code == 503


def test_solo_desde_este_equipo():
    c = cliente(hosts="127.0.0.1,::1")  # el cliente de pruebas no es 127.0.0.1
    assert c.get("/salud").status_code == 403


@pytest.mark.parametrize("cambio", [{"inicio": "2026-13"}, {"valores": [-1.0] * 36}, {"valores": [1.0] * 121}, {"clave": ""}])
def test_datos_invalidos(cambio):
    c = cliente()
    assert c.post("/v1/temporadas/detectar", json={"series": [{**SERIE, **cambio}]}, headers=H).status_code == 422


def test_infinito_rechazado():
    c = cliente()
    cuerpo = '{"series": [{"clave": "a", "nombre": "a", "inicio": "2023-11", "valores": [1e999]}]}'
    assert c.post("/v1/temporadas/detectar", content=cuerpo, headers={**H, "Content-Type": "application/json"}).status_code == 422


def test_demanda():
    c = cliente()
    r = c.post("/v1/temporadas/demanda", json={"productos": [{"id": 1, "historial": [100, 120, 140], "existencia": 50}, {"id": 2, "historial": [10], "existencia": 100}]}, headers=H).json()
    assert [p["id"] for p in r["productos"]] == [1, 2] and r["productos"][0]["sugerido"] == 134 and r["productos"][1]["sugerido"] == 0


def test_error_no_repite_los_datos_recibidos():
    c = cliente()
    r = c.post("/v1/temporadas/detectar", json={"series": [{**SERIE, "valores": [123456.78] * 35 + [-5.0]}]}, headers=H)
    assert r.status_code == 422 and "123456.78" not in r.text and r.json()["error"] == "Datos inválidos"


def test_lee_su_configuracion_de_un_archivo(tmp_path):
    archivo = tmp_path / "analitica.env"
    archivo.write_text("\ufeff# motor analítico\nANALITICA_TOKEN=desde-el-archivo-123456789012\n\nOTRA=x\n", encoding="utf-8")
    os.environ.pop("ANALITICA_TOKEN", None)
    os.environ["ANALITICA_ENV"] = str(archivo)
    os.environ["ANALITICA_HOSTS"] = "testclient"
    import spvi_analitica.app as m
    importlib.reload(m)
    c = TestClient(m.app)
    assert m.TOKEN == "desde-el-archivo-123456789012"  # con BOM y comentarios, igual lo lee
    assert c.post("/v1/temporadas/detectar", json={"series": [SERIE]}, headers={"X-SPVI-Token": "desde-el-archivo-123456789012"}).status_code == 200
    os.environ["ANALITICA_TOKEN"] = "del-entorno-tiene-prioridad-1234"
    importlib.reload(m)
    assert m.TOKEN == "del-entorno-tiene-prioridad-1234"
    os.environ.pop("ANALITICA_ENV")


def test_finanzas_por_api():
    c = cliente()
    meses = [{"mes": f"2026-0{i}", "ventas_con_iva": 1120, "iva_debito": 120, "costo": 600, "tickets": 10, "personal": 100, "egresos_caja": 50} for i in range(1, 10)]
    r = c.post("/v1/finanzas/analizar", json={"meses": meses, "mes_actual": "2026-10", "inventario": {"costo": 2000}}, headers=H)
    assert r.status_code == 200 and r.json()["ultimos_12"]["meses"] == 9
    assert c.post("/v1/finanzas/analizar", json={"meses": meses, "mes_actual": "2026-13"}, headers=H).status_code == 422
    assert c.post("/v1/finanzas/analizar", json={"meses": meses, "mes_actual": "2026-10"}).status_code == 401


def test_finanzas_por_la_ruta_http_incluye_gastos_fuera_de_caja():
    """Lo que manda el API (con gastos_otros) debe llegar al cálculo: antes el modelo de la ruta lo descartaba."""
    c = cliente()
    meses = []
    for i in range(25):
        y, m = 2024 + (9 + i) // 12, (9 + i) % 12 + 1
        meses.append({"mes": f"{y}-{m:02d}", "ventas_con_iva": 1120, "iva_debito": 120, "costo": 600, "tickets": 50, "personal": 100, "egresos_caja": 50, "gastos_otros": 300})
    r = c.post("/v1/finanzas/analizar", json={"meses": meses, "inventario": {}, "mes_actual": meses[-1]["mes"]}, headers=H)
    assert r.status_code == 200, r.text
    mes = r.json()["estado_resultados"][-2]
    # ventas netas 1000 − costo 600 = bruta 400; − sueldos 100 − caja 50 − otros 300 = −50
    assert mes["otros_gastos"] == 300 and mes["utilidad_bruta"] == 400 and mes["utilidad_operativa"] == -50
