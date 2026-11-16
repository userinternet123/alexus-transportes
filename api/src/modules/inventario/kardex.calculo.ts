import { TipoMovimiento } from '@prisma/client';
import { reglaNegocio } from '../../common/errors';
import { D, Decimal, Num, r3, r4 } from '../../common/money';

/** Tipos que SUMAN existencia. El resto restan. */
export const TIPOS_ENTRADA: ReadonlySet<TipoMovimiento> = new Set<TipoMovimiento>([
  'INVENTARIO_INICIAL',
  'ENTRADA_COMPRA',
  'ANULACION_VENTA',
  'DEVOLUCION_CLIENTE',
  'AJUSTE_POSITIVO',
  'TRASLADO_ENTRADA',
]);

/** Tipos de entrada que NO revalorizan el costo promedio (regresan al costo con que salieron). */
export const ENTRADAS_A_COSTO_HISTORICO: ReadonlySet<TipoMovimiento> = new Set<TipoMovimiento>([
  'ANULACION_VENTA',
  'DEVOLUCION_CLIENTE',
]);

export interface EntradaCalculo {
  saldo: Num;
  costoPromedio: Num;
  tipo: TipoMovimiento;
  cantidad: Num; // siempre positiva
  costoUnitario?: Num; // requerido para compras / inventario inicial / traslado entrada
  permitirNegativo?: boolean;
  productoNombre?: string;
}

export interface ResultadoCalculo {
  cantidadFirmada: Decimal;
  costoUnitario: Decimal;
  saldo: Decimal;
  costoPromedio: Decimal;
}

/**
 * Lógica pura del kardex (sin BD => 100% testeable).
 * Método de valuación: COSTO PROMEDIO PONDERADO MÓVIL.
 */
export function calcularMovimiento(e: EntradaCalculo): ResultadoCalculo {
  const cantidad = r3(e.cantidad);
  if (cantidad.lte(0)) throw reglaNegocio('CANTIDAD_INVALIDA', 'La cantidad debe ser mayor a cero');

  const saldo = D(e.saldo);
  const costoProm = D(e.costoPromedio);

  if (TIPOS_ENTRADA.has(e.tipo)) {
    const costoEntrada = e.costoUnitario != null ? r4(e.costoUnitario) : costoProm;
    if (costoEntrada.lt(0)) throw reglaNegocio('COSTO_INVALIDO', 'El costo no puede ser negativo');
    const nuevoSaldo = saldo.plus(cantidad);

    let nuevoCosto: Decimal;
    if (saldo.lte(0) || nuevoSaldo.lte(0)) {
      nuevoCosto = costoEntrada; // sin saldo previo valorizable
    } else if (ENTRADAS_A_COSTO_HISTORICO.has(e.tipo) && e.costoUnitario == null) {
      nuevoCosto = costoProm;
    } else {
      nuevoCosto = saldo.times(costoProm).plus(cantidad.times(costoEntrada)).div(nuevoSaldo);
    }
    return { cantidadFirmada: cantidad, costoUnitario: costoEntrada, saldo: r3(nuevoSaldo), costoPromedio: r4(nuevoCosto) };
  }

  // Salida: sale al costo promedio vigente
  const nuevoSaldo = saldo.minus(cantidad);
  if (nuevoSaldo.lt(0) && !e.permitirNegativo) {
    throw reglaNegocio(
      'STOCK_INSUFICIENTE',
      `Existencia insuficiente${e.productoNombre ? ` de "${e.productoNombre}"` : ''}: disponible ${saldo.toFixed(3)}, requerido ${cantidad.toFixed(3)}`,
      { disponible: saldo.toNumber(), requerido: cantidad.toNumber() },
    );
  }
  return { cantidadFirmada: cantidad.neg(), costoUnitario: costoProm, saldo: r3(nuevoSaldo), costoPromedio: costoProm };
}
