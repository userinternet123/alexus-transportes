/**
 * INSPECCIÓN PRE VIAJE: el piloto marca el checklist; si falla algo crítico el
 * cabezal no sale, se abre una orden de trabajo CORRECTIVA con las fallas y se
 * avisa a despacho y taller. Las fallas menores quedan como observación para el taller.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { hoyGuatemala } from '../../common/fecha';
import { PrismaService } from '../../common/prisma/prisma.service';
import { rangoMes } from '../gastos/gastos.logica';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { siguienteNumero } from '../viajes/viajes.logica';
import { CHECKLIST, evaluar, filtroInspeccionesZ, inspeccionZ } from './inspecciones.logica';

const sucursal = (ctx: Ctx) => ctx.sucursalId ?? (() => { throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo'); })();
const fechaDb = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const N = (d: unknown) => (d == null ? 0 : Number(d));

@Injectable()
export class InspeccionesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly notificaciones: NotificacionesService) {}

  checklist() { return { data: CHECKLIST }; }

  async listar(ctx: Ctx, query: unknown) {
    const f = filtroInspeccionesZ.parse(query ?? {});
    const mes = f.mes ?? hoyGuatemala().slice(0, 7);
    const [desde, hasta] = rangoMes(mes);
    const filas = await this.prisma.inspeccion.findMany({
      where: { sucursalId: sucursal(ctx), fecha: { gte: fechaDb(desde), lt: new Date(fechaDb(hasta).getTime() + 86_400_000) }, ...(f.cabezalId ? { cabezalId: f.cabezalId } : {}), ...(f.resultado ? { resultado: f.resultado } : {}) },
      orderBy: [{ fecha: 'desc' }], include: { cabezal: { select: { codigo: true } }, remolque: { select: { codigo: true } }, piloto: { select: { empleado: { select: { nombres: true, apellidos: true } } } }, viaje: { select: { numero: true } }, orden: { select: { numero: true, estado: true } }, realizadoPor: { select: { nombre: true } } },
    });
    return { data: { mes, inspecciones: filas.map((i) => ({ id: i.id, fecha: i.fecha.toISOString(), tipo: i.tipo, cabezal: i.cabezal.codigo, cabezalId: i.cabezalId, remolque: i.remolque?.codigo ?? null, piloto: [i.piloto.empleado.nombres, i.piloto.empleado.apellidos].join(' '), viaje: i.viaje?.numero ?? null, viajeId: i.viajeId, odometro: i.odometro == null ? null : N(i.odometro), resultado: i.resultado, fallas: i.fallas, orden: i.orden?.numero ?? null, ordenEstado: i.orden?.estado ?? null, observaciones: i.observaciones, registro: i.realizadoPor.nombre })) } };
  }

  async detalle(ctx: Ctx, id: number) {
    const i = await this.prisma.inspeccion.findFirst({ where: { id, sucursalId: sucursal(ctx) }, include: { items: { orderBy: { id: 'asc' } }, cabezal: { select: { codigo: true, placa: true } }, remolque: { select: { codigo: true } }, piloto: { select: { empleado: { select: { nombres: true, apellidos: true } } } }, viaje: { select: { numero: true } }, orden: { select: { id: true, numero: true, estado: true } }, realizadoPor: { select: { nombre: true } } } });
    if (!i) throw noEncontrado('Inspección', id);
    return { data: { id: i.id, fecha: i.fecha.toISOString(), tipo: i.tipo, cabezal: i.cabezal.codigo, placa: i.cabezal.placa, remolque: i.remolque?.codigo ?? null, piloto: [i.piloto.empleado.nombres, i.piloto.empleado.apellidos].join(' '), viaje: i.viaje?.numero ?? null, odometro: i.odometro == null ? null : N(i.odometro), resultado: i.resultado, fallas: i.fallas, observaciones: i.observaciones, orden: i.orden, registro: i.realizadoPor.nombre, items: i.items } };
  }

  async registrar(ctx: Ctx, body: unknown) {
    const d = inspeccionZ.parse(body);
    const sucursalId = sucursal(ctx);
    const { filas, fallas, criticas, resultado } = evaluar(d.items, Boolean(d.remolqueId));
    const r = await this.prisma.enTransaccion(async (tx) => {
      const cab = await tx.cabezal.findFirst({ where: { id: d.cabezalId, activo: true } });
      if (!cab) throw reglaNegocio('CABEZAL_INVALIDO', 'Elija un cabezal activo');
      const piloto = await tx.piloto.findFirst({ where: { id: d.pilotoId, activo: true }, include: { empleado: { select: { nombres: true, apellidos: true } } } });
      if (!piloto) throw reglaNegocio('PILOTO_INVALIDO', 'Elija un piloto activo');
      if (d.viajeId) {
        const v = await tx.viaje.findFirst({ where: { id: d.viajeId, sucursalId } });
        if (!v) throw reglaNegocio('VIAJE_INVALIDO', 'El viaje no existe en esta sede');
        if (v.cabezalId !== d.cabezalId) throw reglaNegocio('CABEZAL_DISTINTO', `El viaje ${v.numero} es de otro cabezal`);
      }
      let ordenId: number | null = null; let ordenNumero: string | null = null;
      if (criticas.length) {
        const ultimo = await tx.ordenTrabajo.findFirst({ orderBy: { id: 'desc' }, select: { numero: true } });
        ordenNumero = siguienteNumero('OT-', ultimo?.numero);
        const ot = await tx.ordenTrabajo.create({ data: { numero: ordenNumero, sucursalId, cabezalId: d.cabezalId, remolqueId: d.remolqueId ?? null, tipo: 'CORRECTIVO', odometro: d.odometro == null ? cab.odometro : new Prisma.Decimal(d.odometro), descripcion: `Inspección pre viaje rechazada: ${fallas.map((f) => `${f.nombre}${f.observacion ? ` (${f.observacion})` : ''}`).join('; ')}`, creadoPorId: ctx.usuario.sub, observaciones: `Abierta automáticamente por la inspección del piloto ${piloto.empleado.nombres} ${piloto.empleado.apellidos}` } });
        ordenId = ot.id;
      }
      const insp = await tx.inspeccion.create({ data: { sucursalId, tipo: d.tipo, cabezalId: d.cabezalId, remolqueId: d.remolqueId ?? null, pilotoId: d.pilotoId, viajeId: d.viajeId ?? null, odometro: d.odometro == null ? null : new Prisma.Decimal(d.odometro), resultado, fallas: fallas.length, observaciones: d.observaciones || null, ordenId, realizadoPorId: ctx.usuario.sub,
        items: { create: filas.map((f) => ({ clave: f.clave, grupo: f.grupo, nombre: f.nombre, critico: f.critico, ok: f.ok, observacion: f.observacion, archivoId: f.archivoId })) } } });
      if (d.odometro != null && d.odometro > N(cab.odometro)) await tx.cabezal.update({ where: { id: cab.id }, data: { odometro: new Prisma.Decimal(d.odometro) } });
      return { insp, ordenNumero, cabezal: cab.codigo, piloto: `${piloto.empleado.nombres} ${piloto.empleado.apellidos}` };
    });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Inspeccion', entidadId: String(r.insp.id), despues: { resultado, fallas: fallas.map((f) => f.clave), orden: r.ordenNumero } });
    if (resultado !== 'APROBADA') {
      const detalle = fallas.map((f) => f.nombre).join(', ');
      await this.notificaciones.evento({ sucursalId, permiso: 'mantenimiento.ver', tipo: 'inspeccion', nivel: resultado === 'RECHAZADA' ? 'critico' : 'aviso', titulo: `${r.cabezal}: inspección ${resultado === 'RECHAZADA' ? 'RECHAZADA' : 'con observaciones'}`, detalle: `${r.piloto}: ${detalle}${r.ordenNumero ? `. Orden ${r.ordenNumero} abierta` : ''}`, ruta: '/home/inspecciones' });
      await this.notificaciones.evento({ sucursalId, permiso: 'viajes.ver', tipo: 'inspeccion', nivel: resultado === 'RECHAZADA' ? 'critico' : 'aviso', titulo: `${r.cabezal} ${resultado === 'RECHAZADA' ? 'no puede salir' : 'sale con observaciones'}`, detalle, ruta: '/home/inspecciones' });
    }
    const message = resultado === 'APROBADA' ? `Inspección aprobada: ${r.cabezal} listo para salir` : resultado === 'CON_OBSERVACIONES' ? `${r.cabezal} puede salir con ${fallas.length} observación(es) para el taller` : `${r.cabezal} NO puede salir: ${criticas.length} falla(s) crítica(s). Orden ${r.ordenNumero} abierta`;
    return { data: { id: r.insp.id, resultado, fallas: fallas.length, orden: r.ordenNumero }, message };
  }
}
