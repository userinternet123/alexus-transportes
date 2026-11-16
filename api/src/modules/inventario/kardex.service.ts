import { Injectable } from '@nestjs/common';
import { Prisma, TipoMovimiento } from '@prisma/client';
import { reglaNegocio } from '../../common/errors';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { Tx } from '../../common/prisma/prisma.service';
import { Num } from '../../common/money';
import { calcularMovimiento, ResultadoCalculo } from './kardex.calculo';

export interface MovimientoInput {
  bodegaId: number;
  productoId: number;
  tipo: TipoMovimiento;
  cantidad: Num; // positiva; el signo lo define el tipo
  costoUnitario?: Num;
  documentoTipo: 'VENTA' | 'COMPRA' | 'AJUSTE' | 'TRASLADO' | 'DEVOLUCION' | 'INICIAL';
  documentoId: number;
  usuarioId: number;
  observacion?: string;
  productoNombre?: string;
}

/**
 * ÚNICO punto del sistema que modifica existencias.
 *
 * Garantías (lo que el sistema actual NO tenía — allí el stock se calculaba
 * en el formulario leyendo un Label y se enviaba el valor absoluto):
 *  - Bloqueo pesimista de la fila de existencia (SELECT ... FOR UPDATE):
 *    dos cajas vendiendo el mismo producto no pueden sobrevender.
 *  - Saldo y kardex se escriben en la MISMA transacción del documento.
 *  - Kardex append-only con saldo y costo después de cada movimiento.
 *
 * IMPORTANTE: llamar SIEMPRE dentro de una transacción y, en documentos con
 * varias líneas, procesar los productos ORDENADOS por id para evitar deadlocks.
 */
@Injectable()
export class KardexService {
  constructor(private readonly parametros: ParametrosService) {}

  async registrar(tx: Tx, m: MovimientoInput): Promise<ResultadoCalculo> {
    // 1) Garantiza que exista la fila (idempotente ante concurrencia)
    await tx.$executeRaw`
      INSERT INTO existencias (producto_id, bodega_id, cantidad, costo_promedio, actualizado_en)
      VALUES (${m.productoId}, ${m.bodegaId}, 0, 0, now())
      ON CONFLICT (producto_id, bodega_id) DO NOTHING`;

    // 2) Bloquea la fila hasta el COMMIT
    const filas = await tx.$queryRaw<{ id: number; cantidad: Prisma.Decimal; costo_promedio: Prisma.Decimal }[]>`
      SELECT id, cantidad, costo_promedio
      FROM existencias
      WHERE producto_id = ${m.productoId} AND bodega_id = ${m.bodegaId}
      FOR UPDATE`;
    const ex = filas[0];

    // 3) Cálculo puro
    const r = calcularMovimiento({
      saldo: ex.cantidad,
      costoPromedio: ex.costo_promedio,
      tipo: m.tipo,
      cantidad: m.cantidad,
      costoUnitario: m.costoUnitario,
      permitirNegativo: await this.parametros.booleano('inventario.permitir_negativo'),
      productoNombre: m.productoNombre,
    });

    // 4) Persistencia: saldo + movimiento
    await tx.existencia.update({
      where: { id: ex.id },
      data: { cantidad: r.saldo, costoPromedio: r.costoPromedio },
    });
    await tx.movimientoInventario.create({
      data: {
        bodegaId: m.bodegaId,
        productoId: m.productoId,
        tipo: m.tipo,
        cantidad: r.cantidadFirmada,
        costoUnitario: r.costoUnitario,
        saldoCantidad: r.saldo,
        saldoCostoPromedio: r.costoPromedio,
        documentoTipo: m.documentoTipo,
        documentoId: m.documentoId,
        usuarioId: m.usuarioId,
        observacion: m.observacion,
      },
    });
    return r;
  }

  /** Bodega principal de la sucursal (por defecto para ventas y compras). */
  async bodegaPrincipal(tx: Tx, sucursalId: number): Promise<number> {
    const b = await tx.bodega.findFirst({
      where: { sucursalId, activo: true },
      orderBy: [{ esPrincipal: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!b) throw reglaNegocio('SIN_BODEGA', 'La sucursal no tiene bodegas configuradas');
    return b.id;
  }

  /** Valida que la bodega pertenezca a la sucursal activa. */
  async validarBodega(tx: Tx, bodegaId: number, sucursalId: number): Promise<void> {
    const b = await tx.bodega.findFirst({ where: { id: bodegaId, sucursalId, activo: true }, select: { id: true } });
    if (!b) throw reglaNegocio('BODEGA_INVALIDA', `La bodega ${bodegaId} no pertenece a la sucursal activa`);
  }
}
