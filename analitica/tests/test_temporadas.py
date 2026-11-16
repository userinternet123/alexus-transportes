import numpy as np
import pytest
from spvi_analitica.temporadas import detectar, grupos_circulares, describir


def serie(meses=36, inicio_mes=11, base=100.0, picos=None, tendencia=0.0, ruido=0.1, semilla=1, anomalia=None):
    """Ventas mensuales sintéticas con un patrón conocido. anomalia = (indice_t, factor) para un solo mes."""
    rng = np.random.default_rng(semilla)
    picos = picos or {}
    v = []
    for t in range(meses):
        m = (inicio_mes - 1 + t) % 12 + 1
        x = base * (1 + tendencia) ** t * picos.get(m, 1.0) * (1 + rng.uniform(-ruido, ruido))
        if anomalia and t == anomalia[0]:
            x *= anomalia[1]
        v.append(x)
    return v


def test_temporada_escolar_enero_febrero():
    r = detectar(serie(picos={1: 3.5, 2: 3.0}), 11)
    assert len(r.temporadas) == 1
    t = r.temporadas[0]
    assert t.meses == [1, 2] and t.confianza == "alta" and 2.0 < t.factor < 2.8
    assert describir(t).startswith("enero a febrero: se vende")


def test_navidad_cruza_diciembre_y_enero():
    t = detectar(serie(picos={12: 3.0, 1: 2.0}), 11).temporadas[0]
    assert t.meses == [12, 1], "diciembre y enero son vecinos: una sola temporada que empieza en diciembre"


def test_crecer_no_es_temporada():
    r = detectar(serie(tendencia=0.03, ruido=0.08), 11)
    assert r.temporadas == [], f"una tienda que crece 3 % al mes no tiene temporada: {r.temporadas}"


def test_ruido_sin_patron_no_da_temporadas_confiables():
    for semilla in range(20):
        r = detectar(serie(ruido=0.3, semilla=semilla), 11)
        assert all(t.confianza != "alta" for t in r.temporadas), f"semilla {semilla}: {r.temporadas}"


def test_dos_temporadas_en_el_anio():
    r = detectar(serie(picos={1: 3.0, 2: 2.6, 5: 2.4}, meses=48), 11)
    assert sorted(t.meses for t in r.temporadas) == [[1, 2], [5]]


def test_pico_de_un_solo_anio_no_es_temporada_confiable():
    # 36 meses: enero tiene 2 observaciones; una es anómala (x4) -> como mucho confianza baja
    r = detectar(serie(anomalia=(14, 4.0)), 11)  # t=14 -> enero 2025
    assert all(t.confianza == "baja" for t in r.temporadas)
    # 48 meses: 3 observaciones; la mediana ignora el año raro -> no hay temporada
    r = detectar(serie(meses=48, anomalia=(14, 4.0)), 11)
    assert r.temporadas == []


def test_con_tendencia_y_temporada_detecta_la_temporada():
    t = detectar(serie(picos={1: 3.0}, tendencia=0.02), 11).temporadas
    assert [x.meses for x in t] == [[1]]


def test_fuera_de_temporada():
    r = detectar(serie(picos={1: 3.0, 2: 3.0, 6: 0.3, 7: 0.3}, ruido=0.05), 11)
    assert r.fuera_de_temporada == [6, 7]


def test_indices_promedian_uno():
    r = detectar(serie(picos={1: 3.5}), 11)
    assert abs(np.mean(r.indices) - 1) < 1e-6 and len(r.indices) == 12


def test_historia_insuficiente():
    r = detectar(serie(meses=18), 11)
    assert r.temporadas == [] and r.motivo.startswith("historia_insuficiente")


def test_poco_volumen_y_ceros():
    assert detectar(serie(base=3), 11, minimo_mensual=10).motivo == "poco_volumen"
    assert detectar([0.0] * 36, 1).motivo == "poco_volumen"
    v = [0.0] * 12 + serie(meses=24, picos={1: 3.0}, inicio_mes=11)  # producto nuevo: un año sin ventas
    r = detectar(v, 11)
    assert r.motivo is None  # no falla


@pytest.mark.parametrize("inicio", range(1, 13))
def test_cualquier_mes_de_inicio(inicio):
    # el mismo patrón (pico en marzo) se detecta igual sin importar en qué mes empiece la historia
    assert [t.meses for t in detectar(serie(picos={3: 3.0}, inicio_mes=inicio), inicio).temporadas] == [[3]]


def test_grupos_circulares():
    m = [False] * 12
    assert grupos_circulares(m) == [] and grupos_circulares([True] * 12) == []
    m[11] = m[0] = m[1] = True
    assert grupos_circulares(m) == [[11, 0, 1]]
    m2 = [False] * 12; m2[2] = m2[5] = True
    assert grupos_circulares(m2) == [[2], [5]]
