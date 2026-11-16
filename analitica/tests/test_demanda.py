from spvi_analitica.demanda import estimar


def test_historia_creciente():
    e = estimar([100, 120, 140], existencia=50)
    assert e.esperado == 160 and e.tendencia == "sube" and e.confianza == "alta"
    assert e.sugerido == 134  # 160 x 1.15 - 50 = 134


def test_historia_decreciente_no_se_desploma():
    e = estimar([200, 150, 100], existencia=0)
    assert e.tendencia == "baja" and abs(e.esperado - 66.667) < 0.01  # límite: la mitad del promedio ponderado


def test_un_solo_anio_confianza_baja():
    e = estimar([80], existencia=10)
    assert e.esperado == 80 and e.confianza == "baja" and e.tendencia == "-" and e.sugerido == 82


def test_sin_historia():
    e = estimar([], existencia=5)
    assert e.esperado is None and e.sugerido == 0 and e.confianza == "sin_historia"
    assert estimar([0, 0], 5).confianza == "sin_historia"


def test_existencia_alcanza():
    e = estimar([50, 50, 50], existencia=100)
    assert e.sugerido == 0 and e.cobertura == 2.0 and e.tendencia == "estable"


def test_variable_confianza_media_o_baja():
    assert estimar([20, 100, 40], existencia=0).confianza == "baja"


def test_decimales():
    e = estimar([10.5, 12.25], existencia=1, decimales=True)
    assert e.sugerido != int(e.sugerido) or e.sugerido == round(e.sugerido, 3)
