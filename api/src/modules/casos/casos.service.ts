/**
 * CASOS Y REQUERIMIENTOS: lo que hay que atender en la flota, con prioridad, plazo, responsable y seguimiento.
 * Nacen de una inspección (cada hallazgo), de un viaje o a mano. Los mecánicos y de llantas abren una orden de taller.
 * Un caso que «impide salir» bloquea el inicio de viajes del cabezal (o remolque) hasta que se resuelva.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { validar } from '../../common/pipes/zod';
import { evidenciaSalida, ligarEvidencias } from '../../common/evidencias';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { siguienteNumero } from '../viajes/viajes.logica';
import {
  agregarEvidenciasZ, cambiarEstadoZ, crearCasoZ, editarCasoZ, ETIQUETA_PRIORIDAD, EstadoCaso, filtroCasosZ, masUrgente, PARAMETRO_PLAZO, Prioridad,
  puedePasar, semaforo, TipoCaso, TIPOS_TALLER, venceEn,
} from './casos.logica';

const LOCK_NUMERO_CASO = 710_003;
const LOCK_NUMERO_OT = 710_002;

export interface NuevoCaso {
  sucursalId: number; origen: 'INSPECCION' | 'VIAJE' | 'MANUAL'; tipo: TipoCaso; prioridad: Prioridad; titulo: string; descripcion?: string | null;
  impideSalir?: boolean; cabezalId?: number | null; remolqueId?: number | null; viajeId?: number | null; inspeccionId?: number | null;
  puntoCodigo?: string | null; ordenTrabajoId?: number | null; responsableId?: number | null;
}

@Injectable()
export class CasosService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly parametros: ParametrosService, private readonly notificaciones: NotificacionesService) {}

  private sucursal(ctx: Ctx) {
    if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo');
    return ctx.sucursalId;
  }

  async plazoHoras(p: Prioridad) { return this.parametros.numero(PARAMETRO_PLAZO[p]); }

  /** Crea casos dentro de una transacción ajena (inspección, viaje). Las horas de plazo se leen antes, fuera de la transacción. */
  async crearEn(tx: Tx, ctx: Ctx, casos: NuevoCaso[], plazos: Record<Prioridad, number>) {
    if (!casos.length) return [];
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NUMERO_CASO})`;
    let ultimo = (await tx.caso.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } }))?.numero ?? null;
    const ahora = new Date();
    const creados = [];
    for (const c of casos) {
      ultimo = siguienteNumero(ultimo, 'CS-');
      creados.push(await tx.caso.create({ data: { ...c, impideSalir: c.impideSalir ?? false, numero: ultimo, venceEn: venceEn(ahora, plazos[c.prioridad]), creadoPorId: ctx.usuario.sub }, select: { id: true, numero: true, prioridad: true, titulo: true, tipo: true, impideSalir: true } }));
    }
    return creados;
  }

  async todosLosPlazos(): Promise<Record<Prioridad, number>> {
    const [URGENTE, ALTA, MODERADA, BAJA] = await Promise.all((['URGENTE', 'ALTA', 'MODERADA', 'BAJA'] as Prioridad[]).map((p) => this.plazoHoras(p)));
    return { URGENTE, ALTA, MODERADA, BAJA };
  }

  /** Orden de trabajo correctiva para los casos de taller (una por evento). */
  async abrirOrden(tx: Tx, ctx: Ctx, d: { sucursalId: number; cabezalId: number | null; remolqueId: number | null; descripcion: string; prioridad: Prioridad; odometro?: Prisma.Decimal | number | null; observaciones?: string | null }) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NUMERO_OT})`;
    const ultima = await tx.ordenTrabajo.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } });
    return tx.ordenTrabajo.create({ data: {
      numero: siguienteNumero(ultima?.numero, 'OT-'), sucursalId: d.sucursalId, cabezalId: d.cabezalId, remolqueId: d.remolqueId, tipo: 'CORRECTIVO',
      prioridad: d.prioridad, descripcion: d.descripcion.slice(0, 1000), odometro: d.odometro ?? null, observaciones: d.observaciones ?? null, creadoPorId: ctx.usuario.sub,
    }, select: { id: true, numero: true } });
  }

  async crear(ctx: Ctx, body: unknown) {
    const d = validar(crearCasoZ, body);
    const sucursalId = this.sucursal(ctx);
    if (!d.cabezalId && !d.remolqueId && !d.viajeId && TIPOS_TALLER.includes(d.tipo)) throw reglaNegocio('SIN_UNIDAD', 'Indique el cabezal o el remolque');
    if (d.responsableId && !tienePermiso(ctx.usuario, 'casos.gestionar')) throw prohibido('Solo quien gestiona casos puede asignar un responsable');
    if (d.uuidCliente) {
      const ya = await this.prisma.caso.findUnique({ where: { uuidCliente: d.uuidCliente }, select: { id: true, numero: true, ordenTrabajo: { select: { numero: true } } } });
      if (ya) return { data: { id: ya.id, numero: ya.numero, ordenTrabajo: ya.ordenTrabajo?.numero ?? null }, message: `Caso ${ya.numero} ya recibido` };
    }
    const plazos = await this.todosLosPlazos();
    const r = await this.prisma.enTransaccion(async (tx) => {
      let cabezalId = d.cabezalId ?? null;
      let remolqueId = d.remolqueId ?? null;
      if (d.viajeId) {
        const v = await tx.viaje.findFirst({ where: { id: d.viajeId, sucursalId } });
        if (!v) throw noEncontrado('Viaje', d.viajeId);
        cabezalId = cabezalId ?? v.cabezalId; remolqueId = remolqueId ?? v.remolqueId;
      }
      if (cabezalId && !(await tx.cabezal.findUnique({ where: { id: cabezalId } }))) throw noEncontrado('Cabezal', cabezalId);
      if (remolqueId && !(await tx.remolque.findUnique({ where: { id: remolqueId } }))) throw noEncontrado('Remolque', remolqueId);
      if (d.responsableId && !(await tx.usuario.findFirst({ where: { id: d.responsableId, activo: true } }))) throw reglaNegocio('RESPONSABLE_INVALIDO', 'Elija un usuario activo como responsable');
      const orden = TIPOS_TALLER.includes(d.tipo) && (cabezalId || remolqueId)
        ? await this.abrirOrden(tx, ctx, { sucursalId, cabezalId, remolqueId, descripcion: `${d.titulo}${d.descripcion ? `: ${d.descripcion}` : ''}`, prioridad: d.prioridad })
        : null;
      const [caso] = await this.crearEn(tx, ctx, [{ sucursalId, origen: d.viajeId ? 'VIAJE' : 'MANUAL', tipo: d.tipo, prioridad: d.prioridad, titulo: d.titulo, descripcion: d.descripcion, impideSalir: d.impideSalir, cabezalId, remolqueId, viajeId: d.viajeId ?? null, ordenTrabajoId: orden?.id ?? null, responsableId: d.responsableId ?? null }], plazos);
      await tx.caso.update({ where: { id: caso.id }, data: { latitud: d.latitud ?? null, longitud: d.longitud ?? null, uuidCliente: d.uuidCliente ?? null } });
      await ligarEvidencias(tx, ctx, d.evidencias, { casoId: caso.id });
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Caso', entidadId: caso.id, despues: { ...d, evidencias: d.evidencias.length, numero: caso.numero, orden: orden?.numero ?? null } }, tx);
      return { caso, orden };
    });
    if (d.prioridad === 'URGENTE') await this.notificaciones.evento({ sucursalId, permiso: 'casos.gestionar', tipo: 'caso-urgente', nivel: 'critico', titulo: `Caso urgente ${r.caso.numero}`, detalle: d.titulo, ruta: '/home/casos' });
    return { data: { id: r.caso.id, numero: r.caso.numero, ordenTrabajo: r.orden?.numero ?? null }, message: `Caso ${r.caso.numero} reportado (${ETIQUETA_PRIORIDAD[d.prioridad].toLowerCase()}, plazo ${plazos[d.prioridad]} h)${r.orden ? ` · orden ${r.orden.numero}` : ''}` };
  }

  async listar(ctx: Ctx, query: unknown) {
    const f = validar(filtroCasosZ, query ?? {});
    const sucursalId = this.sucursal(ctx);
    const soloPropios = !tienePermiso(ctx.usuario, 'casos.ver'); // quien solo reporta ve lo suyo
    const where: Prisma.CasoWhereInput = {
      sucursalId,
      ...(f.estado === 'ABIERTOS' ? { estado: { in: ['ABIERTO', 'EN_PROCESO'] } } : f.estado ? { estado: f.estado } : {}),
      ...(f.prioridad ? { prioridad: f.prioridad } : {}), ...(f.tipo ? { tipo: f.tipo } : {}), ...(f.cabezalId ? { cabezalId: f.cabezalId } : {}),
      ...(f.vencidos ? { venceEn: { lte: new Date() }, estado: { in: ['ABIERTO', 'EN_PROCESO'] } } : {}),
      ...(soloPropios ? { creadoPorId: ctx.usuario.sub } : f.mios ? { responsableId: ctx.usuario.sub } : {}),
    };
    const orden = { URGENTE: 0, ALTA: 1, MODERADA: 2, BAJA: 3 } as const;
    const filas = await this.prisma.caso.findMany({ where, take: f.limit, orderBy: [{ venceEn: 'asc' }], include: { cabezal: { select: { codigo: true } }, remolque: { select: { codigo: true } }, viaje: { select: { numero: true } }, ordenTrabajo: { select: { numero: true, estado: true } }, responsable: { select: { nombre: true } }, creadoPor: { select: { nombre: true } } } });
    const abiertos = await this.prisma.caso.groupBy({ by: ['prioridad'], where: { sucursalId, estado: { in: ['ABIERTO', 'EN_PROCESO'] }, ...(soloPropios ? { creadoPorId: ctx.usuario.sub } : {}) }, _count: true });
    const vencidos = await this.prisma.caso.count({ where: { sucursalId, estado: { in: ['ABIERTO', 'EN_PROCESO'] }, venceEn: { lte: new Date() }, ...(soloPropios ? { creadoPorId: ctx.usuario.sub } : {}) } });
    const casos = filas.map((c) => ({
      id: c.id, numero: c.numero, origen: c.origen, tipo: c.tipo, prioridad: c.prioridad, estado: c.estado, titulo: c.titulo, descripcion: c.descripcion, impideSalir: c.impideSalir,
      cabezal: c.cabezal?.codigo ?? null, remolque: c.remolque?.codigo ?? null, viaje: c.viaje?.numero ?? null, ordenTrabajo: c.ordenTrabajo?.numero ?? null, estadoOrden: c.ordenTrabajo?.estado ?? null,
      responsable: c.responsable?.nombre ?? null, reporto: c.creadoPor.nombre, creadoEn: c.creadoEn, venceEn: c.venceEn, resueltoEn: c.resueltoEn, resolucion: c.resolucion, semaforo: semaforo(c),
    })).sort((a, b) => Number(a.semaforo === null) - Number(b.semaforo === null) || orden[a.prioridad] - orden[b.prioridad] || a.venceEn.getTime() - b.venceEn.getTime());
    return { data: { resumen: { abiertos: Object.fromEntries(abiertos.map((a) => [a.prioridad, a._count])), vencidos }, casos } };
  }

  async detalle(ctx: Ctx, id: number) {
    const c = await this.prisma.caso.findFirst({ where: { id, sucursalId: this.sucursal(ctx) }, include: { evidencias: { orderBy: { creadoEn: 'asc' }, include: { archivo: { select: { mime: true, nombre: true } } } }, notas: { orderBy: { creadoEn: 'asc' }, include: { usuario: { select: { nombre: true } } } }, cabezal: { select: { codigo: true, placa: true } }, remolque: { select: { codigo: true } }, viaje: { select: { numero: true } }, inspeccion: { select: { id: true, fecha: true, resultado: true } }, ordenTrabajo: { select: { numero: true, estado: true } }, responsable: { select: { id: true, nombre: true } }, creadoPor: { select: { nombre: true } } } });
    if (!c) throw noEncontrado('Caso', id);
    if (!tienePermiso(ctx.usuario, 'casos.ver') && c.creadoPorId !== ctx.usuario.sub) throw prohibido();
    return { data: { ...c, semaforo: semaforo(c), evidencias: c.evidencias.map(evidenciaSalida), notas: c.notas.map((n) => ({ id: n.id, cambio: n.cambio, texto: n.texto, usuario: n.usuario.nombre, fecha: n.creadoEn })) } };
  }

  async cambiarEstado(ctx: Ctx, id: number, body: unknown) {
    const d = validar(cambiarEstadoZ, body);
    const numero = await this.prisma.enTransaccion(async (tx) => {
      const c = await tx.caso.findFirst({ where: { id, sucursalId: this.sucursal(ctx) } });
      if (!c) throw noEncontrado('Caso', id);
      if (c.estado === d.estado) return c.numero;
      if (!puedePasar(c.estado as EstadoCaso, d.estado)) throw reglaNegocio('ESTADO_CASO', `Un caso ${c.estado.toLowerCase().replace('_', ' ')} no puede pasar a ${d.estado.toLowerCase().replace('_', ' ')}`);
      const fin = d.estado === 'RESUELTO' || d.estado === 'ANULADO';
      await tx.caso.update({ where: { id }, data: { estado: d.estado, resueltoEn: fin ? new Date() : null, resolucion: fin ? d.comentario : null } });
      await tx.casoNota.create({ data: { casoId: id, usuarioId: ctx.usuario.sub, cambio: `${c.estado} → ${d.estado}`, texto: d.comentario } });
      await this.audit.registrar(ctx, { accion: 'ESTADO', entidad: 'Caso', entidadId: id, antes: { estado: c.estado }, despues: { estado: d.estado, comentario: d.comentario } }, tx);
      return c.numero;
    });
    return { message: `Caso ${numero}: ${d.estado.toLowerCase().replace('_', ' ')}` };
  }

  async editar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(editarCasoZ, body);
    const plazos = d.prioridad ? await this.todosLosPlazos() : null;
    const numero = await this.prisma.enTransaccion(async (tx) => {
      const c = await tx.caso.findFirst({ where: { id, sucursalId: this.sucursal(ctx) } });
      if (!c) throw noEncontrado('Caso', id);
      if (c.estado === 'RESUELTO' || c.estado === 'ANULADO') throw reglaNegocio('ESTADO_CASO', 'El caso ya está cerrado: reábralo para cambiarlo');
      const cambios: string[] = [];
      const data: Prisma.CasoUncheckedUpdateInput = {};
      if (d.prioridad && d.prioridad !== c.prioridad) { data.prioridad = d.prioridad; data.venceEn = venceEn(c.creadoEn, plazos![d.prioridad]); cambios.push(`${c.prioridad} → ${d.prioridad}`); }
      if (d.responsableId !== undefined && d.responsableId !== c.responsableId) {
        if (d.responsableId && !(await tx.usuario.findFirst({ where: { id: d.responsableId, activo: true } }))) throw reglaNegocio('RESPONSABLE_INVALIDO', 'Elija un usuario activo como responsable');
        data.responsableId = d.responsableId; cambios.push('responsable');
      }
      if (!cambios.length && !d.comentario) return c.numero;
      if (cambios.length) await tx.caso.update({ where: { id }, data });
      if (data.prioridad && c.ordenTrabajoId) {
        const hermanos = await tx.caso.findMany({ where: { ordenTrabajoId: c.ordenTrabajoId, estado: { in: ['ABIERTO', 'EN_PROCESO'] } }, select: { prioridad: true } });
        await tx.ordenTrabajo.update({ where: { id: c.ordenTrabajoId }, data: { prioridad: masUrgente(hermanos.map((h) => h.prioridad)) } });
      }
      await tx.casoNota.create({ data: { casoId: id, usuarioId: ctx.usuario.sub, cambio: cambios.join(', ') || null, texto: d.comentario } });
      await this.audit.registrar(ctx, { accion: 'ACTUALIZAR', entidad: 'Caso', entidadId: id, antes: { prioridad: c.prioridad, responsableId: c.responsableId }, despues: d }, tx);
      return c.numero;
    });
    return { message: `Caso ${numero} actualizado` };
  }

  /** Más fotos para un caso abierto (quien lo reportó o quien gestiona casos). */
  async agregarEvidencias(ctx: Ctx, id: number, body: unknown) {
    const d = validar(agregarEvidenciasZ, body);
    const numero = await this.prisma.enTransaccion(async (tx) => {
      const c = await tx.caso.findFirst({ where: { id, sucursalId: this.sucursal(ctx) } });
      if (!c) throw noEncontrado('Caso', id);
      if (c.creadoPorId !== ctx.usuario.sub && !tienePermiso(ctx.usuario, 'casos.gestionar')) throw prohibido('Solo quien reportó el caso o quien lo gestiona puede agregar fotos');
      if (c.estado === 'ANULADO') throw reglaNegocio('ESTADO_CASO', 'El caso está anulado');
      const n = await ligarEvidencias(tx, ctx, d.evidencias, { casoId: id });
      await tx.casoNota.create({ data: { casoId: id, usuarioId: ctx.usuario.sub, texto: `Agregó ${n} foto(s)` } });
      return c.numero;
    });
    return { message: `${d.evidencias.length} foto(s) agregadas al caso ${numero}` };
  }

  /** Usuarios activos de la sede a quienes se puede asignar un caso. */
  async responsables(ctx: Ctx) {
    const filas = await this.prisma.usuario.findMany({ where: { activo: true, sucursales: { some: { sucursalId: this.sucursal(ctx) } } }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } });
    return { data: filas };
  }

  /** Casos abiertos que impiden la salida de un cabezal o remolque (lo consulta el inicio de viaje). */
  static async bloqueantes(db: Tx | PrismaService, cabezalId: number, remolqueId: number | null) {
    return db.caso.findMany({ where: { estado: { in: ['ABIERTO', 'EN_PROCESO'] }, impideSalir: true, OR: [{ cabezalId }, ...(remolqueId ? [{ remolqueId }] : [])] }, select: { numero: true, titulo: true } });
  }
}
