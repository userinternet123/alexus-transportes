/**
 * VOUCHERS, TRANSFERENCIAS Y CHEQUES: verificar los cobros que no son en efectivo,
 * como se hace con los depósitos bancarios (número, banco y foto del comprobante).
 */
import { Body, Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { validar } from '../../common/pipes/zod';
import { PrismaService } from '../../common/prisma/prisma.service';

const MEDIOS = ['TARJETA', 'TRANSFERENCIA', 'CHEQUE'] as const;
const fechaDia = (f: string, fin = false) => new Date(`${f}T${fin ? '23:59:59.999' : '00:00:00'}-06:00`); // hora de Guatemala

@Controller('cobros')
export class CobrosController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @Permisos('caja.conciliar')
  async listar(@Contexto() ctx: Ctx, @Query() q: Record<string, string>) {
    const f = validar(z.object({
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      medio: z.enum(MEDIOS).optional(), estado: z.enum(['PENDIENTE', 'VERIFICADO', 'RECHAZADO']).optional(),
    }), q);
    const where = {
      medioPago: f.medio ? f.medio : { in: [...MEDIOS] },
      ...(f.estado ? { estado: f.estado } : {}),
      venta: { sucursalId: ctx.sucursalId!, tipo: 'VENTA' as const, estado: 'CONFIRMADA' as const, fecha: { gte: fechaDia(f.desde), lte: fechaDia(f.hasta, true) } },
    };
    const pagos = await this.prisma.ventaPago.findMany({
      where,
      include: { venta: { select: { id: true, serie: true, numero: true, fecha: true, total: true, cliente: { select: { nit: true, razonSocial: true, nombres: true, apellidos: true } }, vendedor: { select: { nombre: true } } } } },
      orderBy: [{ venta: { fecha: 'desc' } }],
      take: 1000,
    });
    // Totales por medio y estado (para cuadrar contra el cierre del POS o el estado de cuenta)
    const totales: Record<string, Record<string, number>> = {};
    for (const p of pagos) {
      totales[p.medioPago] ??= { PENDIENTE: 0, VERIFICADO: 0, RECHAZADO: 0, total: 0 };
      totales[p.medioPago][p.estado] += Number(p.monto);
      totales[p.medioPago].total += Number(p.monto);
    }
    return { data: pagos, totales };
  }

  @Put(':id')
  @Permisos('caja.conciliar')
  async verificar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const d = validar(z.object({
      estado: z.enum(['PENDIENTE', 'VERIFICADO', 'RECHAZADO']),
      referencia: z.string().trim().max(60).nullable().optional(),
      banco: z.string().trim().max(40).nullable().optional(),
      comprobanteId: z.string().uuid().nullable().optional(),
      nota: z.string().trim().max(300).nullable().optional(),
    }), body);
    const antes = await this.prisma.ventaPago.findFirst({ where: { id, venta: { sucursalId: ctx.sucursalId! } } });
    if (!antes) throw noEncontrado('Cobro', id);
    if (!(MEDIOS as readonly string[]).includes(antes.medioPago)) throw reglaNegocio('MEDIO', 'Solo se verifican tarjeta, transferencia y cheque');
    if (d.estado === 'RECHAZADO' && !d.nota) throw reglaNegocio('NOTA_REQUERIDA', 'Explique por qué se rechaza (por ejemplo: cheque sin fondos)');
    if (d.estado === 'VERIFICADO' && !(d.referencia ?? antes.referencia)) throw reglaNegocio('REFERENCIA_REQUERIDA', 'Indique el número de voucher, de transferencia o de cheque');
    const despues = await this.prisma.ventaPago.update({
      where: { id },
      data: {
        estado: d.estado, referencia: d.referencia ?? antes.referencia, banco: d.banco ?? antes.banco,
        comprobanteId: d.comprobanteId === undefined ? antes.comprobanteId : d.comprobanteId, nota: d.nota ?? null,
        verificadoPorId: d.estado === 'PENDIENTE' ? null : ctx.usuario.sub, verificadoEn: d.estado === 'PENDIENTE' ? null : new Date(),
      },
    });
    await this.audit.registrar(ctx, { accion: `COBRO_${d.estado}`, entidad: 'VentaPago', entidadId: id, antes, despues });
    return { data: despues, message: d.estado === 'VERIFICADO' ? 'Cobro verificado' : d.estado === 'RECHAZADO' ? 'Cobro marcado como rechazado' : 'Cobro devuelto a pendiente' };
  }
}
