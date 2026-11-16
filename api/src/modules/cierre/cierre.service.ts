import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import type { Ctx } from '../../common/auth/tipos';
import { conflicto, reglaNegocio } from '../../common/errors';
import { aYmd, fechaContable } from '../../common/fecha';
import { D, r2 } from '../../common/money';
import { Db, PrismaService, Tx } from '../../common/prisma/prisma.service';

/**
 * CIERRE DIARIO por sucursal = bloqueo del período contable del día.
 *
 *   1. Todas las cajas del día deben estar CERRADAS (arqueadas).
 *   2. Se consolida: ventas, anulaciones, devoluciones, costo, utilidad,
 *      compras, diferencias de caja y totales por medio de pago.
 *   3. Desde ese momento NO se pueden crear ni anular documentos con esa
 *      fecha contable. Reabrir requiere permiso especial y queda auditado.
 *
 * (En el sistema actual existía la columna TVenta.Cerrado pero ningún proceso.)
 */
@Injectable()
export class CierreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Guardia usada por Ventas, Compras, Caja y Devoluciones. */
  async validarPeriodoAbierto(db: Db, sucursalId: number, fecha: Date): Promise<void> {
    const cierre = await db.cierreDiario.findUnique({ where: { sucursalId_fecha: { sucursalId, fecha } } });
    if (cierre?.estado === 'CERRADO') {
      throw reglaNegocio('PERIODO_CERRADO', `El día ${aYmd(fecha)} ya fue cerrado en esta sucursal. Use una devolución/nota de crédito con fecha actual.`);
    }
  }

  /** Vista previa (pre-cierre): lo que se va a consolidar y lo que bloquea el cierre. */
  async previsualizar(sucursalId: number, fecha: Date, db: Db = this.prisma) {
    const [sesionesAbiertas, confirmadas, anuladas, devoluciones, compras, diferencias, pagos, cambio, felPendientes] = await Promise.all([
      db.cajaSesion.findMany({
        where: { fechaContable: fecha, estado: 'ABIERTA', caja: { sucursalId } },
        select: { id: true, caja: { select: { nombre: true } }, usuario: { select: { nombre: true } }, abiertaEn: true },
      }),
      db.venta.aggregate({
        where: { sucursalId, fechaContable: fecha, tipo: 'VENTA', estado: 'CONFIRMADA' },
        _count: { _all: true }, _sum: { total: true, costoTotal: true, ivaIncluido: true },
      }),
      db.venta.aggregate({ where: { sucursalId, fechaContable: fecha, tipo: 'VENTA', estado: 'ANULADA' }, _sum: { total: true } }),
      db.devolucion.aggregate({ where: { fechaContable: fecha, venta: { sucursalId } }, _sum: { total: true } }),
      db.compra.aggregate({ where: { sucursalId, fechaContable: fecha, estado: 'CONFIRMADO' }, _sum: { total: true } }),
      db.cajaSesion.aggregate({ where: { fechaContable: fecha, estado: 'CERRADA', caja: { sucursalId } }, _sum: { diferencia: true } }),
      db.ventaPago.groupBy({
        by: ['medioPago'],
        where: { venta: { sucursalId, fechaContable: fecha, tipo: 'VENTA', estado: 'CONFIRMADA' } },
        _sum: { monto: true },
      }),
      db.venta.aggregate({ where: { sucursalId, fechaContable: fecha, tipo: 'VENTA', estado: 'CONFIRMADA' }, _sum: { cambio: true } }),
      db.venta.count({ where: { sucursalId, fechaContable: fecha, tipo: 'VENTA', estado: 'CONFIRMADA', felEstado: { in: ['PENDIENTE', 'ERROR'] } } }),
    ]);

    const porMedioPago: Record<string, string> = {};
    for (const p of pagos) {
      let monto = D(p._sum.monto);
      if (p.medioPago === 'EFECTIVO') monto = monto.minus(D(cambio._sum.cambio)); // efectivo neto de vuelto
      porMedioPago[p.medioPago] = r2(monto).toFixed(2);
    }

    const ventasTotal = r2(confirmadas._sum.total);
    const costoTotal = r2(confirmadas._sum.costoTotal);
    const advertencias: string[] = [];
    if (felPendientes > 0) advertencias.push(`${felPendientes} venta(s) sin certificar en FEL`);

    return {
      fecha: aYmd(fecha),
      sucursalId,
      puedeCerrar: sesionesAbiertas.length === 0,
      bloqueos: sesionesAbiertas.map((s) => `Caja "${s.caja.nombre}" abierta por ${s.usuario.nombre}`),
      advertencias,
      resumen: {
        ventasCantidad: confirmadas._count._all,
        ventasTotal: ventasTotal.toFixed(2),
        ivaIncluido: r2(confirmadas._sum.ivaIncluido).toFixed(2),
        anulacionesTotal: r2(anuladas._sum.total).toFixed(2),
        devolucionesTotal: r2(devoluciones._sum.total).toFixed(2),
        costoTotal: costoTotal.toFixed(2),
        utilidadBruta: ventasTotal.minus(costoTotal).toFixed(2),
        margenPorcentaje: ventasTotal.gt(0) ? ventasTotal.minus(costoTotal).div(ventasTotal).times(100).toFixed(2) : '0.00',
        comprasTotal: r2(compras._sum.total).toFixed(2),
        diferenciaCajas: r2(diferencias._sum.diferencia).toFixed(2),
        porMedioPago,
      },
    };
  }

  async cerrar(ctx: Ctx, fecha: Date, observacion?: string) {
    const sucursalId = ctx.sucursalId!;
    if (fecha > fechaContable()) throw reglaNegocio('FECHA_FUTURA', 'No se puede cerrar una fecha futura');

    const data = await this.prisma.enTransaccion(async (tx: Tx) => {
      // Serializa cierres concurrentes de la misma sucursal
      await tx.$queryRaw`SELECT id FROM sucursales WHERE id = ${sucursalId} FOR UPDATE`;
      const existente = await tx.cierreDiario.findUnique({ where: { sucursalId_fecha: { sucursalId, fecha } } });
      if (existente?.estado === 'CERRADO') throw conflicto('YA_CERRADO', 'El día ya está cerrado');

      const p = await this.previsualizar(sucursalId, fecha, tx);
      if (!p.puedeCerrar) throw reglaNegocio('CIERRE_BLOQUEADO', `No se puede cerrar: ${p.bloqueos.join('; ')}`, p.bloqueos);

      const datos = {
        estado: 'CERRADO',
        ventasCantidad: p.resumen.ventasCantidad,
        ventasTotal: p.resumen.ventasTotal,
        anulacionesTotal: p.resumen.anulacionesTotal,
        devolucionesTotal: p.resumen.devolucionesTotal,
        costoTotal: p.resumen.costoTotal,
        utilidadBruta: p.resumen.utilidadBruta,
        comprasTotal: p.resumen.comprasTotal,
        diferenciaCajas: p.resumen.diferenciaCajas,
        porMedioPago: p.resumen.porMedioPago,
        usuarioId: ctx.usuario.sub,
        cerradoEn: new Date(),
        observacion: observacion ?? null,
      };
      const cierre = existente
        ? await tx.cierreDiario.update({ where: { id: existente.id }, data: datos })
        : await tx.cierreDiario.create({ data: { sucursalId, fecha, ...datos } });
      await this.audit.registrar(ctx, { accion: 'CIERRE_DIARIO', entidad: 'CierreDiario', entidadId: cierre.id, despues: { ...p, advertencias: p.advertencias } }, tx);
      return { cierre, advertencias: p.advertencias };
    });
    return { data, message: `Día ${aYmd(fecha)} cerrado correctamente` };
  }

  async reabrir(ctx: Ctx, fecha: Date, motivo: string) {
    const sucursalId = ctx.sucursalId!;
    const cierre = await this.prisma.cierreDiario.findUnique({ where: { sucursalId_fecha: { sucursalId, fecha } } });
    if (!cierre || cierre.estado !== 'CERRADO') throw reglaNegocio('NO_CERRADO', 'Ese día no está cerrado');
    await this.prisma.cierreDiario.update({ where: { id: cierre.id }, data: { estado: 'REABIERTO' } });
    await this.audit.registrar(ctx, { accion: 'REABRIR_CIERRE', entidad: 'CierreDiario', entidadId: cierre.id, antes: cierre, despues: { motivo } });
    return { message: `Día ${aYmd(fecha)} reabierto. Motivo registrado en auditoría.` };
  }

  async listar(ctx: Ctx, desde: Date, hasta: Date) {
    const data = await this.prisma.cierreDiario.findMany({
      where: { sucursalId: ctx.sucursalId!, fecha: { gte: desde, lte: hasta } },
      orderBy: { fecha: 'desc' },
    });
    return { data };
  }
}
