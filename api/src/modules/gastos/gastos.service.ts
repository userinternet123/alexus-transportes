/**
 * GASTOS FUERA DE CAJA: alquiler, luz, internet, servicios… pagados por transferencia, tarjeta, cheque, débito o con
 * efectivo que no sale de la caja. Respetan el cierre del día, se anulan con motivo y entran al análisis financiero.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hoyGuatemala } from '../agente/agente.contexto';
import { CierreService } from '../cierre/cierre.service';
import { CATEGORIAS_BASICAS, filtroGastosZ, gastoZ, rangoMes } from './gastos.logica';
import { z } from 'zod';

const sucursal = (ctx: Ctx) => ctx.sucursalId ?? (() => { throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sucursal de trabajo'); })();
const fechaDb = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

@Injectable()
export class GastosService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly cierre: CierreService) {}

  /** Las categorías básicas se crean solas la primera vez (el negocio puede agregar más). */
  async categorias() {
    if ((await this.prisma.categoriaGasto.count()) === 0) await this.prisma.categoriaGasto.createMany({ data: CATEGORIAS_BASICAS.map((nombre) => ({ nombre })), skipDuplicates: true });
    return { data: await this.prisma.categoriaGasto.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }) };
  }

  async crearCategoria(ctx: Ctx, body: unknown) {
    const { nombre } = z.object({ nombre: z.string().trim().min(3, 'Escriba el nombre (al menos 3 letras)').max(60) }).parse(body);
    const existe = await this.prisma.categoriaGasto.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
    if (existe) return { data: existe, message: 'Esa categoría ya existía' };
    const c = await this.prisma.categoriaGasto.create({ data: { nombre } });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'CategoriaGasto', entidadId: String(c.id), despues: { nombre } });
    return { data: c, message: 'Categoría creada' };
  }

  async listar(ctx: Ctx, query: unknown) {
    const f = filtroGastosZ.parse(query ?? {});
    const mes = f.mes ?? hoyGuatemala().slice(0, 7);
    const [desde, hasta] = rangoMes(mes);
    const where: Prisma.GastoWhereInput = { sucursalId: sucursal(ctx), fecha: { gte: fechaDb(desde), lte: fechaDb(hasta) }, ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}), ...(f.incluirAnulados ? {} : { estado: 'REGISTRADO' }) };
    const filas = await this.prisma.gasto.findMany({ where, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], include: { categoria: { select: { nombre: true } }, proveedor: { select: { razonSocial: true, nombreComercial: true, nombres: true, apellidos: true } }, usuario: { select: { nombre: true } } } });
    const vigentes = filas.filter((g) => g.estado === 'REGISTRADO');
    const porCategoria = new Map<string, number>();
    for (const g of vigentes) porCategoria.set(g.categoria.nombre, (porCategoria.get(g.categoria.nombre) ?? 0) + Number(g.monto));
    return { data: {
      mes,
      total: Math.round(vigentes.reduce((a, g) => a + Number(g.monto), 0) * 100) / 100,
      porCategoria: [...porCategoria].map(([categoria, monto]) => ({ categoria, monto: Math.round(monto * 100) / 100 })).sort((a, b) => b.monto - a.monto),
      gastos: filas.map((g) => ({ id: g.id, fecha: g.fecha.toISOString().slice(0, 10), categoria: g.categoria.nombre, categoriaId: g.categoriaId, concepto: g.concepto, monto: Number(g.monto), medioPago: g.medioPago, documento: g.documento, estado: g.estado, motivoAnulacion: g.motivoAnulacion, registro: g.usuario.nombre,
        proveedor: g.proveedor ? (g.proveedor.razonSocial || g.proveedor.nombreComercial || [g.proveedor.nombres, g.proveedor.apellidos].filter(Boolean).join(' ')) : null })),
    } };
  }

  async crear(ctx: Ctx, body: unknown) {
    const d = gastoZ(hoyGuatemala()).parse(body);
    const sucursalId = sucursal(ctx);
    const gasto = await this.prisma.$transaction(async (tx) => {
      await this.cierre.validarPeriodoAbierto(tx, sucursalId, fechaDb(d.fecha)); // un día cerrado no admite gastos nuevos
      if (!(await tx.categoriaGasto.findFirst({ where: { id: d.categoriaId, activo: true } }))) throw reglaNegocio('CATEGORIA_INVALIDA', 'Elija una categoría válida');
      return tx.gasto.create({ data: { sucursalId, categoriaId: d.categoriaId, fecha: fechaDb(d.fecha), concepto: d.concepto, monto: new Prisma.Decimal(d.monto), medioPago: d.medioPago, proveedorId: d.proveedorId ?? null, documento: d.documento || null, usuarioId: ctx.usuario.sub } });
    });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Gasto', entidadId: String(gasto.id), despues: d as unknown as Prisma.InputJsonValue });
    return { data: { id: gasto.id }, message: `Gasto de Q${d.monto.toFixed(2)} registrado` };
  }

  async anular(ctx: Ctx, id: number, body: unknown) {
    const { motivo } = z.object({ motivo: z.string().trim().min(10, 'Explique el motivo (al menos 10 caracteres)').max(300) }).parse(body);
    const g = await this.prisma.gasto.findFirst({ where: { id, sucursalId: sucursal(ctx) } });
    if (!g) throw noEncontrado('Gasto', id);
    if (g.estado === 'ANULADO') return { message: 'Ya estaba anulado' };
    await this.prisma.$transaction(async (tx) => {
      await this.cierre.validarPeriodoAbierto(tx, g.sucursalId, g.fecha);
      await tx.gasto.update({ where: { id }, data: { estado: 'ANULADO', motivoAnulacion: motivo } });
    });
    await this.audit.registrar(ctx, { accion: 'ANULAR', entidad: 'Gasto', entidadId: String(id), antes: { estado: g.estado }, despues: { estado: 'ANULADO', motivo } });
    return { message: 'Gasto anulado' };
  }
}
