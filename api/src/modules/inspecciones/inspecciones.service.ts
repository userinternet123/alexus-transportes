/**
 * INSPECCIÓN PRE VIAJE: el piloto revisa el cabezal (y el remolque) desde el celular o el despacho.
 *  - Falla crítica  → RECHAZADA: el cabezal no puede iniciar viajes hasta una nueva inspección aprobada.
 *  - Falla menor    → CON_OBSERVACIONES: puede salir.
 *  - Cada falla (y cada hallazgo fuera de la lista) abre un CASO con prioridad y plazo; las mecánicas y de llantas
 *    abren además una orden de trabajo CORRECTIVA. Un punto que vuelve a pasar la revisión resuelve su caso anterior.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { parseFecha, sumarDias } from '../../common/fecha';
import { D } from '../../common/money';
import { PrismaService } from '../../common/prisma/prisma.service';
import { validar } from '../../common/pipes/zod';
import { evidenciaSalida, ligarEvidencias } from '../../common/evidencias';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CasosService } from '../casos/casos.service';
import { masUrgente, Prioridad, TIPOS_TALLER } from '../casos/casos.logica';
import { descripcionOrden, evaluar, faltantes, filtroInspeccionesZ, inspeccionZ, prioridadSugerida, punto, PUNTOS, puntosPara, tipoDeCaso } from './inspecciones.logica';
const nombre = (e?: { nombres: string; apellidos: string } | null) => (e ? `${e.nombres} ${e.apellidos}`.trim() : null);

@Injectable()
export class InspeccionesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly notificaciones: NotificacionesService, private readonly casos: CasosService) {}

  private sucursal(ctx: Ctx) {
    if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo');
    return ctx.sucursalId;
  }

  private async pilotoDelUsuario(ctx: Ctx) {
    const u = await this.prisma.usuario.findUnique({ where: { id: ctx.usuario.sub }, select: { empleado: { select: { piloto: { select: { id: true } } } } } });
    return u?.empleado?.piloto?.id ?? null;
  }

  puntos(conRemolque: boolean) {
    const lista = conRemolque ? PUNTOS : puntosPara(false);
    return { data: lista.map(({ codigo, nombre, grupo, critico, aplicaA }) => ({ codigo, nombre, grupo, critico, aplicaA, tipoCaso: tipoDeCaso(codigo), prioridadSugerida: prioridadSugerida(codigo) })) };
  }

  async registrar(ctx: Ctx, body: unknown) {
    const d = validar(inspeccionZ, body);
    const sucursalId = this.sucursal(ctx);
    if (d.uuidCliente) {
      const ya = await this.prisma.inspeccion.findUnique({ where: { uuidCliente: d.uuidCliente }, include: { ordenTrabajo: { select: { numero: true } }, casos: { select: { id: true, numero: true, prioridad: true, titulo: true, tipo: true, impideSalir: true } } } });
      if (ya) return { data: { id: ya.id, resultado: ya.resultado, fallas: ya.fallas, fallasCriticas: ya.fallasCriticas, ordenTrabajo: ya.ordenTrabajo?.numero ?? null, casos: ya.casos, resueltos: [] }, message: 'Inspección ya recibida' };
    }
    const falta = faltantes(!!d.remolqueId, d.puntos);
    if (falta.length) throw reglaNegocio('LISTA_INCOMPLETA', `Faltan ${falta.length} puntos por revisar: ${falta.slice(0, 3).join(', ')}${falta.length > 3 ? '…' : ''}`, { faltantes: falta });
    if (!d.remolqueId && d.puntos.some((p) => punto(p.codigo)?.aplicaA === 'REMOLQUE')) throw reglaNegocio('SIN_REMOLQUE', 'Marcó puntos del remolque sin elegir el remolque');
    const res = evaluar(d.puntos, d.hallazgos);
    // Quien registra sin permiso de programar viajes es el piloto: la inspección queda a su nombre
    const propio = tienePermiso(ctx.usuario, 'viajes.crear') ? null : await this.pilotoDelUsuario(ctx);
    const plazos = await this.casos.todosLosPlazos();

    const r = await this.prisma.enTransaccion(async (tx) => {
      const cabezal = await tx.cabezal.findFirst({ where: { id: d.cabezalId, activo: true } });
      if (!cabezal) throw reglaNegocio('CABEZAL_INVALIDO', 'Elija un cabezal activo');
      const fotosPuntos = d.puntos.map((p) => p.archivoId).filter((x): x is string => Boolean(x));
      if (fotosPuntos.length && (await tx.archivo.count({ where: { id: { in: fotosPuntos }, creadoPorId: ctx.usuario.sub } })) !== new Set(fotosPuntos).size) throw reglaNegocio('EVIDENCIA_AJENA', 'Solo puede adjuntar fotos que usted subió');
      if (d.remolqueId && !(await tx.remolque.findFirst({ where: { id: d.remolqueId, activo: true } }))) throw reglaNegocio('REMOLQUE_INVALIDO', 'Elija un remolque activo');
      if (d.odometro != null && D(d.odometro).lt(D(cabezal.odometro))) throw reglaNegocio('ODOMETRO_MENOR', `El odómetro (${D(d.odometro).toFixed(1)}) es menor que el último registrado del cabezal ${cabezal.codigo} (${D(cabezal.odometro).toFixed(1)} km)`);
      let viajeId = d.viajeId ?? null;
      if (viajeId) {
        const v = await tx.viaje.findFirst({ where: { id: viajeId, sucursalId, cabezalId: d.cabezalId } });
        if (!v) throw reglaNegocio('VIAJE_INVALIDO', 'El viaje no es de este cabezal');
        if (propio != null && v.pilotoId !== propio) throw prohibido('Ese viaje no está asignado a usted');
        if (v.estado !== 'PROGRAMADO') viajeId = null; // la del viaje en ruta no cambia su inspección de salida
      }

      // Un caso por cada falla y por cada hallazgo, con su prioridad
      const enRemolque = (codigo: string) => punto(codigo)?.aplicaA === 'REMOLQUE';
      const nuevos = [
        ...d.puntos.filter((p) => p.estado === 'FALLA').map((p) => ({
          tipo: tipoDeCaso(p.codigo), prioridad: (p.prioridad ?? prioridadSugerida(p.codigo)) as Prioridad, titulo: `${punto(p.codigo)!.nombre}`.slice(0, 150),
          descripcion: p.nota, impideSalir: !!punto(p.codigo)?.critico, puntoCodigo: p.codigo, remolque: enRemolque(p.codigo),
        })),
        ...d.hallazgos.map((h) => ({ tipo: h.tipo, prioridad: h.prioridad as Prioridad, titulo: h.titulo, descripcion: h.descripcion, impideSalir: h.impideSalir, puntoCodigo: null, remolque: false })),
      ];
      const deTaller = nuevos.filter((c) => TIPOS_TALLER.includes(c.tipo));
      const orden = deTaller.length
        ? await this.casos.abrirOrden(tx, ctx, {
          sucursalId, cabezalId: d.cabezalId, remolqueId: deTaller.some((c) => c.remolque) ? d.remolqueId ?? null : null,
          descripcion: descripcionOrden(d.puntos.filter((p) => p.estado === 'FALLA' && TIPOS_TALLER.includes(tipoDeCaso(p.codigo)))) + deTaller.filter((c) => !c.puntoCodigo).map((c) => `; ${c.titulo}`).join(''),
          prioridad: masUrgente(deTaller.map((c) => c.prioridad)), odometro: d.odometro ?? cabezal.odometro,
          observaciones: res.resultado === 'RECHAZADA' ? 'FUERA DE SERVICIO: falla crítica en inspección pre viaje' : null,
        })
        : null;
      const insp = await tx.inspeccion.create({ data: {
        sucursalId, cabezalId: d.cabezalId, remolqueId: d.remolqueId ?? null, pilotoId: propio ?? d.pilotoId ?? null, viajeId,
        odometro: d.odometro ?? null, resultado: res.resultado, fallas: res.fallas, fallasCriticas: res.fallasCriticas, observaciones: d.observaciones,
        ordenTrabajoId: orden?.id ?? null, registradoPorId: ctx.usuario.sub, uuidCliente: d.uuidCliente ?? null,
        puntos: { create: d.puntos.map((p) => ({ codigo: p.codigo, estado: p.estado, critico: punto(p.codigo)!.critico, nota: p.nota, archivoId: p.archivoId ?? null })) },
      } });
      const casos = await this.casos.crearEn(tx, ctx, nuevos.map((c) => ({
        sucursalId, origen: 'INSPECCION' as const, tipo: c.tipo, prioridad: c.prioridad, titulo: c.titulo, descripcion: c.descripcion, impideSalir: c.impideSalir,
        cabezalId: d.cabezalId, remolqueId: c.remolque ? d.remolqueId ?? null : null, viajeId, inspeccionId: insp.id, puntoCodigo: c.puntoCodigo,
        ordenTrabajoId: TIPOS_TALLER.includes(c.tipo) ? orden?.id ?? null : null,
      })), plazos);

      // Lo que antes falló y hoy pasó la revisión queda resuelto (con nota)
      const okHoy = d.puntos.filter((p) => p.estado === 'OK').map((p) => p.codigo);
      const previos = okHoy.length ? await tx.caso.findMany({ where: { cabezalId: d.cabezalId, origen: 'INSPECCION', estado: { in: ['ABIERTO', 'EN_PROCESO'] }, puntoCodigo: { in: okHoy }, inspeccionId: { not: insp.id } }, select: { id: true, numero: true, estado: true } }) : [];
      for (const c of previos) {
        await tx.caso.update({ where: { id: c.id }, data: { estado: 'RESUELTO', resueltoEn: new Date(), resolucion: `El punto pasó la inspección #${insp.id}` } });
        await tx.casoNota.create({ data: { casoId: c.id, usuarioId: ctx.usuario.sub, cambio: `${c.estado} → RESUELTO`, texto: `Resuelto: el punto pasó la inspección #${insp.id}` } });
      }
      await ligarEvidencias(tx, ctx, d.evidencias, { inspeccionId: insp.id });
      if (d.odometro != null && D(d.odometro).gt(D(cabezal.odometro))) await tx.cabezal.update({ where: { id: cabezal.id }, data: { odometro: d.odometro } });
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Inspeccion', entidadId: insp.id, despues: { ...res, cabezalId: d.cabezalId, ordenTrabajo: orden?.numero ?? null, casos: casos.map((c) => c.numero), resueltos: previos.map((c) => c.numero) } }, tx);
      return { insp, orden, cabezal, casos, resueltos: previos };
    });

    const { insp, orden, cabezal, casos, resueltos } = r;
    if (casos.length) {
      const urgentes = casos.filter((c) => c.prioridad === 'URGENTE').length;
      await this.notificaciones.evento({
        sucursalId, permiso: 'casos.gestionar', tipo: 'inspeccion-falla', nivel: res.resultado === 'RECHAZADA' || urgentes ? 'critico' : 'aviso',
        titulo: res.resultado === 'RECHAZADA' ? `${cabezal.codigo} fuera de servicio` : `${cabezal.codigo}: ${casos.length} hallazgo(s) en la inspección`,
        detalle: `Casos ${casos.map((c) => c.numero).join(', ')}${orden ? ` · orden ${orden.numero}` : ''}`, ruta: '/home/casos',
      });
    }
    const extra = `${casos.length ? ` Se abrieron ${casos.length} caso(s)` : ''}${orden ? ` y la orden ${orden.numero}` : ''}${casos.length ? '.' : ''}${resueltos.length ? ` ${resueltos.length} caso(s) anterior(es) quedaron resueltos.` : ''}`;
    const textos = { APROBADA: 'Inspección aprobada: puede salir.', CON_OBSERVACIONES: 'Puede salir con observaciones.', RECHAZADA: `NO PUEDE SALIR: ${res.fallasCriticas} falla(s) crítica(s).` };
    return { data: { id: insp.id, ...res, ordenTrabajo: orden?.numero ?? null, casos, resueltos: resueltos.map((c) => c.numero) }, message: `${textos[res.resultado]}${extra}` };
  }

  async listar(ctx: Ctx, query: unknown) {
    const f = validar(filtroInspeccionesZ, query ?? {});
    const propio = tienePermiso(ctx.usuario, 'viajes.crear') || tienePermiso(ctx.usuario, 'mantenimiento.ver') ? null : await this.pilotoDelUsuario(ctx);
    const where: Prisma.InspeccionWhereInput = {
      sucursalId: this.sucursal(ctx),
      ...(f.desde || f.hasta ? { fecha: { ...(f.desde ? { gte: parseFecha(f.desde) } : {}), ...(f.hasta ? { lt: sumarDias(parseFecha(f.hasta), 1) } : {}) } } : {}),
      ...(f.cabezalId ? { cabezalId: f.cabezalId } : {}), ...(f.resultado ? { resultado: f.resultado } : {}),
      ...(propio != null ? { pilotoId: propio } : {}),
    };
    const filas = await this.prisma.inspeccion.findMany({ where, orderBy: { fecha: 'desc' }, take: f.limit, include: {
      cabezal: { select: { codigo: true, placa: true } }, remolque: { select: { codigo: true } }, piloto: { select: { empleado: { select: { nombres: true, apellidos: true } } } },
      viaje: { select: { numero: true } }, ordenTrabajo: { select: { numero: true, estado: true } }, registradoPor: { select: { nombre: true } },
    } });
    // Estado actual de cada cabezal: su última inspección
    const ultimas = await this.prisma.inspeccion.findMany({ where: { sucursalId: where.sucursalId }, orderBy: { fecha: 'desc' }, distinct: ['cabezalId'], select: { cabezalId: true, resultado: true, fecha: true, cabezal: { select: { codigo: true } } } });
    return { data: {
      fueraDeServicio: ultimas.filter((u) => u.resultado === 'RECHAZADA').map((u) => ({ cabezalId: u.cabezalId, cabezal: u.cabezal.codigo, desde: u.fecha })),
      inspecciones: filas.map((i) => ({ id: i.id, fecha: i.fecha, cabezal: i.cabezal.codigo, placa: i.cabezal.placa, remolque: i.remolque?.codigo ?? null, piloto: nombre(i.piloto?.empleado), viaje: i.viaje?.numero ?? null, odometro: i.odometro, resultado: i.resultado, fallas: i.fallas, fallasCriticas: i.fallasCriticas, ordenTrabajo: i.ordenTrabajo?.numero ?? null, estadoOrden: i.ordenTrabajo?.estado ?? null, registro: i.registradoPor.nombre })),
    } };
  }

  async detalle(ctx: Ctx, id: number) {
    const i = await this.prisma.inspeccion.findFirst({ where: { id, sucursalId: this.sucursal(ctx) }, include: { puntos: true, evidencias: { include: { archivo: { select: { mime: true, nombre: true } } } }, casos: { select: { id: true, numero: true, prioridad: true, estado: true, titulo: true } }, cabezal: { select: { codigo: true, placa: true } }, remolque: { select: { codigo: true } }, ordenTrabajo: { select: { numero: true, estado: true } }, piloto: { select: { empleado: { select: { nombres: true, apellidos: true } } } } } });
    if (!i) throw noEncontrado('Inspección', id);
    return { data: { ...i, evidencias: i.evidencias.map(evidenciaSalida), piloto: nombre(i.piloto?.empleado), puntos: i.puntos.map((p) => ({ ...p, nombre: punto(p.codigo)?.nombre ?? p.codigo, grupo: punto(p.codigo)?.grupo ?? '' })) } };
  }
}
