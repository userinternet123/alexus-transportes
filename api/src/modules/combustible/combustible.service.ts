/**
 * COMBUSTIBLE: cargas por cabezal con foto del vale, rendimiento km/gal
 * tanque lleno a tanque lleno, alerta cuando el rendimiento cae y costo
 * automático en el viaje al que pertenece la carga.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { hoyGuatemala } from '../../common/fecha';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { rangoMes } from '../gastos/gastos.logica';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ViajesService } from '../viajes/viajes.service';
import { cargaZ, filtroCargasZ, r2, rendimientos, resumenRendimiento } from './combustible.logica';

const sucursal = (ctx: Ctx) => ctx.sucursalId ?? (() => { throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo'); })();
const fechaDb = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const fechaHoraDb = (s: string) => (s.length <= 10 ? new Date(`${s}T06:00:00Z`) : s.length === 16 ? new Date(`${s}:00-06:00`) : new Date(s));
const D = (n: number | null | undefined) => new Prisma.Decimal(n ?? 0);
const N = (d: unknown) => (d == null ? 0 : Number(d));

@Injectable()
export class CombustibleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parametros: ParametrosService,
    private readonly notificaciones: NotificacionesService,
    private readonly viajes: ViajesService,
  ) {}

  async listar(ctx: Ctx, query: unknown) {
    const f = filtroCargasZ.parse(query ?? {});
    const mes = f.mes ?? hoyGuatemala().slice(0, 7);
    const [desde, hasta] = rangoMes(mes);
    const sucursalId = sucursal(ctx);
    const where: Prisma.CargaCombustibleWhereInput = { sucursalId, fecha: { gte: fechaDb(desde), lt: new Date(fechaDb(hasta).getTime() + 86_400_000) }, ...(f.cabezalId ? { cabezalId: f.cabezalId } : {}), ...(f.incluirAnuladas ? {} : { anulada: false }) };
    const filas = await this.prisma.cargaCombustible.findMany({ where, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], include: { cabezal: { select: { codigo: true, placa: true, rendimientoEsperado: true } }, piloto: { select: { empleado: { select: { nombres: true, apellidos: true } } } }, viaje: { select: { numero: true } }, registradoPor: { select: { nombre: true } } } });
    // Para el rendimiento hace falta la carga llena anterior aunque sea de otro mes: se toman 12 meses del/los cabezal(es)
    const base = await this.prisma.cargaCombustible.findMany({ where: { sucursalId, anulada: false, fecha: { gte: new Date(fechaDb(desde).getTime() - 365 * 86_400_000), lt: new Date(fechaDb(hasta).getTime() + 86_400_000) }, ...(f.cabezalId ? { cabezalId: f.cabezalId } : {}) }, select: { id: true, cabezalId: true, fecha: true, odometro: true, galones: true, total: true, tanqueLleno: true } });
    const rend = rendimientos(base.map((c) => ({ ...c, odometro: N(c.odometro), galones: N(c.galones), total: N(c.total) })));
    const porCarga = new Map(rend.map((r) => [r.cargaId, r]));
    const vigentes = filas.filter((c) => !c.anulada);
    const porCabezal = new Map<number, { cabezal: string; cargas: number; galones: number; total: number; esperado: number | null; ids: Set<number> }>();
    for (const c of vigentes) {
      const e = porCabezal.get(c.cabezalId) ?? { cabezal: c.cabezal.codigo, cargas: 0, galones: 0, total: 0, esperado: N(c.cabezal.rendimientoEsperado) || null, ids: new Set<number>() };
      e.cargas += 1; e.galones += N(c.galones); e.total += N(c.total); e.ids.add(c.id); porCabezal.set(c.cabezalId, e);
    }
    return { data: {
      mes,
      totales: { ...resumenRendimiento(rend.filter((r) => vigentes.some((c) => c.id === r.cargaId)), vigentes.reduce((a, c) => a + N(c.total), 0)), cargas: vigentes.length, galones: r2(vigentes.reduce((a, c) => a + N(c.galones), 0)), total: r2(vigentes.reduce((a, c) => a + N(c.total), 0)) },
      porCabezal: [...porCabezal.entries()].map(([cabezalId, e]) => { const rr = rend.filter((r) => e.ids.has(r.cargaId)); const res = resumenRendimiento(rr, e.total); return { cabezalId, cabezal: e.cabezal, cargas: e.cargas, galones: r2(e.galones), total: r2(e.total), kmPorGalon: res.kmPorGalon, esperado: e.esperado, costoPorKm: res.costoPorKm, alerta: Boolean(res.kmPorGalon && e.esperado && res.kmPorGalon < e.esperado * 0.85) }; }).sort((a, b) => a.cabezal.localeCompare(b.cabezal)),
      cargas: filas.map((c) => ({ id: c.id, fecha: c.fecha.toISOString(), cabezal: c.cabezal.codigo, cabezalId: c.cabezalId, placa: c.cabezal.placa, piloto: c.piloto ? [c.piloto.empleado.nombres, c.piloto.empleado.apellidos].join(' ') : null, pilotoId: c.pilotoId, viaje: c.viaje?.numero ?? null, viajeId: c.viajeId,
        odometro: N(c.odometro), galones: N(c.galones), precioGalon: N(c.precioGalon), total: N(c.total), tanqueLleno: c.tanqueLleno, estacion: c.estacion, documento: c.documento, archivoId: c.archivoId, pagadoPorPiloto: c.pagadoPorPiloto, anulada: c.anulada, motivoAnulacion: c.motivoAnulacion, registro: c.registradoPor.nombre,
        kmPorGalon: porCarga.get(c.id)?.kmPorGalon ?? null, kmTramo: porCarga.get(c.id)?.km ?? null })),
    } };
  }

  async registrar(ctx: Ctx, body: unknown) {
    const d = cargaZ.parse(body);
    const sucursalId = sucursal(ctx);
    const precioGalon = d.precioGalon ?? (await this.parametros.numero('combustible.precio_galon'));
    const total = d.total ?? r2(d.galones * precioGalon);
    if (total <= 0) throw reglaNegocio('TOTAL_INVALIDO', 'El total debe ser mayor que cero');
    const fecha = fechaHoraDb(d.fecha);
    if (fecha.getTime() > Date.now() + 3_600_000) throw reglaNegocio('FECHA_FUTURA', 'La fecha de la carga no puede ser futura');
    const carga = await this.prisma.enTransaccion(async (tx) => {
      const cab = await tx.cabezal.findFirst({ where: { id: d.cabezalId, activo: true } });
      if (!cab) throw reglaNegocio('CABEZAL_INVALIDO', 'Elija un cabezal activo');
      if (d.galones > N(cab.capacidadTanque) && N(cab.capacidadTanque) > 0) throw reglaNegocio('GALONES_EXCEDEN', `El tanque del ${cab.codigo} es de ${N(cab.capacidadTanque)} gal`);
      const ultima = await tx.cargaCombustible.findFirst({ where: { cabezalId: d.cabezalId, anulada: false, fecha: { lt: fecha } }, orderBy: [{ fecha: 'desc' }], select: { odometro: true, fecha: true } });
      if (ultima && d.odometro < N(ultima.odometro)) throw reglaNegocio('ODOMETRO_MENOR', `El odómetro (${d.odometro}) es menor que el de la carga anterior (${N(ultima.odometro)} el ${ultima.fecha.toISOString().slice(0, 10)})`);
      if (d.viajeId) {
        const v = await tx.viaje.findFirst({ where: { id: d.viajeId, sucursalId } });
        if (!v) throw reglaNegocio('VIAJE_INVALIDO', 'El viaje no existe en esta sede');
        if (['LIQUIDADO', 'CANCELADO'].includes(v.estado)) throw reglaNegocio('VIAJE_CERRADO', `El viaje ${v.numero} ya está ${v.estado.toLowerCase()}`);
        if (v.cabezalId !== d.cabezalId) throw reglaNegocio('CABEZAL_DISTINTO', `El viaje ${v.numero} es del cabezal ${v.cabezalId}; la carga es de otro`);
        if (!d.pilotoId) d.pilotoId = v.pilotoId;
      }
      const c = await tx.cargaCombustible.create({ data: { sucursalId, cabezalId: d.cabezalId, pilotoId: d.pilotoId ?? cab.pilotoAsignadoId ?? null, viajeId: d.viajeId ?? null, fecha, odometro: D(d.odometro), galones: D(d.galones), precioGalon: D(precioGalon), total: D(total), tanqueLleno: d.tanqueLleno ?? true, estacion: d.estacion || null, documento: d.documento || null, archivoId: d.archivoId ?? null, pagadoPorPiloto: d.pagadoPorPiloto ?? false, registradoPorId: ctx.usuario.sub } });
      if (d.odometro > N(cab.odometro)) await tx.cabezal.update({ where: { id: cab.id }, data: { odometro: D(d.odometro) } });
      if (d.viajeId) {
        await tx.costoViaje.create({ data: { viajeId: d.viajeId, tipo: 'COMBUSTIBLE', descripcion: `${d.galones} gal${d.estacion ? ` en ${d.estacion}` : ''}`, monto: D(total), fecha, archivoId: d.archivoId ?? null, pagadoPorPiloto: d.pagadoPorPiloto ?? false, cargaId: c.id, registradoPorId: ctx.usuario.sub } });
        await this.viajes.recalcular(tx, d.viajeId);
      }
      return c;
    });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'CargaCombustible', entidadId: String(carga.id), despues: { ...d, total } as unknown as Prisma.InputJsonValue });
    await this.alertarRendimiento(carga.cabezalId, carga.id, carga.sucursalId);
    return { data: { id: carga.id, total }, message: `Carga de ${d.galones} gal (Q${total.toFixed(2)}) registrada` };
  }

  /** Si el tramo recién cerrado rinde menos que lo esperado (menos el % de tolerancia), avisa. */
  private async alertarRendimiento(cabezalId: number, cargaId: number, sucursalId: number) {
    const cab = await this.prisma.cabezal.findUnique({ where: { id: cabezalId }, select: { codigo: true, rendimientoEsperado: true } });
    const cargas = await this.prisma.cargaCombustible.findMany({ where: { cabezalId, anulada: false }, orderBy: { odometro: 'desc' }, take: 20, select: { id: true, cabezalId: true, fecha: true, odometro: true, galones: true, total: true, tanqueLleno: true } });
    const r = rendimientos(cargas.map((c) => ({ ...c, odometro: N(c.odometro), galones: N(c.galones), total: N(c.total) }))).find((x) => x.cargaId === cargaId);
    if (!r || !cab) return;
    const tolerancia = await this.parametros.numero('combustible.alerta_rendimiento');
    const esperado = N(cab.rendimientoEsperado) || (await this.parametros.numero('combustible.rendimiento_referencia'));
    if (r.kmPorGalon < esperado * (1 - tolerancia / 100)) await this.notificaciones.evento({ sucursalId, permiso: 'combustible.ver', tipo: 'rendimiento_bajo', nivel: 'aviso', titulo: `${cab.codigo} rindió ${r.kmPorGalon} km/gal`, detalle: `Esperado ${esperado} km/gal (tolerancia ${tolerancia}%). Tramo de ${r.km} km con ${r.galones} gal`, ruta: '/home/combustible' });
  }

  async anular(ctx: Ctx, id: number, body: unknown) {
    const { motivo } = z.object({ motivo: z.string().trim().min(10, 'Explique el motivo (al menos 10 caracteres)').max(300) }).parse(body);
    const c = await this.prisma.cargaCombustible.findFirst({ where: { id, sucursalId: sucursal(ctx) }, include: { costo: { include: { viaje: { select: { estado: true, numero: true } } } } } });
    if (!c) throw noEncontrado('Carga', id);
    if (c.anulada) return { message: 'Ya estaba anulada' };
    if (c.costo && ['LIQUIDADO', 'CANCELADO'].includes(c.costo.viaje.estado)) throw reglaNegocio('VIAJE_CERRADO', `La carga está en el viaje ${c.costo.viaje.numero}, que ya está ${c.costo.viaje.estado.toLowerCase()}`);
    await this.prisma.enTransaccion(async (tx) => {
      await tx.cargaCombustible.update({ where: { id }, data: { anulada: true, motivoAnulacion: motivo } });
      if (c.costo) { await tx.costoViaje.delete({ where: { id: c.costo.id } }); await this.viajes.recalcular(tx, c.costo.viajeId); }
    });
    await this.audit.registrar(ctx, { accion: 'ANULAR', entidad: 'CargaCombustible', entidadId: String(id), antes: { galones: N(c.galones), total: N(c.total) }, despues: { anulada: true, motivo } });
    return { message: 'Carga anulada' };
  }

  /** Rendimiento mensual por cabezal (últimos N meses) para la gráfica. */
  async rendimiento(ctx: Ctx, query: unknown) {
    const { meses } = z.object({ meses: z.coerce.number().int().min(1).max(24).default(6) }).parse(query ?? {});
    const desde = new Date(Date.now() - meses * 31 * 86_400_000);
    const cargas = await this.prisma.cargaCombustible.findMany({ where: { sucursalId: sucursal(ctx), anulada: false, fecha: { gte: desde } }, select: { id: true, cabezalId: true, fecha: true, odometro: true, galones: true, total: true, tanqueLleno: true, cabezal: { select: { codigo: true } } } });
    const r = rendimientos(cargas.map((c) => ({ ...c, odometro: N(c.odometro), galones: N(c.galones), total: N(c.total) })));
    const porId = new Map(cargas.map((c) => [c.id, c]));
    const series = new Map<string, Map<string, { km: number; gal: number }>>();
    for (const x of r) { const c = porId.get(x.cargaId)!; const mes = c.fecha.toISOString().slice(0, 7); const s = series.get(c.cabezal.codigo) ?? new Map(); const m = s.get(mes) ?? { km: 0, gal: 0 }; m.km += x.km; m.gal += x.galones; s.set(mes, m); series.set(c.cabezal.codigo, s); }
    return { data: [...series.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cabezal, s]) => ({ cabezal, meses: [...s.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, m]) => ({ mes, km: r2(m.km), galones: r2(m.gal), kmPorGalon: m.gal > 0 ? r2(m.km / m.gal) : null })) })) };
  }
}
