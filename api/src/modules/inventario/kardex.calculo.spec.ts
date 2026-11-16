import { calcularMovimiento } from './kardex.calculo';

describe('Kardex — costo promedio ponderado', () => {
  it('primera compra fija el costo', () => {
    const r = calcularMovimiento({ saldo: 0, costoPromedio: 0, tipo: 'ENTRADA_COMPRA', cantidad: 10, costoUnitario: 5 });
    expect(r.saldo.toNumber()).toBe(10);
    expect(r.costoPromedio.toNumber()).toBe(5);
  });

  it('segunda compra promedia', () => {
    // 10 u @5 + 30 u @7 = 260 / 40 = 6.5
    const r = calcularMovimiento({ saldo: 10, costoPromedio: 5, tipo: 'ENTRADA_COMPRA', cantidad: 30, costoUnitario: 7 });
    expect(r.saldo.toNumber()).toBe(40);
    expect(r.costoPromedio.toNumber()).toBe(6.5);
  });

  it('la venta sale al costo promedio y no lo altera', () => {
    const r = calcularMovimiento({ saldo: 40, costoPromedio: 6.5, tipo: 'SALIDA_VENTA', cantidad: 15 });
    expect(r.cantidadFirmada.toNumber()).toBe(-15);
    expect(r.costoUnitario.toNumber()).toBe(6.5);
    expect(r.saldo.toNumber()).toBe(25);
  });

  it('bloquea sobreventa (bug del sistema actual)', () => {
    expect(() => calcularMovimiento({ saldo: 2, costoPromedio: 5, tipo: 'SALIDA_VENTA', cantidad: 3 })).toThrow(/insuficiente/);
  });

  it('permite negativo solo si está parametrizado', () => {
    const r = calcularMovimiento({ saldo: 2, costoPromedio: 5, tipo: 'SALIDA_VENTA', cantidad: 3, permitirNegativo: true });
    expect(r.saldo.toNumber()).toBe(-1);
  });

  it('rechaza cantidades no positivas', () => {
    expect(() => calcularMovimiento({ saldo: 5, costoPromedio: 1, tipo: 'AJUSTE_NEGATIVO', cantidad: 0 })).toThrow();
  });
});
