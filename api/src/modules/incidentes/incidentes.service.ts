/**
 * INCIDENTES Y MULTAS por sede: multas de tránsito, accidentes, robos, daños a la carga, averías en ruta y reclamos.
 * Cada uno lleva su costo (multa, daños, terceros), lo que se recupera (seguro, descuento al piloto en planilla),
 * la orden de taller que repara los daños y su trámite hasta cerrarlo. Avisa de multas por vencer y reclamos sin respuesta.
 * Lógica de cálculo en incidentes.logica.ts.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { D, r2, suma } from '../../common/money';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { validar } from '../../common/pipes/zod';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { TallerService } from '../taller/taller.service';
import { siguienteNumero } from '../viajes/viajes.logica';
import { agrupar, costoIncidente, crearIncidenteZ, editarIncidenteZ, estadoIncidenteZ, estadoMulta, filtroIncidentesZ, gestionarIncidenteZ } from './incidentes.logica';

const LOCK_NUMERO_IN = 710_003;
const ABIERTOS = ['ABIERTO', 'EN_TRAMITE'] as const;
const DIA = 86_400_000;
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const Q = (n: Prisma.Decimal.Value) => `Q${D(n).toNumber().toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PILOTO = { select: { id: true, empleado: { select: { id: true, nombres: true, apellidos: true } } } } as const;
const nombre = (p: { empleado: { nombres: string; apellidos: string } } | null) => (p ? `${p.empleado.nombres} ${p.empleado.apellidos}` : null);
export const TIPO_TEXTO: Record<string, string> = { MULTA: 'Multa', ACCIDENTE: 'Accidente', ROBO: 'Robo', DANO_CARGA: 'Daño a la carga', AVERIA_EN_RUTA: 'Avería en ruta', RECLAMO_CLIENTE: 'Reclamo del cliente', OTRO: 'Otro' };

@Injectable()
export class IncidentesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parametros: ParametrosService,
    private readonly taller: TallerService,
  ) {}

  private sucursal(ctx: Ctx) {
    if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo');
    return ctx.sucursalId;
  }

  private async cargar(ctx: Ctx, id: number, db: Tx | PrismaService = this.prisma) {
    const i = await db.incidente.findFirst({ where: { id, sucursalId: this.sucursal(ctx) } });
    if (!i) throw noEncontrado('Incidente', id);
    return i;
  }

  private abiertoOError(i: { estado: string; numero: string }) {
    if (i.estado === 'CERRADO' || i.estado === 'ANULADO') throw reglaNegocio('INCIDENTE_CERRADO', `El incidente ${i.numero} está ${i.estado.toLowerCase()}: ya no se cambia`);
  }

  /** Cabezal, remolque y piloto existen; si viene el viaje, lo que falte se toma de él. */
  private async referencias(tx: Tx, d: { cabezalId?: number | null; remolqueId?: number | null; pilotoId?: number | null; viajeId?: number | null }, sucursalId: number) {
    const r = { cabezalId: d.cabezalId ?? null, remolqueId: d.remolqueId ?? null, pilotoId: d.pilotoId ?? null, viajeId: d.viajeId ?? null };
    if (r.viajeId) {
      const v = await tx.viaje.findFirst({ where: { id: r.viajeId, sucursalId }, select: { cabezalId: true, remolqueId: true, pilotoId: true } });
      if (!v) throw reglaNegocio('VIAJE_INVALIDO', 'El viaje no existe en esta sede');
      r.cabezalId ??= v.cabezalId;
      r.remolqueId ??= v.remolqueId;
      r.pilotoId ??= v.pilotoId;
    }
    if (r.cabezalId && !(await tx.cabezal.count({ where: { id: r.cabezalId } }))) throw reglaNegocio('CABEZAL_INVALIDO', 'Elija un cabezal registrado');
    if (r.remolqueId && !(await tx.remolque.count({ where: { id: r.remolqueId } }))) throw reglaNegocio('REMOLQUE_INVALIDO', 'Elija un remolque registrado');
    if (r.pilotoId && !(await tx.piloto.count({ where: { id: r.pilotoId } }))) throw reglaNegocio('PILOTO_INVALIDO', 'Elija un piloto registrado');
    return r;
  }

  // ─────────────────────────────── Consultas ───────────────────────────────

  async listar(ctx: Ctx, q: unknown) {
    const f = validar(filtroIncidentesZ, q);
    const where: Prisma.IncidenteWhereInput = { sucursalId: this.sucursal(ctx), ...(f.tipo ? { tipo: f.tipo } : {}), ...(f.pilotoId ? { pilotoId: f.pilotoId } : {}), ...(f.cabezalId ? { cabezalId: f.cabezalId } : {}) };
    if (f.estado === 'ABIERTOS') where.estado = { in: [...ABIERTOS] };
    else if (f.estado !== 'TODOS') where.estado = f.estado;
    if (f.desde || f.hasta) where.fecha = { ...(f.desde ? { gte: new Date(f.desde.getTime() - 12 * 3_600_000) } : {}), ...(f.hasta ? { lte: new Date(f.hasta.getTime() + 12 * 3_600_000) } : {}) };
    if (f.q) where.OR = [{ numero: { contains: f.q, mode: 'insensitive' } }, { descripcion: { contains: f.q, mode: 'insensitive' } }, { numeroBoleta: { contains: f.q, mode: 'insensitive' } }, { cabezal: { codigo: { contains: f.q, mode: 'insensitive' } } }];
    const [filas, avisar] = await Promise.all([
      this.prisma.incidente.findMany({
        where, take: f.limit, orderBy: [{ fecha: 'desc' }],
        include: { cabezal: { select: { codigo: true, placa: true } }, remolque: { select: { codigo: true } }, piloto: PILOTO, viaje: { select: { numero: true } }, ordenTrabajo: { select: { numero: true, estado: true } } },
      }),
      this.parametros.numero('incidentes.avisar_multa_dias'),
    ]);
    const hoy = new Date();
    return {
      data: filas.map((i) => ({
        id: i.id, numero: i.numero, tipo: i.tipo, estado: i.estado, fecha: i.fecha, lugar: i.lugar, descripcion: i.descripcion,
        unidad: i.cabezal?.codigo ?? i.remolque?.codigo ?? null, placa: i.cabezal?.placa ?? null, piloto: nombre(i.piloto), viaje: i.viaje?.numero ?? null,
        orden: i.ordenTrabajo, responsable: i.responsable, autoridad: i.autoridad, numeroBoleta: i.numeroBoleta,
        multa: estadoMulta(i, hoy, avisar), fechaLimitePago: ymd(i.fechaLimitePago), estadoReclamo: i.estadoReclamo,
        ...costoIncidente(i),
      })),
    };
  }

  async detalle(ctx: Ctx, id: number) {
    await this.cargar(ctx, id);
    const i = await this.prisma.incidente.findUniqueOrThrow({
      where: { id },
      include: {
        cabezal: { select: { id: true, codigo: true, placa: true } }, remolque: { select: { id: true, codigo: true } }, piloto: PILOTO,
        viaje: { select: { id: true, numero: true, origen: true, destino: true } }, ordenTrabajo: { select: { id: true, numero: true, estado: true, total: true } },
        creadoPor: { select: { nombre: true } },
        descuentos: { select: { monto: true, planilla: { select: { id: true, periodo: true, tipo: true, estado: true } } }, orderBy: { id: 'asc' } },
      },
    });
    const avisar = await this.parametros.numero('incidentes.avisar_multa_dias');
    return {
      data: {
        ...i, piloto: i.piloto ? { id: i.piloto.id, nombre: nombre(i.piloto) } : null, creadoPor: i.creadoPor.nombre,
        multa: estadoMulta(i, new Date(), avisar), ...costoIncidente(i),
        porDescontar: r2(D(i.descuentoPiloto).minus(D(i.descontado))),
        descuentos: i.descuentos.map((x) => ({ monto: x.monto, planillaId: x.planilla.id, periodo: x.planilla.periodo, tipo: x.planilla.tipo, estado: x.planilla.estado })),
      },
    };
  }

  /** Resumen del período: totales por tipo, por piloto y por cabezal; multas sin pagar. */
  async resumen(ctx: Ctx, q: { desde?: string; hasta?: string }) {
    const sucursalId = this.sucursal(ctx);
    const hasta = q.hasta ? new Date(`${q.hasta}T23:59:59-06:00`) : new Date();
    const desde = q.desde ? new Date(`${q.desde}T00:00:00-06:00`) : new Date(hasta.getTime() - 365 * DIA);
    const filas = await this.prisma.incidente.findMany({
      where: { sucursalId, estado: { not: 'ANULADO' }, fecha: { gte: desde, lte: hasta } },
      include: { cabezal: { select: { codigo: true } }, piloto: PILOTO },
    });
    const porTipo = agrupar(filas, (f) => f.tipo).map((g) => ({ ...g, tipo: g.clave, texto: TIPO_TEXTO[g.clave] }));
    const porPiloto = agrupar(filas, (f) => nombre(f.piloto));
    const porCabezal = agrupar(filas, (f) => f.cabezal?.codigo ?? null);
    const sinPagar = filas.filter((f) => D(f.montoMulta).gt(0) && !f.pagadoEn);
    const totales = { incidentes: filas.length, ...Object.fromEntries((['costo', 'recuperado', 'neto'] as const).map((k) => [k, suma(filas.map((f) => costoIncidente(f)[k]))])), multasSinPagar: sinPagar.length, montoSinPagar: suma(sinPagar.map((f) => f.montoMulta)), porDescontar: suma(filas.map((f) => D(f.descuentoPiloto).minus(D(f.descontado)))) };
    return { data: { desde: ymd(desde), hasta: ymd(hasta), totales, porTipo, porPiloto, porCabezal } };
  }

  // ─────────────────────────────── Registro ───────────────────────────────

  async crear(ctx: Ctx, body: unknown) {
    const d = validar(crearIncidenteZ, body);
    const sucursalId = this.sucursal(ctx);
    const inc = await this.prisma.enTransaccion(async (tx) => {
      const ref = await this.referencias(tx, d, sucursalId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NUMERO_IN})`;
      const ultimo = await tx.incidente.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } });
      const i = await tx.incidente.create({
        data: {
          numero: siguienteNumero(ultimo?.numero, 'IN-'), sucursalId, tipo: d.tipo, fecha: d.fecha, lugar: d.lugar, descripcion: d.descripcion, ...ref,
          autoridad: d.autoridad, numeroBoleta: d.numeroBoleta, montoMulta: r2(d.montoMulta ?? 0), fechaLimitePago: d.fechaLimitePago ?? null,
          costoDanos: r2(d.costoDanos ?? 0), costoTerceros: r2(d.costoTerceros ?? 0), heridos: d.heridos ?? false, creadoPorId: ctx.usuario.sub,
        },
      });
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Incidente', entidadId: i.id, despues: { numero: i.numero, tipo: i.tipo, montoMulta: i.montoMulta, costoDanos: i.costoDanos } }, tx);
      return i;
    });
    let orden: string | null = null;
    if (d.abrirOrden) {
      const r = await this.taller.crear(ctx, {
        cabezalId: inc.cabezalId ?? undefined, remolqueId: inc.cabezalId ? undefined : inc.remolqueId ?? undefined, tipo: d.tipo === 'ACCIDENTE' ? 'CARROCERIA' : 'CORRECTIVO',
        prioridad: d.ponerEnTaller ? 'ALTA' : 'MODERADA', descripcion: `${TIPO_TEXTO[d.tipo]} ${inc.numero}: ${d.descripcion}`.slice(0, 1000), ponerEnTaller: d.ponerEnTaller,
      });
      await this.prisma.incidente.update({ where: { id: inc.id }, data: { ordenTrabajoId: r.data.id } });
      orden = r.data.numero;
    }
    return { data: { id: inc.id, numero: inc.numero }, message: `${TIPO_TEXTO[d.tipo]} registrado (${inc.numero})${orden ? ` con la orden de taller ${orden}` : ''}` };
  }

  async editar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(editarIncidenteZ, body);
    const sucursalId = this.sucursal(ctx);
    const i = await this.prisma.enTransaccion(async (tx) => {
      const i = await this.cargar(ctx, id, tx);
      this.abiertoOError(i);
      const ref = await this.referencias(tx, { cabezalId: d.cabezalId === undefined ? i.cabezalId : d.cabezalId, remolqueId: d.remolqueId === undefined ? i.remolqueId : d.remolqueId, pilotoId: d.pilotoId === undefined ? i.pilotoId : d.pilotoId, viajeId: d.viajeId === undefined ? i.viajeId : d.viajeId }, sucursalId);
      if (ref.pilotoId !== i.pilotoId && D(i.descontado).gt(0)) throw reglaNegocio('YA_DESCONTADO', 'Ya se descontó parte al piloto: no se puede cambiar de piloto');
      const datos = Object.fromEntries(Object.entries({ ...d, ...ref }).filter(([, v]) => v !== undefined));
      for (const k of ['montoMulta', 'costoDanos', 'costoTerceros'] as const) if (d[k] != null) datos[k] = r2(d[k]).toNumber();
      await tx.incidente.update({ where: { id }, data: datos });
      await this.audit.registrar(ctx, { accion: 'ACTUALIZAR', entidad: 'Incidente', entidadId: id, antes: i, despues: datos }, tx);
      return i;
    });
    return { message: `Incidente ${i.numero} actualizado` };
  }

  /** Pago de la multa, seguro, responsable, descuento al piloto y orden de taller de la reparación. */
  async gestionar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(gestionarIncidenteZ, body);
    const r = await this.prisma.enTransaccion(async (tx) => {
      const i = await this.cargar(ctx, id, tx);
      this.abiertoOError(i);
      const datos: Prisma.IncidenteUncheckedUpdateInput = {};
      if (d.responsable) datos.responsable = d.responsable;
      if (d.pagadoEn !== undefined) {
        if (D(i.montoMulta).lte(0) && d.pagadoEn) throw reglaNegocio('SIN_MULTA', 'Este incidente no tiene multa que pagar');
        datos.pagadoEn = d.pagadoEn;
        datos.montoPagado = d.pagadoEn ? r2(d.montoPagado ?? i.montoMulta) : 0;
      } else if (d.montoPagado != null) datos.montoPagado = r2(d.montoPagado);
      for (const k of ['aseguradora', 'numeroReclamo', 'estadoReclamo', 'reclamoEn'] as const) if (d[k] !== undefined) (datos as Record<string, unknown>)[k] = d[k];
      if (d.estadoReclamo && d.estadoReclamo !== 'SIN_RECLAMO' && !(d.aseguradora ?? i.aseguradora)) throw reglaNegocio('SIN_ASEGURADORA', 'Indique la aseguradora del reclamo');
      if (d.estadoReclamo === 'PRESENTADO' && !(d.reclamoEn ?? i.reclamoEn)) datos.reclamoEn = new Date();
      if (d.deducible != null) datos.deducible = r2(d.deducible);
      if (d.montoRecuperado != null) datos.montoRecuperado = r2(d.montoRecuperado);
      const responsable = d.responsable ?? i.responsable;
      if (d.descuentoPiloto != null || d.cuotasDescuento != null) {
        const descuento = r2(d.descuentoPiloto ?? i.descuentoPiloto);
        if (descuento.gt(0)) {
          if (!i.pilotoId) throw reglaNegocio('SIN_PILOTO', 'Indique el piloto antes de registrar un descuento');
          if (responsable !== 'PILOTO') throw reglaNegocio('RESPONSABLE', 'Solo se descuenta al piloto si él es el responsable');
          const { costo } = costoIncidente({ ...i, ...datos } as typeof i);
          if (descuento.gt(costo)) throw reglaNegocio('DESCUENTO_EXCESIVO', `El descuento no puede pasar del costo del incidente (${Q(costo)})`);
        }
        if (descuento.lt(D(i.descontado))) throw reglaNegocio('YA_DESCONTADO', `Ya se le descontaron ${Q(i.descontado)} en planillas aprobadas`);
        datos.descuentoPiloto = descuento;
        if (d.cuotasDescuento != null) datos.cuotasDescuento = d.cuotasDescuento;
      } else if (d.responsable && d.responsable !== 'PILOTO' && D(i.descuentoPiloto).gt(0)) {
        if (D(i.descontado).gt(0)) throw reglaNegocio('YA_DESCONTADO', 'Ya se descontó parte al piloto: el responsable sigue siendo el piloto');
        datos.descuentoPiloto = 0;
      }
      if (d.ordenTrabajoId !== undefined) {
        if (d.ordenTrabajoId && !(await tx.ordenTrabajo.count({ where: { id: d.ordenTrabajoId, sucursalId: i.sucursalId } }))) throw reglaNegocio('ORDEN_INVALIDA', 'La orden de taller no existe en esta sede');
        datos.ordenTrabajoId = d.ordenTrabajoId;
      }
      if (i.estado === 'ABIERTO' && (datos.pagadoEn || (d.estadoReclamo && d.estadoReclamo !== 'SIN_RECLAMO'))) datos.estado = 'EN_TRAMITE';
      const act = await tx.incidente.update({ where: { id }, data: datos });
      // Si bajó el descuento, las cuotas de planillas en borrador que ya no caben se quitan (se recalculan al regenerar)
      if (datos.descuentoPiloto !== undefined) await tx.descuentoIncidente.deleteMany({ where: { incidenteId: id, planilla: { estado: 'BORRADOR' } } });
      await this.audit.registrar(ctx, { accion: 'GESTIONAR', entidad: 'Incidente', entidadId: id, antes: i, despues: datos }, tx);
      return act;
    });
    return { data: costoIncidente(r), message: `Incidente ${r.numero} actualizado · costo neto ${Q(costoIncidente(r).neto)}` };
  }

  async cambiarEstado(ctx: Ctx, id: number, body: unknown) {
    const d = validar(estadoIncidenteZ, body);
    if (d.estado === 'ANULADO' && !tienePermiso(ctx.usuario, 'incidentes.anular')) throw prohibido('Anular incidentes requiere el permiso incidentes.anular');
    const i = await this.prisma.enTransaccion(async (tx) => {
      const i = await this.cargar(ctx, id, tx);
      this.abiertoOError(i);
      if (d.estado === 'CERRADO') {
        if (D(i.montoMulta).gt(0) && !i.pagadoEn) throw reglaNegocio('MULTA_SIN_PAGAR', 'Registre el pago de la multa antes de cerrar');
        if (i.estadoReclamo === 'PRESENTADO' || i.estadoReclamo === 'APROBADO') throw reglaNegocio('RECLAMO_PENDIENTE', 'El reclamo al seguro sigue en trámite: registre lo que pagó o si lo rechazaron');
        if (i.ordenTrabajoId && (await tx.ordenTrabajo.count({ where: { id: i.ordenTrabajoId, estado: { in: ['ABIERTA', 'EN_PROCESO'] } } }))) throw reglaNegocio('ORDEN_ABIERTA', 'La reparación sigue abierta en el taller');
        if (i.responsable === 'SIN_DEFINIR') throw reglaNegocio('SIN_RESPONSABLE', 'Indique quién fue responsable antes de cerrar');
      }
      if (d.estado === 'ANULADO') {
        if (D(i.descontado).gt(0)) throw reglaNegocio('YA_DESCONTADO', 'Ya se descontó parte al piloto en una planilla aprobada: no se puede anular');
        await tx.descuentoIncidente.deleteMany({ where: { incidenteId: id, planilla: { estado: 'BORRADOR' } } });
      }
      // Cerrar no cancela lo que falte por descontar al piloto: sigue saliendo en las próximas planillas
      await tx.incidente.update({
        where: { id },
        data: { estado: d.estado, ...(d.estado === 'CERRADO' ? { cerradoEn: new Date(), resolucion: d.comentario } : {}), ...(d.estado === 'ANULADO' ? { cerradoEn: new Date(), motivoAnulacion: d.comentario } : {}), ...(d.estado === 'EN_TRAMITE' ? { resolucion: d.comentario } : {}) },
      });
      await this.audit.registrar(ctx, { accion: d.estado === 'CERRADO' ? 'CERRAR' : d.estado === 'ANULADO' ? 'ANULAR' : 'EN_TRAMITE', entidad: 'Incidente', entidadId: id, antes: { estado: i.estado }, despues: { estado: d.estado, comentario: d.comentario } }, tx);
      return i;
    });
    return { message: { EN_TRAMITE: `Incidente ${i.numero} en trámite`, CERRADO: `Incidente ${i.numero} cerrado`, ANULADO: `Incidente ${i.numero} anulado` }[d.estado] };
  }

  // ─────────────────────────────── Avisos ───────────────────────────────

  /** Para la campana: multas vencidas o por vencer, reclamos al seguro sin respuesta y accidentes sin responsable. */
  async avisos(ctx: Ctx) {
    const sucursalId = this.sucursal(ctx);
    const [avisar, diasReclamo] = await Promise.all([this.parametros.numero('incidentes.avisar_multa_dias'), this.parametros.numero('incidentes.dias_reclamo')]);
    const abiertos = await this.prisma.incidente.findMany({ where: { sucursalId, estado: { in: [...ABIERTOS] } }, select: { id: true, numero: true, tipo: true, montoMulta: true, pagadoEn: true, fechaLimitePago: true, estadoReclamo: true, reclamoEn: true, responsable: true, fecha: true, cabezal: { select: { codigo: true } } } });
    const hoy = new Date();
    const h = ymd(hoy);
    const lista: { id: string; tipo: string; nivel: 'info' | 'aviso' | 'critico'; titulo: string; detalle: string; ruta: string }[] = [];
    const multas = abiertos.map((i) => ({ i, m: estadoMulta(i, hoy, avisar) }));
    const vencidas = multas.filter((x) => x.m?.estado === 'VENCIDA');
    const pronto = multas.filter((x) => x.m?.estado === 'POR_VENCER');
    if (vencidas.length) lista.push({ id: `multas-vencidas:${h}:${vencidas.length}`, tipo: 'incidente', nivel: 'critico', titulo: `${vencidas.length} multa(s) vencida(s) sin pagar: ${Q(suma(vencidas.map((x) => x.i.montoMulta)))}`, detalle: 'Pagarlas a tiempo evita recargos y que bloqueen la tarjeta de circulación.', ruta: '/home/incidentes?vista=MULTAS' });
    if (pronto.length) lista.push({ id: `multas-por-vencer:${h}:${pronto.length}`, tipo: 'incidente', nivel: 'aviso', titulo: `${pronto.length} multa(s) vencen en los próximos ${avisar} días`, detalle: pronto.slice(0, 4).map((x) => `${x.i.numero}${x.i.cabezal ? ` (${x.i.cabezal.codigo})` : ''}: ${Q(x.i.montoMulta)}`).join(' · '), ruta: '/home/incidentes?vista=MULTAS' });
    const reclamos = abiertos.filter((i) => i.estadoReclamo === 'PRESENTADO' && i.reclamoEn && hoy.getTime() - i.reclamoEn.getTime() > diasReclamo * DIA);
    if (reclamos.length) lista.push({ id: `reclamos-seguro:${h}:${reclamos.length}`, tipo: 'incidente', nivel: 'aviso', titulo: `${reclamos.length} reclamo(s) al seguro sin respuesta hace más de ${diasReclamo} días`, detalle: reclamos.slice(0, 4).map((i) => i.numero).join(' · '), ruta: '/home/incidentes' });
    const sinResp = abiertos.filter((i) => i.tipo === 'ACCIDENTE' && i.responsable === 'SIN_DEFINIR' && hoy.getTime() - i.fecha.getTime() > 7 * DIA);
    if (sinResp.length) lista.push({ id: `accidentes-sin-responsable:${h}:${sinResp.length}`, tipo: 'incidente', nivel: 'info', titulo: `${sinResp.length} accidente(s) de hace más de una semana sin responsable`, detalle: 'Defina si fue la empresa, el piloto o un tercero para cerrar el costo.', ruta: '/home/incidentes' });
    return lista;
  }
}
