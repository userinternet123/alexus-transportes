/**
 * CARGAS DE COMBUSTIBLE: cada carga guarda odómetro, galones y precio; al llenar el tanque se cierra el tramo y se
 * calcula el rendimiento real (km/gal). Si cae más del % permitido frente al esperado del cabezal, se marca la carga
 * y se avisa en la campana. Si la carga es de un viaje, entra como costo de ese viaje.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { parseFecha, sumarDias } from '../../common/fecha';
import { D, r2 } from '../../common/money';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { validar } from '../../common/pipes/zod';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { bajoRendimiento, cargaZ, filtroCargasZ, saltoMaximo, totalCarga, tramo, variacionPct } from './combustible.logica';
import { z } from 'zod';

const nombre = (e?: { nombres: string; apellidos: string } | null) => (e ? `${e.nombres} ${e.apellidos}`.trim() : null);

@Injectable()
export class CombustibleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parametros: ParametrosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private sucursal(ctx: Ctx) {
    if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo');
    return ctx.sucursalId;
  }

  /** Piloto ligado al usuario, si no tiene permiso de ver todas las cargas. */
  private async pilotoPropio(ctx: Ctx): Promise<number | null> {
    if (tienePermiso(ctx.usuario, 'combustible.ver')) return null;
    const u = await this.prisma.usuario.findUnique({ where: { id: ctx.usuario.sub }, select: { empleado: { select: { piloto: { select: { id: true } } } } } });
    return u?.empleado?.piloto?.id ?? null;
  }

  /** `mias`: el piloto (sin permiso de ver todo) consulta solo sus cargas. */
  async listar(ctx: Ctx, query: unknown, mias = false) {
    const f = validar(filtroCargasZ, query ?? {});
    const propio = mias ? await this.pilotoPropio(ctx) : null;
    if (mias && propio == null && !tienePermiso(ctx.usuario, 'combustible.ver')) throw prohibido('Su usuario no está ligado a un piloto');
    const where: Prisma.CargaCombustibleWhereInput = {
      sucursalId: this.sucursal(ctx),
      ...(f.incluirAnuladas ? {} : { anulada: false }),
      ...(f.desde || f.hasta ? { fecha: { ...(f.desde ? { gte: parseFecha(f.desde) } : {}), ...(f.hasta ? { lt: sumarDias(parseFecha(f.hasta), 1) } : {}) } } : {}),
      ...(f.cabezalId ? { cabezalId: f.cabezalId } : {}),
      ...(propio != null ? { pilotoId: propio } : f.pilotoId ? { pilotoId: f.pilotoId } : {}),
      ...(f.soloAlertas ? { alerta: true } : {}),
    };
    const filas = await this.prisma.cargaCombustible.findMany({
      where, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: f.limit,
      include: { cabezal: { select: { codigo: true, placa: true, rendimientoEsperado: true } }, piloto: { select: { empleado: { select: { nombres: true, apellidos: true } } } }, viaje: { select: { numero: true } }, registradoPor: { select: { nombre: true } } },
    });
    const vigentes = filas.filter((c) => !c.anulada);
    const galones = vigentes.reduce((a, c) => a.plus(D(c.galones)), D(0));
    const total = vigentes.reduce((a, c) => a.plus(D(c.total)), D(0));
    const conTramo = vigentes.filter((c) => c.rendimiento != null);
    const kmT = conTramo.reduce((a, c) => a.plus(D(c.kmRecorridos)), D(0));
    const galT = conTramo.reduce((a, c) => a.plus(D(c.galonesTramo)), D(0));
    return { data: {
      resumen: { cargas: vigentes.length, galones: galones.toDecimalPlaces(3), total: r2(total), precioPromedio: galones.gt(0) ? total.div(galones).toDecimalPlaces(2) : null, rendimiento: galT.gt(0) ? kmT.div(galT).toDecimalPlaces(2) : null, alertas: vigentes.filter((c) => c.alerta).length },
      cargas: filas.map((c) => ({
        id: c.id, fecha: c.fecha, cabezal: c.cabezal.codigo, placa: c.cabezal.placa, cabezalId: c.cabezalId, piloto: nombre(c.piloto?.empleado), viaje: c.viaje?.numero ?? null, viajeId: c.viajeId,
        odometro: c.odometro, galones: c.galones, precioGalon: c.precioGalon, total: c.total, tanqueLleno: c.tanqueLleno, estacion: c.estacion, documento: c.documento, archivoId: c.archivoId,
        kmRecorridos: c.kmRecorridos, rendimiento: c.rendimiento, esperado: c.cabezal.rendimientoEsperado, variacion: c.rendimiento && c.cabezal.rendimientoEsperado ? variacionPct(c.rendimiento, c.cabezal.rendimientoEsperado) : null,
        alerta: c.alerta, anulada: c.anulada, motivoAnulacion: c.motivoAnulacion, pagadoPorPiloto: c.pagadoPorPiloto, registro: c.registradoPor.nombre,
      })),
    } };
  }

  /** Rendimiento por cabezal en un período: km, galones, km/gal real contra el esperado. */
  async rendimiento(ctx: Ctx, query: unknown) {
    const f = validar(z.object({ desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), query ?? {});
    const hasta = f.hasta ? sumarDias(parseFecha(f.hasta), 1) : new Date();
    const desde = f.desde ? parseFecha(f.desde) : sumarDias(hasta, -90);
    const grupos = await this.prisma.cargaCombustible.groupBy({
      by: ['cabezalId'], where: { sucursalId: this.sucursal(ctx), anulada: false, fecha: { gte: desde, lt: hasta } },
      _sum: { galones: true, total: true, kmRecorridos: true, galonesTramo: true }, _count: { _all: true },
    });
    const alertas = await this.prisma.cargaCombustible.groupBy({ by: ['cabezalId'], where: { sucursalId: this.sucursal(ctx), anulada: false, alerta: true, fecha: { gte: desde, lt: hasta } }, _count: { _all: true } });
    const cabezales = await this.prisma.cabezal.findMany({ where: { id: { in: grupos.map((g) => g.cabezalId) } }, select: { id: true, codigo: true, placa: true, rendimientoEsperado: true } });
    const porId = new Map(cabezales.map((c) => [c.id, c]));
    const nAlertas = new Map(alertas.map((a) => [a.cabezalId, a._count._all]));
    return { data: grupos.map((g) => {
      const c = porId.get(g.cabezalId)!;
      const real = D(g._sum.galonesTramo).gt(0) ? D(g._sum.kmRecorridos).div(D(g._sum.galonesTramo)).toDecimalPlaces(2) : null;
      return { cabezalId: g.cabezalId, cabezal: c.codigo, placa: c.placa, cargas: g._count._all, galones: D(g._sum.galones).toDecimalPlaces(1), total: r2(g._sum.total), km: D(g._sum.kmRecorridos).toDecimalPlaces(0), rendimiento: real, esperado: c.rendimientoEsperado, variacion: real && c.rendimientoEsperado ? variacionPct(real, c.rendimientoEsperado) : null, alertas: nAlertas.get(g.cabezalId) ?? 0 };
    }).sort((a, b) => Number(a.variacion ?? 0) - Number(b.variacion ?? 0)) };
  }

  /** Recalcula el tramo y la alerta de una carga a partir de las anteriores del mismo cabezal. */
  private async calcularTramo(tx: Tx, cabezalId: number, actual: { id?: number; odometro: Prisma.Decimal | number; galones: Prisma.Decimal | number; tanqueLleno: boolean }) {
    const previas = await tx.cargaCombustible.findMany({ where: { cabezalId, anulada: false, odometro: { lt: actual.odometro }, ...(actual.id ? { id: { not: actual.id } } : {}) }, orderBy: { odometro: 'desc' }, take: 30, select: { odometro: true, galones: true, tanqueLleno: true } });
    return tramo(previas, actual);
  }

  async registrar(ctx: Ctx, body: unknown) {
    const d = validar(cargaZ, body);
    const sucursalId = this.sucursal(ctx);
    const caida = await this.parametros.numero('combustible.alerta_rendimiento');
    const total = totalCarga(d.galones, d.precioGalon);
    if (d.total != null && D(d.total).minus(total).abs().gt(1)) throw reglaNegocio('TOTAL_NO_CUADRA', `El total (Q${D(d.total).toFixed(2)}) no cuadra con galones × precio (Q${total.toFixed(2)})`);
    const propio = await this.pilotoPropio(ctx);

    const r = await this.prisma.enTransaccion(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cabezales WHERE id = ${d.cabezalId} FOR UPDATE`;
      const cabezal = await tx.cabezal.findFirst({ where: { id: d.cabezalId, activo: true } });
      if (!cabezal) throw reglaNegocio('CABEZAL_INVALIDO', 'Elija un cabezal activo');

      let viaje = null;
      if (d.viajeId) {
        viaje = await tx.viaje.findFirst({ where: { id: d.viajeId, sucursalId } });
        if (!viaje) throw noEncontrado('Viaje', d.viajeId);
        if (viaje.cabezalId !== d.cabezalId) throw reglaNegocio('VIAJE_OTRO_CABEZAL', `El viaje ${viaje.numero} es de otro cabezal`);
        if (!['PROGRAMADO', 'EN_RUTA', 'FINALIZADO'].includes(viaje.estado)) throw reglaNegocio('ESTADO_VIAJE', `El viaje ${viaje.numero} ya está liquidado o cancelado`);
        if (propio != null && viaje.pilotoId !== propio) throw prohibido('Ese viaje no está asignado a usted');
      } else if (propio != null) {
        // Al piloto se le asocia solo su viaje en ruta con este cabezal
        viaje = await tx.viaje.findFirst({ where: { cabezalId: d.cabezalId, pilotoId: propio, estado: 'EN_RUTA' } });
      }

      const pilotoId = propio ?? d.pilotoId ?? viaje?.pilotoId ?? null; // la carga de un viaje es de su piloto

      // Odómetro: no menor que la última carga; un salto fuera de lo normal pide confirmación
      const ultima = await tx.cargaCombustible.findFirst({ where: { cabezalId: d.cabezalId, anulada: false }, orderBy: { odometro: 'desc' }, select: { odometro: true } });
      const odo = D(d.odometro);
      if (ultima && odo.lte(D(ultima.odometro))) throw reglaNegocio('ODOMETRO_MENOR', `El odómetro (${odo.toFixed(1)}) debe ser mayor que el de la última carga del cabezal ${cabezal.codigo} (${D(ultima.odometro).toFixed(1)} km)`);
      const max = saltoMaximo(cabezal.capacidadTanque, cabezal.rendimientoEsperado);
      const base = ultima ? D(ultima.odometro) : null;
      if (base && max && odo.minus(base).gt(max) && !d.confirmarSalto) throw reglaNegocio('SALTO_ODOMETRO', `Son ${odo.minus(base).toFixed(0)} km desde la última carga; un tanque rinde unos ${max.toFixed(0)} km. Revise el odómetro o confirme que es correcto`, { km: odo.minus(base), maximo: max });
      if (cabezal.capacidadTanque && D(d.galones).gt(D(cabezal.capacidadTanque).times(1.05))) throw reglaNegocio('GALONES_EXCEDEN', `Son más galones (${d.galones}) que la capacidad del tanque del cabezal ${cabezal.codigo} (${D(cabezal.capacidadTanque).toFixed(0)} gal)`);

      const t = await this.calcularTramo(tx, d.cabezalId, { odometro: odo.toNumber(), galones: d.galones, tanqueLleno: d.tanqueLleno });
      const alerta = !!(t && cabezal.rendimientoEsperado && bajoRendimiento(t.rendimiento, cabezal.rendimientoEsperado, caida));
      const carga = await tx.cargaCombustible.create({ data: {
        sucursalId, cabezalId: d.cabezalId, pilotoId, viajeId: viaje?.id ?? null, fecha: d.fecha ?? new Date(),
        odometro: odo, galones: d.galones, precioGalon: d.precioGalon, total, tanqueLleno: d.tanqueLleno, pagadoPorPiloto: d.pagadoPorPiloto,
        estacion: d.estacion, documento: d.documento, archivoId: d.archivoId ?? null, registradoPorId: ctx.usuario.sub,
        kmRecorridos: t?.km ?? null, galonesTramo: t?.galones ?? null, rendimiento: t?.rendimiento ?? null, alerta,
      } });
      if (viaje) {
        await tx.costoViaje.create({ data: { viajeId: viaje.id, tipo: 'COMBUSTIBLE', monto: total, descripcion: `${D(d.galones).toFixed(2)} gal${d.estacion ? ` · ${d.estacion}` : ''}`, documento: d.documento, pagadoPorPiloto: d.pagadoPorPiloto, cargaId: carga.id, archivoId: d.archivoId ?? null, registradoPorId: ctx.usuario.sub, fecha: carga.fecha } });
        const s = await tx.costoViaje.aggregate({ where: { viajeId: viaje.id }, _sum: { monto: true } });
        await tx.viaje.update({ where: { id: viaje.id }, data: { totalCostos: r2(s._sum.monto) } });
      }
      if (odo.gt(D(cabezal.odometro))) await tx.cabezal.update({ where: { id: cabezal.id }, data: { odometro: odo } });
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'CargaCombustible', entidadId: carga.id, despues: { ...d, total, viajeId: viaje?.id ?? null, rendimiento: t?.rendimiento ?? null } }, tx);
      return { carga, cabezal, viaje, t, alerta };
    });

    const { carga, cabezal, viaje, t, alerta } = r;
    if (alerta) {
      const v = variacionPct(t!.rendimiento, cabezal.rendimientoEsperado!);
      await this.notificaciones.evento({ sucursalId, permiso: 'combustible.ver', tipo: 'rendimiento-bajo', nivel: 'aviso', titulo: `Rendimiento bajo en ${cabezal.codigo}`, detalle: `${t!.rendimiento.toFixed(2)} km/gal (esperado ${D(cabezal.rendimientoEsperado).toFixed(2)}, ${v?.toFixed(1)} %). Revise fugas, presión de llantas, ralentí o el vale.`, ruta: '/home/combustible' });
    }
    const rend = t ? ` · ${t.rendimiento.toFixed(2)} km/gal` : d.tanqueLleno ? ' · primer llenado: el rendimiento sale en la próxima' : ' · carga parcial';
    return { data: { id: carga.id, total, viaje: viaje?.numero ?? null, rendimiento: t?.rendimiento ?? null, kmRecorridos: t?.km ?? null, alerta }, message: `Carga de Q${total.toFixed(2)} registrada${viaje ? ` en el viaje ${viaje.numero}` : ''}${rend}` };
  }

  async anular(ctx: Ctx, id: number, body: unknown) {
    const { motivo } = validar(z.object({ motivo: z.string().trim().min(10, 'Explique el motivo (al menos 10 caracteres)').max(300) }), body);
    await this.prisma.enTransaccion(async (tx) => {
      const c = await tx.cargaCombustible.findFirst({ where: { id, sucursalId: this.sucursal(ctx) }, include: { viaje: { select: { estado: true, numero: true } } } });
      if (!c) throw noEncontrado('Carga', id);
      if (c.anulada) return;
      if (c.viaje && ['LIQUIDADO', 'CANCELADO'].includes(c.viaje.estado)) throw reglaNegocio('ESTADO_VIAJE', `La carga es del viaje ${c.viaje.numero}, que ya está liquidado`);
      await tx.cargaCombustible.update({ where: { id }, data: { anulada: true, motivoAnulacion: motivo, alerta: false } });
      if (c.viajeId) {
        await tx.costoViaje.deleteMany({ where: { cargaId: id } });
        const s = await tx.costoViaje.aggregate({ where: { viajeId: c.viajeId }, _sum: { monto: true } });
        await tx.viaje.update({ where: { id: c.viajeId }, data: { totalCostos: r2(s._sum.monto) } });
      }
      // El siguiente llenado completo del cabezal pierde su base: se recalcula su tramo
      const siguiente = await tx.cargaCombustible.findFirst({ where: { cabezalId: c.cabezalId, anulada: false, tanqueLleno: true, odometro: { gt: c.odometro } }, orderBy: { odometro: 'asc' }, include: { cabezal: { select: { rendimientoEsperado: true } } } });
      if (siguiente) {
        const t = await this.calcularTramo(tx, c.cabezalId, siguiente);
        const caida = await this.parametros.numero('combustible.alerta_rendimiento');
        await tx.cargaCombustible.update({ where: { id: siguiente.id }, data: { kmRecorridos: t?.km ?? null, galonesTramo: t?.galones ?? null, rendimiento: t?.rendimiento ?? null, alerta: !!(t && siguiente.cabezal.rendimientoEsperado && bajoRendimiento(t.rendimiento, siguiente.cabezal.rendimientoEsperado, caida)) } });
      }
      await this.audit.registrar(ctx, { accion: 'ANULAR', entidad: 'CargaCombustible', entidadId: id, antes: { anulada: false }, despues: { anulada: true, motivo } }, tx);
    });
    return { message: 'Carga anulada' };
  }
}
