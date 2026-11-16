import { D } from '../../common/money';
import { calcularVenta, validarPagos } from './venta.calculo';

const linea = (o: Partial<Parameters<typeof calcularVenta>[0][0]> = {}) => ({
  productoId: 1, descripcion: 'Aceite 1L', cantidad: 2, precioLista: 25, porcentajeDescuento: 0, topeDescuento: 10, exentoIva: false, ...o,
});

describe('calcularVenta', () => {
  it('calcula totales con IVA incluido', () => {
    const r = calcularVenta([linea()], 12);
    expect(r.total.toFixed(2)).toBe('50.00');
    expect(r.ivaIncluido.toFixed(2)).toBe('5.36'); // 50 * 12/112
  });

  it('aplica descuento dentro del tope', () => {
    const r = calcularVenta([linea({ porcentajeDescuento: 10 })], 12);
    expect(r.lineas[0].precioUnitario.toFixed(2)).toBe('22.50');
    expect(r.descuentoTotal.toFixed(2)).toBe('5.00');
    expect(r.total.toFixed(2)).toBe('45.00');
  });

  it('rechaza descuento sobre el tope del rol', () => {
    expect(() => calcularVenta([linea({ porcentajeDescuento: 15 })], 12)).toThrow(/excede/);
  });

  it('respeta cantidad máxima con descuento', () => {
    expect(() => calcularVenta([linea({ porcentajeDescuento: 5, cantidad: 6, cantidadMaximaDescuento: 5 })], 12)).toThrow(/hasta 5/);
  });

  it('producto exento no genera IVA', () => {
    expect(calcularVenta([linea({ exentoIva: true })], 12).ivaIncluido.toNumber()).toBe(0);
  });
});

describe('validarPagos', () => {
  it('calcula vuelto con efectivo', () => {
    expect(validarPagos(D(45), [{ medioPago: 'EFECTIVO', monto: 50 }]).cambio.toFixed(2)).toBe('5.00');
  });
  it('pago mixto exacto', () => {
    expect(validarPagos(D(100), [{ medioPago: 'TARJETA', monto: 60 }, { medioPago: 'EFECTIVO', monto: 40 }]).cambio.toNumber()).toBe(0);
  });
  it('rechaza pago insuficiente', () => {
    expect(() => validarPagos(D(100), [{ medioPago: 'EFECTIVO', monto: 99 }])).toThrow(/insuficiente/);
  });
  it('tarjeta no puede exceder el total', () => {
    expect(() => validarPagos(D(100), [{ medioPago: 'TARJETA', monto: 120 }])).toThrow();
  });
});
