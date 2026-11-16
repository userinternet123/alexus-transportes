import { reglaNegocio } from '../../common/errors';
import { D, Decimal, Num, r2, suma } from '../../common/money';

export interface LineaEntrada {
  productoId: number;
  descripcion: string;
  cantidad: Num;
  precioLista: Num; // precio vigente en BD (NUNCA el que manda el cliente)
  porcentajeDescuento: Num;
  topeDescuento: Num; // máximo permitido por política para el usuario
  cantidadMaximaDescuento?: Num | null;
  exentoIva: boolean;
}

export interface LineaCalculada {
  productoId: number;
  descripcion: string;
  cantidad: Decimal;
  precioLista: Decimal;
  porcentajeDescuento: Decimal;
  descuento: Decimal;
  precioUnitario: Decimal;
  subtotal: Decimal;
  ivaIncluido: Decimal;
}

export interface TotalesVenta {
  lineas: LineaCalculada[];
  subtotal: Decimal; // bruto (precio lista * cantidad)
  descuentoTotal: Decimal;
  ivaIncluido: Decimal;
  total: Decimal;
}

/**
 * Cálculo de una venta — función pura. Precios con IVA incluido (retail GT).
 * Corrige el sistema actual, donde el precio con descuento se calculaba en el
 * formulario (VentaUI) y se confiaba en el valor del cliente.
 */
export function calcularVenta(lineas: LineaEntrada[], ivaPorcentaje: Num): TotalesVenta {
  const factorIva = D(ivaPorcentaje).div(100);
  const calculadas = lineas.map<LineaCalculada>((l) => {
    const cantidad = D(l.cantidad);
    const pct = D(l.porcentajeDescuento);
    if (cantidad.lte(0)) throw reglaNegocio('CANTIDAD_INVALIDA', `Cantidad inválida para "${l.descripcion}"`);
    if (pct.lt(0) || pct.gt(100)) throw reglaNegocio('DESCUENTO_INVALIDO', `Descuento inválido para "${l.descripcion}"`);
    if (pct.gt(D(l.topeDescuento))) {
      throw reglaNegocio('DESCUENTO_NO_AUTORIZADO', `Descuento de ${pct.toFixed(2)}% excede su máximo autorizado (${D(l.topeDescuento).toFixed(2)}%) en "${l.descripcion}"`);
    }
    if (pct.gt(0) && l.cantidadMaximaDescuento != null && cantidad.gt(D(l.cantidadMaximaDescuento))) {
      throw reglaNegocio('DESCUENTO_CANTIDAD', `El descuento en "${l.descripcion}" aplica hasta ${D(l.cantidadMaximaDescuento).toFixed(0)} unidades`);
    }
    const precioLista = r2(l.precioLista);
    const descuentoUnitario = r2(precioLista.times(pct).div(100));
    const precioUnitario = precioLista.minus(descuentoUnitario);
    const subtotal = r2(precioUnitario.times(cantidad));
    const ivaIncluido = l.exentoIva ? D(0) : r2(subtotal.times(factorIva).div(factorIva.plus(1)));
    return {
      productoId: l.productoId,
      descripcion: l.descripcion,
      cantidad,
      precioLista,
      porcentajeDescuento: pct,
      descuento: r2(descuentoUnitario.times(cantidad)),
      precioUnitario,
      subtotal,
      ivaIncluido,
    };
  });

  return {
    lineas: calculadas,
    subtotal: r2(suma(calculadas.map((l) => l.precioLista.times(l.cantidad)))),
    descuentoTotal: suma(calculadas.map((l) => l.descuento)),
    ivaIncluido: suma(calculadas.map((l) => l.ivaIncluido)),
    total: suma(calculadas.map((l) => l.subtotal)),
  };
}

export interface PagoEntrada {
  medioPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'CREDITO' | 'VALE';
  monto: Num;
}

/**
 * Valida pagos mixtos y calcula el vuelto.
 * Regla: solo el EFECTIVO puede exceder el total (genera vuelto); los demás
 * medios no pueden sobrepasar el total.
 */
export function validarPagos(total: Decimal, pagos: PagoEntrada[]): { cambio: Decimal } {
  if (!pagos.length) throw reglaNegocio('SIN_PAGOS', 'Registre al menos un pago');
  const totalPagado = suma(pagos.map((p) => p.monto));
  const noEfectivo = suma(pagos.filter((p) => p.medioPago !== 'EFECTIVO').map((p) => p.monto));
  const efectivo = totalPagado.minus(noEfectivo);
  if (totalPagado.lt(total)) {
    throw reglaNegocio('PAGO_INSUFICIENTE', `Pago insuficiente: total Q${total.toFixed(2)}, pagado Q${totalPagado.toFixed(2)}`);
  }
  if (noEfectivo.gt(total)) throw reglaNegocio('PAGO_EXCEDIDO', 'Los pagos que no son en efectivo no pueden exceder el total');
  const cambio = r2(totalPagado.minus(total));
  if (cambio.gt(efectivo)) throw reglaNegocio('VUELTO_INVALIDO', 'El vuelto no puede ser mayor al efectivo recibido');
  return { cambio };
}
