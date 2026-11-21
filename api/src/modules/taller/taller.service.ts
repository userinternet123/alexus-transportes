/**
 * TALLER: órdenes de trabajo (preventivas, servicios mayores, reparaciones, llantas, carrocería), con mano de obra y
 * repuestos por marca; alertas de mantenimiento por km o días; y qué marca de repuesto dura más y cuesta menos por km.
 * Al cerrar una orden se resuelven sus casos y la unidad vuelve a estar disponible. Lógica de cálculo en taller.logica.ts.
 */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { D, Decimal, r2, suma } from '../../common/money';
import { validar } from '../../common/pipes/zod';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { siguienteNumero } from '../viajes/viajes.logica';
import { crearOrdenZ, duracionPorMarca, editarOrdenZ, estadoOrdenZ, estadoPlan, filtroOrdenesZ, repuestoZ, totales, TRANSICIONES } from './taller.logica';

/** El mismo candado que usan los casos al abrir órdenes: los números OT- no se repiten. */
const LOCK_NUMERO_OT = 710_002;
const ABIERTAS = ['ABIERTA', 'EN_PROCESO'] as const;
const TERMINADOS = ['FINALIZADO', 'LIQUIDADO'] as const;
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const nombreTercero = (t: { razonSocial: string | null; nombreComercial: string | null; nombres: string | null; apellidos: string | null } | null) =>
  t ? t.nombreComercial || t.razonSocial || [t.nombres, t.apellidos].filter(Boolean).join(' ') : null;
const TALLER = { select: { razonSocial: true, nombreComercial: true, nombres: true, apellidos: true } } as const;

@Injectable()
export class TallerService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private sucursal(ctx: Ctx) {
    if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo');
    return ctx.sucursalId;
  }

  // ─────────────────────────────── Órdenes ───────────────────────────────

  async listar(ctx: Ctx, q: unknown) {
    const f = validar(filtroOrdenesZ, q);
    const where: Record<string, unknown> = { sucursalId: this.sucursal(ctx), ...(f.cabezalId ? { cabezalId: f.cabezalId } : {}) };
    if (f.estado === 'ABIERTAS') where.estado = { in: ABIERTAS };
    else if (f.estado !== 'TODAS') where.estado = f.estado;
    if (f.q) where.OR = [{ numero: { contains: f.q, mode: 'insensitive' } }, { descripcion: { contains: f.q, mode: 'insensitive' } }, { cabezal: { codigo: { contains: f.q, mode: 'insensitive' } } }, { remolque: { codigo: { contains: f.q, mode: 'insensitive' } } }];
    const filas = await this.prisma.ordenTrabajo.findMany({
      where, take: f.limit, orderBy: [{ fechaApertura: 'desc' }],
      include: { cabezal: { select: { codigo: true, placa: true, estado: true } }, remolque: { select: { codigo: true, estado: true } }, plan: { select: { nombre: true } }, taller: TALLER, _count: { select: { casos: true, repuestos: true } } },
    });
    const ahora = Date.now();
    return {
      data: filas.map((o) => ({
        id: o.id, numero: o.numero, tipo: o.tipo, prioridad: o.prioridad, estado: o.estado, descripcion: o.descripcion,
        unidad: o.cabezal?.codigo ?? o.remolque?.codigo ?? '—', enTaller: (o.cabezal?.estado ?? o.remolque?.estado) === 'EN_TALLER',
        plan: o.plan?.nombre ?? null, taller: nombreTercero(o.taller) ?? 'Taller propio', fechaApertura: o.fechaApertura, fechaCierre: o.fechaCierre,
        diasAbierta: o.estado === 'ABIERTA' || o.estado === 'EN_PROCESO' ? Math.floor((ahora - o.fechaApertura.getTime()) / 86_400_000) : null,
        total: o.total, casos: o._count.casos, repuestos: o._count.repuestos,
      })),
    };
  }

  private async cargar(ctx: Ctx, id: number, db: Tx | PrismaService = this.prisma) {
    const o = await db.ordenTrabajo.findFirst({ where: { id, sucursalId: this.sucursal(ctx) } });
    if (!o) throw noEncontrado('Orden de trabajo', id);
    return o;
  }

  async detalle(ctx: Ctx, id: number) {
    await this.cargar(ctx, id);
    const o = await this.prisma.ordenTrabajo.findUniqueOrThrow({
      where: { id },
      include: {
        cabezal: { select: { id: true, codigo: true, placa: true, odometro: true, estado: true } }, remolque: { select: { id: true, codigo: true, estado: true } },
        plan: { select: { id: true, nombre: true } }, taller: { select: { id: true, ...TALLER.select } }, creadoPor: { select: { nombre: true } },
        repuestos: { include: { repuesto: { select: { codigo: true, nombre: true, unidad: true, marca: { select: { nombre: true } } } }, marca: { select: { nombre: true } } }, orderBy: { id: 'asc' } },
        casos: { select: { id: true, numero: true, titulo: true, prioridad: true, estado: true } },
      },
    });
    return {
      data: {
        ...o, taller: o.taller ? { id: o.taller.id, nombre: nombreTercero(o.taller) } : null, creadoPor: o.creadoPor.nombre,
        repuestos: o.repuestos.map((r) => ({ id: r.id, repuestoId: r.repuestoId, codigo: r.repuesto.codigo, nombre: r.repuesto.nombre, unidad: r.repuesto.unidad, marca: r.marca?.nombre ?? r.repuesto.marca?.nombre ?? null, marcaId: r.marcaId, cantidad: r.cantidad, costoUnitario: r.costoUnitario, total: r.total })),
      },
    };
  }

  /** Abre una orden (o registra un servicio ya hecho, cerrado, para que las alertas tengan desde cuándo contar). */
  async crear(ctx: Ctx, body: unknown) {
    const d = validar(crearOrdenZ, body);
    const sucursalId = this.sucursal(ctx);
    const r = await this.prisma.enTransaccion(async (tx) => {
      const unidad = d.cabezalId ? await tx.cabezal.findUnique({ where: { id: d.cabezalId } }) : await tx.remolque.findUnique({ where: { id: d.remolqueId! } });
      if (!unidad || !unidad.activo) throw reglaNegocio('UNIDAD_INVALIDA', 'Elija un cabezal o remolque activo');
      if (d.planId) {
        const plan = await tx.planMantenimiento.findFirst({ where: { id: d.planId, activo: true } });
        if (!plan) throw reglaNegocio('PLAN_INVALIDO', 'Elija un plan de mantenimiento activo');
        const tipoUnidad = d.cabezalId ? 'CABEZAL' : 'REMOLQUE';
        if (plan.aplicaA !== 'AMBOS' && plan.aplicaA !== tipoUnidad) throw reglaNegocio('PLAN_OTRA_UNIDAD', `El plan «${plan.nombre}» es para ${plan.aplicaA === 'CABEZAL' ? 'cabezales' : 'remolques'}`);
      }
      if (d.tallerId && !(await tx.tercero.count({ where: { id: d.tallerId, esTaller: true } }))) throw reglaNegocio('TALLER_INVALIDO', 'Elija un taller registrado');
      const odometro = d.odometro ?? (d.cabezalId && !d.yaRealizado ? (unidad as { odometro: Decimal }).odometro : null);
      const manoObra = r2(d.manoObra ?? 0);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NUMERO_OT})`;
      const ultima = await tx.ordenTrabajo.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } });
      const orden = await tx.ordenTrabajo.create({
        data: {
          numero: siguienteNumero(ultima?.numero, 'OT-'), sucursalId, cabezalId: d.cabezalId ?? null, remolqueId: d.remolqueId ?? null, planId: d.planId ?? null, tallerId: d.tallerId ?? null,
          tipo: d.tipo, prioridad: d.prioridad, descripcion: d.descripcion, odometro, manoObra, total: manoObra, documento: d.documento, observaciones: d.observaciones,
          creadoPorId: ctx.usuario.sub, detieneUnidad: d.ponerEnTaller && !d.yaRealizado,
          ...(d.yaRealizado ? { estado: 'CERRADA' as const, fechaApertura: d.fecha!, fechaCierre: d.fecha! } : {}),
        },
      });
      if (d.ponerEnTaller && !d.yaRealizado && unidad.estado === 'ACTIVO') {
        if (d.cabezalId) await tx.cabezal.update({ where: { id: d.cabezalId }, data: { estado: 'EN_TALLER' } });
        else await tx.remolque.update({ where: { id: d.remolqueId! }, data: { estado: 'EN_TALLER' } });
      }
      await this.audit.registrar(ctx, { accion: d.yaRealizado ? 'REGISTRAR_SERVICIO' : 'CREAR', entidad: 'OrdenTrabajo', entidadId: orden.id, despues: { numero: orden.numero, tipo: d.tipo, unidad: unidad.codigo, planId: d.planId ?? null } }, tx);
      return { orden, unidad };
    });
    return {
      data: { id: r.orden.id, numero: r.orden.numero },
      message: d.yaRealizado ? `Servicio registrado (${r.orden.numero}): las alertas cuentan desde el ${ymd(d.fecha)}` : `Orden ${r.orden.numero} abierta para ${r.unidad.codigo}${d.ponerEnTaller ? ' (queda en taller)' : ''}`,
    };
  }

  private abiertaOError(o: { estado: string; numero: string }) {
    if (o.estado !== 'ABIERTA' && o.estado !== 'EN_PROCESO') throw reglaNegocio('ORDEN_CERRADA', `La orden ${o.numero} está ${o.estado.toLowerCase()}: ya no se cambia`);
  }
  private async recalcular(tx: Tx, id: number, manoObra?: Decimal) {
    const o = await tx.ordenTrabajo.findUniqueOrThrow({ where: { id }, select: { manoObra: true, repuestos: { select: { total: true } } } });
    const t = totales(manoObra ?? o.manoObra, o.repuestos);
    await tx.ordenTrabajo.update({ where: { id }, data: { totalRepuestos: t.totalRepuestos, total: t.total, ...(manoObra ? { manoObra } : {}) } });
    return t;
  }

  async editar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(editarOrdenZ, body);
    if (d.archivoId && !(await this.prisma.archivo.count({ where: { id: d.archivoId, creadoPorId: ctx.usuario.sub } }))) throw reglaNegocio('ARCHIVO_AJENO', 'Solo puede adjuntar archivos que usted subió');
    const r = await this.prisma.enTransaccion(async (tx) => {
      const o = await this.cargar(ctx, id, tx);
      this.abiertaOError(o);
      if (d.tallerId && !(await tx.tercero.count({ where: { id: d.tallerId, esTaller: true } }))) throw reglaNegocio('TALLER_INVALIDO', 'Elija un taller registrado');
      const { manoObra, ...resto } = d;
      await tx.ordenTrabajo.update({ where: { id }, data: Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)) });
      const t = await this.recalcular(tx, id, manoObra != null ? r2(manoObra) : undefined);
      await this.audit.registrar(ctx, { accion: 'ACTUALIZAR', entidad: 'OrdenTrabajo', entidadId: id, antes: { manoObra: o.manoObra, tipo: o.tipo, prioridad: o.prioridad }, despues: d }, tx);
      return { o, t };
    });
    return { data: { total: r.t.total }, message: `Orden ${r.o.numero} actualizada · total Q${r.t.total.toFixed(2)}` };
  }

  async agregarRepuesto(ctx: Ctx, id: number, body: unknown) {
    const d = validar(repuestoZ, body);
    const r = await this.prisma.enTransaccion(async (tx) => {
      const o = await this.cargar(ctx, id, tx);
      this.abiertaOError(o);
      const rep = await tx.repuesto.findFirst({ where: { id: d.repuestoId, activo: true } });
      if (!rep) throw reglaNegocio('REPUESTO_INVALIDO', 'Elija un repuesto activo');
      if (d.marcaId && !(await tx.marca.count({ where: { id: d.marcaId } }))) throw reglaNegocio('MARCA_INVALIDA', 'Elija una marca registrada');
      const costoUnitario = r2(d.costoUnitario ?? rep.precioReferencia ?? 0);
      if (costoUnitario.lte(0)) throw reglaNegocio('SIN_COSTO', `«${rep.nombre}» no tiene precio de referencia: escriba el costo unitario`);
      await tx.ordenTrabajoRepuesto.create({ data: { ordenId: id, repuestoId: rep.id, marcaId: d.marcaId ?? rep.marcaId ?? null, cantidad: d.cantidad, costoUnitario, total: r2(costoUnitario.times(d.cantidad)) } });
      const t = await this.recalcular(tx, id);
      return { o, rep, t };
    });
    return { data: { total: r.t.total }, message: `${r.rep.nombre} agregado a ${r.o.numero} · total Q${r.t.total.toFixed(2)}` };
  }

  async quitarRepuesto(ctx: Ctx, id: number, lineaId: number) {
    const r = await this.prisma.enTransaccion(async (tx) => {
      const o = await this.cargar(ctx, id, tx);
      this.abiertaOError(o);
      const { count } = await tx.ordenTrabajoRepuesto.deleteMany({ where: { id: lineaId, ordenId: id } });
      if (!count) throw noEncontrado('Repuesto de la orden', lineaId);
      return { o, t: await this.recalcular(tx, id) };
    });
    return { data: { total: r.t.total }, message: `Repuesto quitado · total Q${r.t.total.toFixed(2)}` };
  }

  /** En proceso, cerrar (resuelve sus casos, actualiza el odómetro, libera la unidad) o anular (sus casos siguen abiertos). */
  async cambiarEstado(ctx: Ctx, id: number, body: unknown) {
    const d = validar(estadoOrdenZ, body);
    const r = await this.prisma.enTransaccion(async (tx) => {
      const o = await this.cargar(ctx, id, tx);
      if (!TRANSICIONES[o.estado].includes(d.estado)) throw reglaNegocio('ESTADO_ORDEN', `La orden ${o.numero} está ${o.estado.toLowerCase().replace('_', ' ')}: no se puede pasar a ${d.estado.toLowerCase().replace('_', ' ')}`);
      const fin = d.estado === 'CERRADA' || d.estado === 'ANULADA';
      const odometro = d.odometro ?? o.odometro;
      await tx.ordenTrabajo.update({
        where: { id },
        data: {
          estado: d.estado, ...(fin ? { fechaCierre: new Date() } : {}), odometro,
          ...(d.estado === 'CERRADA' ? { observaciones: d.comentario } : {}), ...(d.estado === 'ANULADA' ? { motivoAnulacion: d.comentario } : {}),
        },
      });
      let casosResueltos = 0;
      let sigueEnTaller: string | null = null;
      if (fin) {
        const casos = await tx.caso.findMany({ where: { ordenTrabajoId: id, estado: { in: ['ABIERTO', 'EN_PROCESO'] } }, select: { id: true, estado: true } });
        if (d.estado === 'CERRADA') {
          for (const c of casos) {
            await tx.caso.update({ where: { id: c.id }, data: { estado: 'RESUELTO', resueltoEn: new Date(), resolucion: `Resuelto en la orden ${o.numero}: ${d.comentario}` } });
            await tx.casoNota.create({ data: { casoId: c.id, usuarioId: ctx.usuario.sub, cambio: `${c.estado} → RESUELTO`, texto: `Orden ${o.numero} cerrada: ${d.comentario}` } });
          }
          casosResueltos = casos.length;
          // El odómetro del cabezal no retrocede
          if (o.cabezalId && odometro != null) await tx.cabezal.updateMany({ where: { id: o.cabezalId, odometro: { lt: odometro } }, data: { odometro } });
        } else {
          // Anulada: los casos no se pierden, quedan abiertos y sin orden
          for (const c of casos) await tx.casoNota.create({ data: { casoId: c.id, usuarioId: ctx.usuario.sub, texto: `La orden ${o.numero} se anuló (${d.comentario}); el caso sigue abierto` } });
          await tx.caso.updateMany({ where: { id: { in: casos.map((c) => c.id) } }, data: { ordenTrabajoId: null } });
        }
        // La unidad vuelve a estar disponible si ninguna otra orden abierta la tiene detenida
        const otra = await tx.ordenTrabajo.findFirst({ where: { id: { not: id }, estado: { in: [...ABIERTAS] }, detieneUnidad: true, ...(o.cabezalId ? { cabezalId: o.cabezalId } : { remolqueId: o.remolqueId }) }, select: { numero: true } });
        if (otra) sigueEnTaller = otra.numero;
        else {
          if (o.cabezalId) await tx.cabezal.updateMany({ where: { id: o.cabezalId, estado: 'EN_TALLER' }, data: { estado: 'ACTIVO' } });
          if (o.remolqueId) await tx.remolque.updateMany({ where: { id: o.remolqueId, estado: 'EN_TALLER' }, data: { estado: 'ACTIVO' } });
        }
      }
      await this.audit.registrar(ctx, { accion: d.estado === 'CERRADA' ? 'CERRAR' : d.estado === 'ANULADA' ? 'ANULAR' : 'EN_PROCESO', entidad: 'OrdenTrabajo', entidadId: id, antes: { estado: o.estado }, despues: { estado: d.estado, comentario: d.comentario, total: o.total } }, tx);
      return { o, casosResueltos, sigueEnTaller };
    });
    const msg = { EN_PROCESO: `Orden ${r.o.numero} en proceso`, CERRADA: `Orden ${r.o.numero} cerrada por Q${D(r.o.total).toFixed(2)}${r.casosResueltos ? ` · ${r.casosResueltos} caso(s) resuelto(s)` : ''}`, ANULADA: `Orden ${r.o.numero} anulada` }[d.estado];
    return { message: r.sigueEnTaller && d.estado !== 'EN_PROCESO' ? `${msg}. La unidad sigue con la orden ${r.sigueEnTaller} abierta` : msg };
  }

  // ─────────────────────────────── Mantenimiento ───────────────────────────────

  /** Cada unidad activa × cada plan que le aplica: cuánto falta (km o días) para el próximo servicio. */
  async mantenimiento(ctx: Ctx) {
    const sucursalId = this.sucursal(ctx);
    const hoy = new Date();
    const [planes, cabezales, remolques] = await Promise.all([
      this.prisma.planMantenimiento.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      this.prisma.cabezal.findMany({ where: { activo: true, sucursalId, estado: { not: 'VENDIDO' } }, select: { id: true, codigo: true, placa: true, odometro: true, estado: true }, orderBy: { codigo: 'asc' } }),
      this.prisma.remolque.findMany({ where: { activo: true, estado: { not: 'VENDIDO' } }, select: { id: true, codigo: true, placa: true, estado: true }, orderBy: { codigo: 'asc' } }),
    ]);
    if (!planes.length) return { data: { filas: [], resumen: { VENCIDO: 0, PROXIMO: 0, AL_DIA: 0, SIN_HISTORIAL: 0 }, sinPlanes: true } };
    const cerradas = await this.prisma.ordenTrabajo.findMany({ where: { estado: 'CERRADA', planId: { in: planes.map((p) => p.id) } }, select: { planId: true, cabezalId: true, remolqueId: true, fechaCierre: true, odometro: true, numero: true }, orderBy: { fechaCierre: 'desc' } });
    const abiertas = await this.prisma.ordenTrabajo.findMany({ where: { estado: { in: [...ABIERTAS] }, planId: { not: null } }, select: { planId: true, cabezalId: true, remolqueId: true, numero: true, id: true } });
    const viajesRemolque = remolques.length ? await this.prisma.viaje.findMany({ where: { estado: { in: [...TERMINADOS] }, remolqueId: { in: remolques.map((r) => r.id) } }, select: { remolqueId: true, fechaLlegada: true, kmSalida: true, kmLlegada: true } }) : [];
    const filas = [];
    for (const p of planes) {
      const unidades = [
        ...(p.aplicaA !== 'REMOLQUE' ? cabezales.map((c) => ({ tipo: 'CABEZAL' as const, ...c })) : []),
        ...(p.aplicaA !== 'CABEZAL' ? remolques.map((r) => ({ tipo: 'REMOLQUE' as const, ...r, odometro: null })) : []),
      ];
      for (const u of unidades) {
        const esCab = u.tipo === 'CABEZAL';
        const ultima = cerradas.find((o) => o.planId === p.id && (esCab ? o.cabezalId === u.id : o.remolqueId === u.id));
        const enCurso = abiertas.find((o) => o.planId === p.id && (esCab ? o.cabezalId === u.id : o.remolqueId === u.id));
        const kmRemolque = !esCab && ultima?.fechaCierre ? suma(viajesRemolque.filter((v) => v.remolqueId === u.id && v.fechaLlegada && v.fechaLlegada > ultima.fechaCierre! && v.kmSalida && v.kmLlegada).map((v) => D(v.kmLlegada!).minus(D(v.kmSalida!)))) : null;
        const e = estadoPlan(p, ultima?.fechaCierre ? { fecha: ultima.fechaCierre, odometro: ultima.odometro } : null, { hoy, odometro: u.odometro, kmDesde: kmRemolque });
        filas.push({
          planId: p.id, plan: p.nombre, cadaKm: p.cadaKm, cadaDias: p.cadaDias, tipo: u.tipo, unidadId: u.id, unidad: u.codigo, placa: u.placa, odometro: u.odometro,
          ultimo: ultima ? { numero: ultima.numero, fecha: ymd(ultima.fechaCierre), odometro: ultima.odometro } : null,
          ordenAbierta: enCurso ? { id: enCurso.id, numero: enCurso.numero } : null, ...e,
        });
      }
    }
    const orden = { VENCIDO: 0, PROXIMO: 1, SIN_HISTORIAL: 2, AL_DIA: 3 };
    filas.sort((a, b) => orden[a.estado] - orden[b.estado] || Number(a.faltaKm ?? a.faltaDias ?? 0) - Number(b.faltaKm ?? b.faltaDias ?? 0));
    const resumen = { VENCIDO: 0, PROXIMO: 0, AL_DIA: 0, SIN_HISTORIAL: 0 };
    for (const f of filas) resumen[f.estado] += 1;
    return { data: { filas, resumen, sinPlanes: false } };
  }

  /** Repuestos por marca: cuánto dura cada una (km entre cambios en el mismo cabezal) y cuánto cuesta por km. */
  async repuestosPorMarca(ctx: Ctx) {
    const usos = await this.prisma.ordenTrabajoRepuesto.findMany({
      where: { orden: { estado: 'CERRADA', sucursalId: this.sucursal(ctx) } },
      select: { repuestoId: true, cantidad: true, costoUnitario: true, marca: { select: { nombre: true } }, repuesto: { select: { nombre: true, categoria: true, marca: { select: { nombre: true } } } }, orden: { select: { cabezalId: true, remolqueId: true, odometro: true, fechaCierre: true, fechaApertura: true } } },
    });
    return {
      data: duracionPorMarca(usos.map((u) => ({
        unidad: u.orden.cabezalId ? `C${u.orden.cabezalId}` : `R${u.orden.remolqueId}`, repuestoId: u.repuestoId, repuesto: u.repuesto.nombre, categoria: u.repuesto.categoria,
        marca: u.marca?.nombre ?? u.repuesto.marca?.nombre ?? 'Sin marca', odometro: u.orden.cabezalId ? u.orden.odometro : null, fecha: u.orden.fechaCierre ?? u.orden.fechaApertura,
        costoUnitario: u.costoUnitario, cantidad: u.cantidad,
      }))),
    };
  }

  /** Para la campana: servicios vencidos o próximos de la sede, y órdenes abiertas hace más de una semana. */
  async avisos(ctx: Ctx) {
    const { data } = await this.mantenimiento(ctx);
    const lista: { id: string; tipo: string; nivel: 'info' | 'aviso' | 'critico'; titulo: string; detalle: string; ruta: string }[] = [];
    const vencidos = data.filas.filter((f) => f.estado === 'VENCIDO' && !f.ordenAbierta);
    const proximos = data.filas.filter((f) => f.estado === 'PROXIMO' && !f.ordenAbierta);
    const hoy = new Date().toISOString().slice(0, 10);
    if (vencidos.length) lista.push({ id: `mant-vencido:${hoy}:${vencidos.length}`, tipo: 'mantenimiento', nivel: 'critico', titulo: `${vencidos.length} servicio(s) de mantenimiento vencido(s)`, detalle: vencidos.slice(0, 4).map((f) => `${f.unidad}: ${f.plan}`).join(' · ') + (vencidos.length > 4 ? '…' : ''), ruta: '/home/taller?vista=MANTENIMIENTO' });
    if (proximos.length) lista.push({ id: `mant-proximo:${hoy}:${proximos.length}`, tipo: 'mantenimiento', nivel: 'aviso', titulo: `${proximos.length} servicio(s) próximo(s)`, detalle: proximos.slice(0, 4).map((f) => `${f.unidad}: ${f.plan}`).join(' · ') + (proximos.length > 4 ? '…' : ''), ruta: '/home/taller?vista=MANTENIMIENTO' });
    const viejas = await this.prisma.ordenTrabajo.count({ where: { sucursalId: this.sucursal(ctx), estado: { in: [...ABIERTAS] }, fechaApertura: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
    if (viejas) lista.push({ id: `ot-viejas:${hoy}:${viejas}`, tipo: 'mantenimiento', nivel: 'aviso', titulo: `${viejas} orden(es) de taller abiertas hace más de una semana`, detalle: 'Ciérrelas con lo que se hizo o anúlelas si ya no aplican.', ruta: '/home/taller' });
    return lista;
  }
}
