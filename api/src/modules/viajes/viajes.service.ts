/**
 * VIAJES: programar → iniciar (con inspección) → finalizar (km de llegada) → liquidar (anticipos, costos, pago al piloto
 * y ganancia real). Cada paso valida el estado, guarda bitácora y deja el odómetro del cabezal al día.
 *
 * Un piloto (usuario ligado a un empleado con datos de piloto y sin permiso de programar) solo ve y toca SUS viajes.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { aYmd, fechaContable, parseFecha, sumarDias } from '../../common/fecha';
import { D, Decimal, r2, suma } from '../../common/money';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { Tx } from '../../common/prisma/prisma.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { validar } from '../../common/pipes/zod';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { VIGENCIA_HORAS } from '../inspecciones/inspecciones.logica';
import { CostoKmService } from './costo-km.service';
import { CasosService } from '../casos/casos.service';
import { CargasLaboralesService, factorIncluido } from '../../common/costos/cargas-laborales';
import {
  admiteCostos, anticipoZ, cancelarZ, costoZ, elegirTarifa, Estado, ETIQUETA_ESTADO, filtroRentabilidadZ, filtroViajesZ,
  finalizarZ, iniciarZ, liquidar, montoPorTarifa, programarZ, siguienteNumero, TRANSICIONES,
} from './viajes.logica';

const LOCK_NUMERO_VIAJE = 710_001;
const DOCS_OBLIGATORIOS = ['SEGURO', 'TARJETA_CIRCULACION'];
const nombreTercero = (t: { razonSocial: string | null; nombreComercial: string | null; nombres: string | null; apellidos: string | null }) =>
  t.nombreComercial || t.razonSocial || [t.nombres, t.apellidos].filter(Boolean).join(' ') || '—';
const nombreEmpleado = (e: { nombres: string; apellidos: string }) => `${e.nombres} ${e.apellidos}`.trim();

const INCLUIR_LISTA = {
  cliente: { select: { razonSocial: true, nombreComercial: true, nombres: true, apellidos: true } },
  cabezal: { select: { codigo: true, placa: true } },
  remolque: { select: { codigo: true, placa: true } },
  piloto: { select: { empleado: { select: { nombres: true, apellidos: true } } } },
  ruta: { select: { nombre: true, kmEstimados: true } },
} satisfies Prisma.ViajeInclude;

type ViajeLista = Prisma.ViajeGetPayload<{ include: typeof INCLUIR_LISTA }>;

@Injectable()
export class ViajesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parametros: ParametrosService,
    private readonly costoKm: CostoKmService,
    private readonly notificaciones: NotificacionesService,
    private readonly cargas: CargasLaboralesService,
  ) {}

  // ─────────────────────────────── utilidades ──────────────────────────────

  private sucursal(ctx: Ctx) {
    if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo');
    return ctx.sucursalId;
  }

  /** Si el usuario es un piloto sin permiso de programar, devuelve su pilotoId (y se le limita a sus viajes). */
  async pilotoPropio(ctx: Ctx): Promise<number | null> {
    if (tienePermiso(ctx.usuario, 'viajes.crear')) return null;
    const u = await this.prisma.usuario.findUnique({ where: { id: ctx.usuario.sub }, select: { empleado: { select: { piloto: { select: { id: true } } } } } });
    return u?.empleado?.piloto?.id ?? null;
  }

  /** El viaje de la sede, si el usuario puede verlo (un piloto, solo los suyos). */
  async cargar(ctx: Ctx, id: number, db: Tx | PrismaService = this.prisma) {
    const v = await db.viaje.findFirst({ where: { id, sucursalId: this.sucursal(ctx) } });
    if (!v) throw noEncontrado('Viaje', id);
    const propio = await this.pilotoPropio(ctx);
    if (propio != null && v.pilotoId !== propio) throw prohibido('Este viaje no está asignado a usted');
    return v;
  }

  private exigirEstado(v: { estado: Estado; numero: string }, accion: keyof typeof TRANSICIONES) {
    if (!TRANSICIONES[accion].includes(v.estado)) {
      const verbo = { iniciar: 'iniciar', finalizar: 'finalizar', liquidar: 'liquidar', cancelar: 'cancelar' }[accion];
      throw reglaNegocio('ESTADO_VIAJE', `El viaje ${v.numero} está ${ETIQUETA_ESTADO[v.estado]}: no se puede ${verbo}`);
    }
  }

  /** Bloqueo de fila: dos despachadores no pueden mover el mismo viaje a la vez. */
  private async bloquear(tx: Tx, id: number) {
    await tx.$queryRaw`SELECT id FROM viajes WHERE id = ${id} FOR UPDATE`;
  }

  private async recalcularCostos(tx: Tx, viajeId: number) {
    const [c, a] = await Promise.all([
      tx.costoViaje.aggregate({ where: { viajeId }, _sum: { monto: true } }),
      tx.anticipoViaje.aggregate({ where: { viajeId }, _sum: { monto: true } }),
    ]);
    await tx.viaje.update({ where: { id: viajeId }, data: { totalCostos: r2(c._sum.monto), anticipoPiloto: r2(a._sum.monto) } });
  }

  /** Validaciones de cabezal, remolque, piloto y documentos para una fecha de salida. Devuelve avisos no bloqueantes. */
  private async validarRecursos(db: Tx, d: { cabezalId: number; remolqueId?: number | null; pilotoId: number; clienteId: number; fecha: Date }) {
    const avisos: string[] = [];
    const [cabezal, piloto, cliente, remolque] = await Promise.all([
      db.cabezal.findUnique({ where: { id: d.cabezalId }, include: { documentos: { where: { activo: true }, orderBy: { vence: 'desc' } } } }),
      db.piloto.findUnique({ where: { id: d.pilotoId }, include: { empleado: { select: { nombres: true, apellidos: true, estado: true } } } }),
      db.tercero.findUnique({ where: { id: d.clienteId } }),
      d.remolqueId ? db.remolque.findUnique({ where: { id: d.remolqueId }, include: { documentos: { where: { activo: true }, orderBy: { vence: 'desc' } } } }) : null,
    ]);
    if (!cliente || !cliente.activo || !cliente.esCliente) throw reglaNegocio('CLIENTE_INVALIDO', 'Elija un cliente activo');
    if (!cabezal || !cabezal.activo) throw reglaNegocio('CABEZAL_INVALIDO', 'Elija un cabezal activo');
    if (cabezal.estado !== 'ACTIVO') throw reglaNegocio('CABEZAL_NO_DISPONIBLE', `El cabezal ${cabezal.codigo} está ${cabezal.estado === 'EN_TALLER' ? 'en taller' : cabezal.estado.toLowerCase()}`);
    if (!piloto || !piloto.activo || piloto.empleado.estado !== 'ACTIVO') throw reglaNegocio('PILOTO_INVALIDO', 'Elija un piloto activo');
    const dia = fechaContable(d.fecha);
    if (piloto.licenciaVence < dia) throw reglaNegocio('LICENCIA_VENCIDA', `La licencia de ${nombreEmpleado(piloto.empleado)} venció el ${aYmd(piloto.licenciaVence)}`);
    if (piloto.licenciaVence < sumarDias(dia, 30)) avisos.push(`La licencia de ${nombreEmpleado(piloto.empleado)} vence el ${aYmd(piloto.licenciaVence)}`);
    if (remolque && (!remolque.activo || remolque.estado !== 'ACTIVO')) throw reglaNegocio('REMOLQUE_NO_DISPONIBLE', `El remolque ${remolque.codigo} no está disponible`);

    const revisarDocs = (unidad: string, docs: { tipo: string; vence: Date }[]) => {
      for (const tipo of DOCS_OBLIGATORIOS) {
        const doc = docs.find((x) => x.tipo === tipo); // el de vencimiento más lejano
        const nombre = tipo === 'SEGURO' ? 'seguro' : 'tarjeta de circulación';
        if (!doc) avisos.push(`${unidad} no tiene ${nombre} registrado`);
        else if (doc.vence < dia) throw reglaNegocio('DOCUMENTO_VENCIDO', `${unidad}: el ${nombre} venció el ${aYmd(doc.vence)}`);
      }
    };
    revisarDocs(`Cabezal ${cabezal.codigo}`, cabezal.documentos);
    if (remolque) revisarDocs(`Remolque ${remolque.codigo}`, remolque.documentos);
    return { cabezal, piloto, cliente, remolque, avisos };
  }

  private fila(v: ViajeLista) {
    const km = v.kmLlegada && v.kmSalida ? D(v.kmLlegada).minus(D(v.kmSalida)) : null;
    return {
      id: v.id, numero: v.numero, estado: v.estado,
      cliente: nombreTercero(v.cliente), clienteId: v.clienteId,
      ruta: v.ruta?.nombre ?? null, origen: v.origen, destino: v.destino,
      cabezal: v.cabezal.codigo, placa: v.cabezal.placa, remolque: v.remolque?.codigo ?? null,
      piloto: nombreEmpleado(v.piloto.empleado), pilotoId: v.pilotoId,
      fechaSalida: v.fechaSalida, fechaLlegada: v.fechaLlegada, fechaCompromiso: v.fechaCompromiso,
      kmRecorridos: km, kmVacios: v.kmVacios,
      montoCobrado: v.montoCobrado, totalCostos: v.totalCostos, anticipoPiloto: v.anticipoPiloto, ganancia: v.ganancia,
      aTiempo: v.fechaCompromiso && v.fechaLlegada ? v.fechaLlegada <= v.fechaCompromiso : null,
    };
  }

  // ─────────────────────────────── consultas ───────────────────────────────

  async listar(ctx: Ctx, query: unknown) {
    const f = validar(filtroViajesZ, query ?? {});
    const propio = await this.pilotoPropio(ctx);
    const where: Prisma.ViajeWhereInput = {
      sucursalId: this.sucursal(ctx),
      ...(f.estado === 'ABIERTOS' ? { estado: { in: ['PROGRAMADO', 'EN_RUTA', 'FINALIZADO'] } } : f.estado ? { estado: f.estado } : {}),
      ...(f.desde || f.hasta ? { fechaSalida: { ...(f.desde ? { gte: parseFecha(f.desde) } : {}), ...(f.hasta ? { lt: sumarDias(parseFecha(f.hasta), 1) } : {}) } } : {}),
      ...(f.cabezalId ? { cabezalId: f.cabezalId } : {}),
      ...(propio != null ? { pilotoId: propio } : f.pilotoId ? { pilotoId: f.pilotoId } : {}),
      ...(f.clienteId ? { clienteId: f.clienteId } : {}),
      ...(f.q ? { OR: [{ numero: { contains: f.q, mode: 'insensitive' } }, { referencia: { contains: f.q, mode: 'insensitive' } }, { destino: { contains: f.q, mode: 'insensitive' } }] } : {}),
    };
    const [filas, conteo] = await Promise.all([
      this.prisma.viaje.findMany({ where, include: INCLUIR_LISTA, orderBy: [{ fechaSalida: 'desc' }, { id: 'desc' }], take: f.limit }),
      this.prisma.viaje.groupBy({ by: ['estado'], where: { sucursalId: where.sucursalId, ...(propio != null ? { pilotoId: propio } : {}) }, _count: true }),
    ]);
    return { data: { viajes: filas.map((v) => this.fila(v)), porEstado: Object.fromEntries(conteo.map((c) => [c.estado, c._count])) } };
  }

  async detalle(ctx: Ctx, id: number) {
    await this.cargar(ctx, id);
    const v = await this.prisma.viaje.findUniqueOrThrow({
      where: { id },
      include: {
        ...INCLUIR_LISTA,
        tarifa: { select: { tipo: true, monto: true, descripcion: true } },
        costos: { orderBy: { fecha: 'asc' }, include: { registradoPor: { select: { nombre: true } } } },
        anticipos: { orderBy: { fecha: 'asc' }, include: { entregadoPor: { select: { nombre: true } } } },
        cargas: { where: { anulada: false }, orderBy: { fecha: 'asc' }, select: { id: true, fecha: true, galones: true, total: true, odometro: true, rendimiento: true, estacion: true } },
        gastos: { where: { estado: 'REGISTRADO' }, select: { id: true, concepto: true, monto: true, fecha: true } },
        inspecciones: { orderBy: { fecha: 'desc' }, select: { id: true, fecha: true, resultado: true, fallas: true } },
        creadoPor: { select: { nombre: true } },
        liquidadoPor: { select: { nombre: true } },
      },
    });
    return { data: { ...this.fila(v), ...{
      rutaId: v.rutaId, tarifaId: v.tarifaId, cabezalId: v.cabezalId, remolqueId: v.remolqueId,
      carga: v.carga, toneladas: v.toneladas, referencia: v.referencia, observaciones: v.observaciones, motivoCancelacion: v.motivoCancelacion,
      kmSalida: v.kmSalida, kmLlegada: v.kmLlegada, iniciadoEn: v.iniciadoEn, pagoPiloto: v.pagoPiloto, tarifa: v.tarifa,
      kmRuta: v.ruta?.kmEstimados ?? null,
      costos: v.costos.map((c) => ({ id: c.id, tipo: c.tipo, descripcion: c.descripcion, monto: c.monto, fecha: c.fecha, pagadoPorPiloto: c.pagadoPorPiloto, documento: c.documento, archivoId: c.archivoId, desdeCarga: c.cargaId != null, registro: c.registradoPor.nombre })),
      anticipos: v.anticipos.map((a) => ({ id: a.id, monto: a.monto, medio: a.medio, fecha: a.fecha, nota: a.nota, entrego: a.entregadoPor.nombre })),
      cargas: v.cargas, gastos: v.gastos, inspecciones: v.inspecciones,
      creadoPor: v.creadoPor.nombre, creadoEn: v.creadoEn, liquidadoPor: v.liquidadoPor?.nombre ?? null, liquidadoEn: v.liquidadoEn, saldoPiloto: v.saldoPiloto,
    }, liquidacion: await this.liquidacion(v) } };
  }

  /** Liquidación: la guardada si ya está liquidado; si no, una vista previa con el costo por km de hoy. */
  private async liquidacion(v: { id: number; estado: Estado; montoCobrado: Prisma.Decimal; pagoPiloto: Prisma.Decimal; kmSalida: Prisma.Decimal | null; kmLlegada: Prisma.Decimal | null; costoKmFijo: Prisma.Decimal | null; factorCargas: Prisma.Decimal | null; fechaLlegada: Date | null }) {
    if (v.estado === 'CANCELADO') return null;
    const [costos, anticipos, gastos] = await Promise.all([
      this.prisma.costoViaje.findMany({ where: { viajeId: v.id }, select: { tipo: true, monto: true, pagadoPorPiloto: true } }),
      this.prisma.anticipoViaje.findMany({ where: { viajeId: v.id }, select: { monto: true } }),
      this.prisma.gasto.findMany({ where: { viajeId: v.id, estado: 'REGISTRADO' }, select: { monto: true } }),
    ]);
    const km = v.kmLlegada && v.kmSalida ? D(v.kmLlegada).minus(D(v.kmSalida)) : D(0);
    const ck = v.costoKmFijo != null ? { costoKm: D(v.costoKmFijo), fuente: 'LIQUIDACION', avisos: [] as string[] } : await this.costoKm.calcular(v.fechaLlegada ?? new Date());
    const factorCargas = v.factorCargas != null ? D(v.factorCargas) : factorIncluido(await this.cargas.conceptos());
    const l = liquidar({
      montoCobrado: v.montoCobrado, pagoPiloto: v.pagoPiloto, kmRecorridos: km, costoKmFijo: ck.costoKm, factorCargas,
      costos: [...costos, ...gastos.map((g) => ({ tipo: 'GASTO_EMPRESA', monto: g.monto, pagadoPorPiloto: false }))],
      anticipos: anticipos.map((a) => a.monto),
    });
    return { ...l, definitiva: v.estado === 'LIQUIDADO', fuenteCostoKm: ck.fuente, avisos: ck.avisos };
  }

  // ─────────────────────────────── programar ───────────────────────────────

  async programar(ctx: Ctx, body: unknown) {
    const d = validar(programarZ, body);
    const sucursalId = this.sucursal(ctx);
    const r = await this.prisma.enTransaccion(async (tx) => {
      const { piloto, avisos } = await this.validarRecursos(tx, { ...d, fecha: d.fechaSalida });
      const ruta = d.rutaId ? await tx.ruta.findFirst({ where: { id: d.rutaId, activo: true } }) : null;
      if (d.rutaId && !ruta) throw reglaNegocio('RUTA_INVALIDA', 'Elija una ruta activa');
      if (!ruta && (!d.origen || !d.destino)) throw reglaNegocio('ORIGEN_DESTINO', 'Elija una ruta o escriba el origen y el destino');

      // Tarifa: la indicada o la vigente del cliente para esa ruta
      let tarifa = d.tarifaId ? await tx.tarifa.findFirst({ where: { id: d.tarifaId, clienteId: d.clienteId, activo: true } }) : null;
      if (d.tarifaId && !tarifa) throw reglaNegocio('TARIFA_INVALIDA', 'La tarifa no es de este cliente o está inactiva');
      if (!tarifa) tarifa = elegirTarifa(await tx.tarifa.findMany({ where: { clienteId: d.clienteId } }), ruta?.id ?? null, d.fechaSalida);
      let monto = d.montoCobrado ?? null;
      if (monto == null) {
        if (!tarifa) throw reglaNegocio('SIN_TARIFA', 'El cliente no tiene tarifa vigente para esta ruta: escriba el monto a cobrar');
        if (tarifa.tipo === 'POR_KM' && !ruta) throw reglaNegocio('SIN_KM', 'La tarifa es por km: elija la ruta o escriba el monto a cobrar');
        if (tarifa.tipo === 'POR_TONELADA' && !d.toneladas) throw reglaNegocio('SIN_TONELADAS', 'La tarifa es por tonelada: escriba las toneladas');
      }
      const montoCobrado = monto != null ? r2(monto) : montoPorTarifa(tarifa!, ruta?.kmEstimados ?? 0, d.toneladas ?? 0);

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NUMERO_VIAJE})`;
      const ultimo = await tx.viaje.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } });
      const viaje = await tx.viaje.create({
        data: {
          numero: siguienteNumero(ultimo?.numero), sucursalId, clienteId: d.clienteId, rutaId: ruta?.id ?? null, tarifaId: tarifa?.id ?? null,
          cabezalId: d.cabezalId, remolqueId: d.remolqueId ?? null, pilotoId: d.pilotoId,
          origen: d.origen ?? ruta!.origen, destino: d.destino ?? ruta!.destino, carga: d.carga, toneladas: d.toneladas ?? null, referencia: d.referencia,
          fechaSalida: d.fechaSalida, fechaCompromiso: d.fechaCompromiso ?? null, kmVacios: d.kmVacios ?? 0,
          montoCobrado, pagoPiloto: d.pagoPiloto != null ? r2(d.pagoPiloto) : piloto.pagoPorViaje, observaciones: d.observaciones, creadoPorId: ctx.usuario.sub,
        },
      });
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Viaje', entidadId: viaje.id, despues: { numero: viaje.numero, montoCobrado, tarifaId: tarifa?.id ?? null } }, tx);
      return { viaje, avisos };
    });
    return { data: { id: r.viaje.id, numero: r.viaje.numero, avisos: r.avisos }, message: `Viaje ${r.viaje.numero} programado` };
  }

  async editar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(programarZ.partial(), body);
    const r = await this.prisma.enTransaccion(async (tx) => {
      await this.bloquear(tx, id);
      const v = await this.cargar(ctx, id, tx);
      if (v.estado !== 'PROGRAMADO') throw reglaNegocio('ESTADO_VIAJE', `El viaje ${v.numero} ya salió: solo se editan viajes programados`);
      const nuevo = { cabezalId: d.cabezalId ?? v.cabezalId, remolqueId: d.remolqueId !== undefined ? d.remolqueId : v.remolqueId, pilotoId: d.pilotoId ?? v.pilotoId, clienteId: d.clienteId ?? v.clienteId, fecha: d.fechaSalida ?? v.fechaSalida };
      const { avisos } = await this.validarRecursos(tx, nuevo);
      const data: Prisma.ViajeUncheckedUpdateInput = {
        ...(d.clienteId ? { clienteId: d.clienteId } : {}), ...(d.cabezalId ? { cabezalId: d.cabezalId } : {}),
        ...(d.remolqueId !== undefined ? { remolqueId: d.remolqueId } : {}), ...(d.pilotoId ? { pilotoId: d.pilotoId } : {}),
        ...(d.rutaId !== undefined ? { rutaId: d.rutaId } : {}), ...(d.tarifaId !== undefined ? { tarifaId: d.tarifaId } : {}),
        ...(d.origen ? { origen: d.origen } : {}), ...(d.destino ? { destino: d.destino } : {}),
        ...(d.carga !== undefined ? { carga: d.carga } : {}), ...(d.toneladas !== undefined ? { toneladas: d.toneladas } : {}),
        ...(d.referencia !== undefined ? { referencia: d.referencia } : {}), ...(d.fechaSalida ? { fechaSalida: d.fechaSalida } : {}),
        ...(d.fechaCompromiso !== undefined ? { fechaCompromiso: d.fechaCompromiso } : {}), ...(d.kmVacios != null ? { kmVacios: d.kmVacios } : {}),
        ...(d.montoCobrado != null ? { montoCobrado: r2(d.montoCobrado) } : {}), ...(d.pagoPiloto != null ? { pagoPiloto: r2(d.pagoPiloto) } : {}),
        ...(d.observaciones !== undefined ? { observaciones: d.observaciones } : {}),
      };
      await tx.viaje.update({ where: { id }, data });
      await this.audit.registrar(ctx, { accion: 'ACTUALIZAR', entidad: 'Viaje', entidadId: id, antes: v, despues: data }, tx);
      return { numero: v.numero, avisos };
    });
    return { data: { avisos: r.avisos }, message: `Viaje ${r.numero} actualizado` };
  }

  // ─────────────────────────────── iniciar / finalizar ─────────────────────

  async iniciar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(iniciarZ, body ?? {});
    const exigir = await this.parametros.booleano('viajes.exigir_inspeccion');
    const r = await this.prisma.enTransaccion(async (tx) => {
      await this.bloquear(tx, id);
      const v = await this.cargar(ctx, id, tx);
      this.exigirEstado(v, 'iniciar');
      const fecha = d.fecha ?? new Date();
      const { cabezal, avisos } = await this.validarRecursos(tx, { ...v, fecha });

      const ocupado = await tx.viaje.findFirst({ where: { id: { not: id }, estado: 'EN_RUTA', OR: [{ cabezalId: v.cabezalId }, { pilotoId: v.pilotoId }, ...(v.remolqueId ? [{ remolqueId: v.remolqueId }] : [])] }, select: { numero: true, cabezalId: true, pilotoId: true } });
      if (ocupado) throw reglaNegocio('RECURSO_EN_RUTA', `${ocupado.cabezalId === v.cabezalId ? 'El cabezal' : ocupado.pilotoId === v.pilotoId ? 'El piloto' : 'El remolque'} sigue en el viaje ${ocupado.numero}: finalícelo primero`);

      const kmSalida = d.kmSalida != null ? D(d.kmSalida) : D(cabezal.odometro);
      if (kmSalida.lt(D(cabezal.odometro))) throw reglaNegocio('ODOMETRO_MENOR', `El odómetro de salida (${kmSalida.toFixed(1)}) es menor que el último registrado del cabezal ${cabezal.codigo} (${D(cabezal.odometro).toFixed(1)} km)`);

      // Inspección pre viaje de las últimas 24 h, del mismo cabezal (y remolque), sin una rechazada después
      // Una inspección rechazada deja el cabezal fuera de servicio hasta que otra lo apruebe, sin importar la fecha
      const desde = new Date(fecha.getTime() - VIGENCIA_HORAS * 3_600_000);
      const ultima = await tx.inspeccion.findFirst({ where: { cabezalId: v.cabezalId }, orderBy: { fecha: 'desc' } });
      let inspeccionId: number | null = null;
      if (ultima?.resultado === 'RECHAZADA') throw reglaNegocio('INSPECCION_RECHAZADA', `La última inspección del cabezal ${cabezal.codigo} tiene fallas críticas: no puede salir hasta repararlas y volver a inspeccionarlo`);
      const valida = ultima && ultima.fecha >= desde && (!v.remolqueId || ultima.remolqueId === v.remolqueId) ? ultima : null;
      if (valida) inspeccionId = valida.id;
      else if (exigir) {
        if (!d.sinInspeccion) throw reglaNegocio('INSPECCION_REQUERIDA', `Falta la inspección pre viaje de hoy del cabezal ${cabezal.codigo}${v.remolqueId ? ' con su remolque' : ''}`);
        if (!tienePermiso(ctx.usuario, 'viajes.liquidar')) throw prohibido('Solo un supervisor (permiso de liquidar viajes) puede autorizar la salida sin inspección');
        avisos.push('Salió sin inspección pre viaje (autorizado)');
      }
      const bloqueos = await CasosService.bloqueantes(tx, v.cabezalId, v.remolqueId);
      if (bloqueos.length) throw reglaNegocio('CASO_ABIERTO', `No puede salir: ${bloqueos.map((b) => `${b.numero} (${b.titulo})`).slice(0, 3).join(', ')} sigue(n) abierto(s)`);
      if (inspeccionId) await tx.inspeccion.update({ where: { id: inspeccionId }, data: { viajeId: id } });

      await tx.viaje.update({ where: { id }, data: { estado: 'EN_RUTA', kmSalida, iniciadoEn: fecha } });
      if (kmSalida.gt(D(cabezal.odometro))) await tx.cabezal.update({ where: { id: cabezal.id }, data: { odometro: kmSalida } });
      await this.audit.registrar(ctx, { accion: 'INICIAR', entidad: 'Viaje', entidadId: id, antes: { estado: v.estado }, despues: { estado: 'EN_RUTA', kmSalida, inspeccionId, sinInspeccion: !inspeccionId } }, tx);
      return { numero: v.numero, avisos };
    });
    return { data: { avisos: r.avisos }, message: `Viaje ${r.numero} en ruta` };
  }

  async finalizar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(finalizarZ, body);
    const r = await this.prisma.enTransaccion(async (tx) => {
      await this.bloquear(tx, id);
      const v = await this.cargar(ctx, id, tx);
      this.exigirEstado(v, 'finalizar');
      const kmLlegada = D(d.kmLlegada);
      const recorridos = kmLlegada.minus(D(v.kmSalida));
      if (recorridos.lte(0)) throw reglaNegocio('KM_LLEGADA', `Los km de llegada deben ser mayores que los de salida (${D(v.kmSalida).toFixed(1)})`);
      const kmVacios = d.kmVacios != null ? D(d.kmVacios) : D(v.kmVacios);
      if (kmVacios.gt(recorridos)) throw reglaNegocio('KM_VACIOS', `Los km vacíos (${kmVacios.toFixed(0)}) no pueden ser más que los recorridos (${recorridos.toFixed(0)})`);
      const fecha = d.fecha ?? new Date();
      if (v.iniciadoEn && fecha < v.iniciadoEn) throw reglaNegocio('FECHA_LLEGADA', 'La llegada no puede ser antes de la salida');
      await tx.viaje.update({ where: { id }, data: { estado: 'FINALIZADO', kmLlegada, kmVacios, fechaLlegada: fecha, ...(d.observaciones ? { observaciones: [v.observaciones, d.observaciones].filter(Boolean).join('\n') } : {}) } });
      await tx.cabezal.updateMany({ where: { id: v.cabezalId, odometro: { lt: kmLlegada } }, data: { odometro: kmLlegada } });
      await this.audit.registrar(ctx, { accion: 'FINALIZAR', entidad: 'Viaje', entidadId: id, antes: { estado: v.estado }, despues: { estado: 'FINALIZADO', kmLlegada, kmVacios } }, tx);
      const meta = await this.parametros.numero('viajes.meta_km_vacios');
      const pct = kmVacios.div(recorridos).times(100);
      return { numero: v.numero, km: recorridos, avisos: pct.gt(meta) ? [`Km vacíos: ${pct.toFixed(0)} % del viaje (meta: menos de ${meta} %)`] : [] };
    });
    return { data: { kmRecorridos: r.km, avisos: r.avisos }, message: `Viaje ${r.numero} finalizado: ${r.km.toFixed(0)} km` };
  }

  async cancelar(ctx: Ctx, id: number, body: unknown) {
    const { motivo } = validar(cancelarZ, body);
    const numero = await this.prisma.enTransaccion(async (tx) => {
      await this.bloquear(tx, id);
      const v = await this.cargar(ctx, id, tx);
      this.exigirEstado(v, 'cancelar');
      if (v.estado === 'EN_RUTA' && !tienePermiso(ctx.usuario, 'viajes.liquidar')) throw prohibido('Un viaje en ruta solo lo cancela un supervisor');
      const anticipos = await tx.anticipoViaje.count({ where: { viajeId: id } });
      if (anticipos) throw reglaNegocio('TIENE_ANTICIPOS', 'El viaje tiene anticipos entregados: elimínelos (si se devolvió el efectivo) o finalice y liquide el viaje');
      await tx.viaje.update({ where: { id }, data: { estado: 'CANCELADO', motivoCancelacion: motivo } });
      await tx.inspeccion.updateMany({ where: { viajeId: id }, data: { viajeId: null } });
      await this.audit.registrar(ctx, { accion: 'CANCELAR', entidad: 'Viaje', entidadId: id, antes: { estado: v.estado }, despues: { estado: 'CANCELADO', motivo } }, tx);
      return v.numero;
    });
    return { message: `Viaje ${numero} cancelado` };
  }

  // ─────────────────────────────── costos y anticipos ──────────────────────

  async agregarCosto(ctx: Ctx, id: number, body: unknown) {
    const d = validar(costoZ, body);
    if (d.uuidCliente) {
      const ya = await this.prisma.costoViaje.findUnique({ where: { uuidCliente: d.uuidCliente } });
      if (ya) {
        if (ya.viajeId !== id) throw reglaNegocio('UUID_REPETIDO', 'Ese identificador ya se usó en otro viaje');
        return { data: { id: ya.id }, message: 'Gasto ya recibido' };
      }
    }
    if (d.archivoId && !(await this.prisma.archivo.count({ where: { id: d.archivoId, creadoPorId: ctx.usuario.sub } }))) throw reglaNegocio('EVIDENCIA_AJENA', 'Solo puede adjuntar fotos que usted subió');
    if (d.tipo === 'COMBUSTIBLE') throw reglaNegocio('COMBUSTIBLE_COMO_CARGA', 'El combustible se registra como carga (con galones y odómetro) en Combustible; así se calcula el rendimiento');
    const r = await this.prisma.enTransaccion(async (tx) => {
      await this.bloquear(tx, id);
      const v = await this.cargar(ctx, id, tx);
      if (!admiteCostos(v.estado)) throw reglaNegocio('ESTADO_VIAJE', `El viaje ${v.numero} está ${ETIQUETA_ESTADO[v.estado]}: ya no admite costos`);
      const c = await tx.costoViaje.create({ data: { viajeId: id, tipo: d.tipo, monto: r2(d.monto), descripcion: d.descripcion, documento: d.documento, pagadoPorPiloto: d.pagadoPorPiloto, fecha: d.fecha ?? new Date(), archivoId: d.archivoId ?? null, registradoPorId: ctx.usuario.sub, uuidCliente: d.uuidCliente ?? null } });
      await this.recalcularCostos(tx, id);
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'CostoViaje', entidadId: c.id, despues: { viajeId: id, ...d } }, tx);
      return c;
    });
    return { data: { id: r.id }, message: `Costo de Q${r2(d.monto).toFixed(2)} registrado` };
  }

  async quitarCosto(ctx: Ctx, id: number, costoId: number) {
    await this.prisma.enTransaccion(async (tx) => {
      await this.bloquear(tx, id);
      const v = await this.cargar(ctx, id, tx);
      if (!admiteCostos(v.estado)) throw reglaNegocio('ESTADO_VIAJE', `El viaje ${v.numero} está ${ETIQUETA_ESTADO[v.estado]}: ya no se modifican sus costos`);
      const c = await tx.costoViaje.findFirst({ where: { id: costoId, viajeId: id } });
      if (!c) throw noEncontrado('Costo', costoId);
      if (c.cargaId) throw reglaNegocio('COSTO_DE_CARGA', 'Este costo es una carga de combustible: anule la carga en Combustible');
      await tx.costoViaje.delete({ where: { id: costoId } });
      await this.recalcularCostos(tx, id);
      await this.audit.registrar(ctx, { accion: 'ELIMINAR', entidad: 'CostoViaje', entidadId: costoId, antes: c }, tx);
    });
    return { message: 'Costo eliminado' };
  }

  async agregarAnticipo(ctx: Ctx, id: number, body: unknown) {
    const d = validar(anticipoZ, body);
    const numero = await this.prisma.enTransaccion(async (tx) => {
      await this.bloquear(tx, id);
      const v = await this.cargar(ctx, id, tx);
      if (!admiteCostos(v.estado)) throw reglaNegocio('ESTADO_VIAJE', `El viaje ${v.numero} está ${ETIQUETA_ESTADO[v.estado]}: ya no admite anticipos`);
      const a = await tx.anticipoViaje.create({ data: { viajeId: id, monto: r2(d.monto), medio: d.medio, nota: d.nota, archivoId: d.archivoId ?? null, entregadoPorId: ctx.usuario.sub } });
      await this.recalcularCostos(tx, id);
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'AnticipoViaje', entidadId: a.id, despues: { viajeId: id, ...d } }, tx);
      return v.numero;
    });
    return { message: `Anticipo de Q${r2(d.monto).toFixed(2)} entregado (viaje ${numero})` };
  }

  async quitarAnticipo(ctx: Ctx, id: number, anticipoId: number) {
    await this.prisma.enTransaccion(async (tx) => {
      await this.bloquear(tx, id);
      const v = await this.cargar(ctx, id, tx);
      if (!admiteCostos(v.estado)) throw reglaNegocio('ESTADO_VIAJE', `El viaje ${v.numero} está ${ETIQUETA_ESTADO[v.estado]}: ya no se modifican sus anticipos`);
      const a = await tx.anticipoViaje.findFirst({ where: { id: anticipoId, viajeId: id } });
      if (!a) throw noEncontrado('Anticipo', anticipoId);
      await tx.anticipoViaje.delete({ where: { id: anticipoId } });
      await this.recalcularCostos(tx, id);
      await this.audit.registrar(ctx, { accion: 'ELIMINAR', entidad: 'AnticipoViaje', entidadId: anticipoId, antes: a }, tx);
    });
    return { message: 'Anticipo eliminado' };
  }

  // ─────────────────────────────── liquidar ────────────────────────────────

  async liquidar(ctx: Ctx, id: number) {
    const ck = await this.costoKm.calcular(new Date());
    const factorCargas = factorIncluido(ck.cargas);
    const r = await this.prisma.enTransaccion(async (tx) => {
      await this.bloquear(tx, id);
      const v = await this.cargar(ctx, id, tx);
      this.exigirEstado(v, 'liquidar');
      // Costo indirecto por km de los últimos 90 días al momento de liquidar (queda guardado en el viaje)
      const costoKmFijo = ck.costoKm;
      const [costos, anticipos, gastos] = await Promise.all([
        tx.costoViaje.findMany({ where: { viajeId: id }, select: { tipo: true, monto: true, pagadoPorPiloto: true } }),
        tx.anticipoViaje.findMany({ where: { viajeId: id }, select: { monto: true } }),
        tx.gasto.findMany({ where: { viajeId: id, estado: 'REGISTRADO' }, select: { monto: true } }),
      ]);
      const l = liquidar({
        montoCobrado: v.montoCobrado, pagoPiloto: v.pagoPiloto, costoKmFijo, factorCargas,
        kmRecorridos: D(v.kmLlegada).minus(D(v.kmSalida)),
        costos: [...costos, ...gastos.map((g) => ({ tipo: 'GASTO_EMPRESA', monto: g.monto, pagadoPorPiloto: false }))],
        anticipos: anticipos.map((a) => a.monto),
      });
      await tx.viaje.update({ where: { id }, data: { estado: 'LIQUIDADO', liquidadoEn: new Date(), liquidadoPorId: ctx.usuario.sub, saldoPiloto: l.saldoPiloto, costoKmFijo, factorCargas, prorrateo: l.prorrateo, ganancia: l.ganancia, totalCostos: r2(suma(costos.map((c) => c.monto))) } });
      await this.audit.registrar(ctx, { accion: 'LIQUIDAR', entidad: 'Viaje', entidadId: id, antes: { estado: v.estado }, despues: { estado: 'LIQUIDADO', ...l } }, tx);
      return { v, l };
    });
    const { v, l } = r;
    if (l.ganancia.isNegative()) {
      await this.notificaciones.evento({ sucursalId: v.sucursalId, permiso: 'finanzas.costos', tipo: 'viaje-perdida', nivel: 'aviso', titulo: `Viaje ${v.numero} con pérdida`, detalle: `Ganancia Q${l.ganancia.toFixed(2)} sobre Q${l.cobrado.toFixed(2)} cobrados`, ruta: `/home/viajes?id=${v.id}` });
    }
    const saldo = l.saldoPiloto.isZero() ? 'sin saldo con el piloto' : l.saldoPiloto.isPositive() ? `el piloto devuelve Q${l.saldoPiloto.toFixed(2)}` : `se le pagan Q${l.saldoPiloto.abs().toFixed(2)} al piloto`;
    return { data: { ...l, avisos: ck.avisos }, message: `Viaje ${v.numero} liquidado: ${saldo}` };
  }

  // ─────────────────────────────── rentabilidad ────────────────────────────

  /**
   * Qué viajes, clientes y rutas pagan mejor y dejan más ganancia (viajes liquidados del período).
   * Ingreso por km y ganancia por km permiten comparar viajes largos con cortos.
   */
  async rentabilidad(ctx: Ctx, query: unknown) {
    const f = validar(filtroRentabilidadZ, query ?? {});
    const hasta = f.hasta ? sumarDias(parseFecha(f.hasta), 1) : sumarDias(fechaContable(), 1);
    const desde = f.desde ? parseFecha(f.desde) : sumarDias(hasta, -91);
    const filas = await this.prisma.viaje.findMany({
      where: { sucursalId: this.sucursal(ctx), estado: 'LIQUIDADO', fechaLlegada: { gte: desde, lt: hasta } },
      include: INCLUIR_LISTA,
    });
    const viajes = filas.map((v) => {
      const km = D(v.kmLlegada).minus(D(v.kmSalida));
      const ganancia = D(v.ganancia);
      return { ...this.fila(v), km, ingresoKm: km.gt(0) ? D(v.montoCobrado).div(km).toDecimalPlaces(2) : null, gananciaKm: km.gt(0) ? ganancia.div(km).toDecimalPlaces(2) : null, margen: D(v.montoCobrado).gt(0) ? ganancia.div(D(v.montoCobrado)).times(100).toDecimalPlaces(1) : null };
    });
    const agrupar = (clave: (v: (typeof viajes)[number]) => string) => {
      const m = new Map<string, { nombre: string; viajes: number; km: Decimal; ingresos: Decimal; ganancia: Decimal }>();
      for (const v of viajes) {
        const k = clave(v);
        const a = m.get(k) ?? { nombre: k, viajes: 0, km: D(0), ingresos: D(0), ganancia: D(0) };
        a.viajes += 1; a.km = a.km.plus(v.km); a.ingresos = a.ingresos.plus(D(v.montoCobrado)); a.ganancia = a.ganancia.plus(D(v.ganancia));
        m.set(k, a);
      }
      return [...m.values()].map((a) => ({ ...a, ingresos: r2(a.ingresos), ganancia: r2(a.ganancia), ingresoKm: a.km.gt(0) ? a.ingresos.div(a.km).toDecimalPlaces(2) : null, gananciaKm: a.km.gt(0) ? a.ganancia.div(a.km).toDecimalPlaces(2) : null, margen: a.ingresos.gt(0) ? a.ganancia.div(a.ingresos).times(100).toDecimalPlaces(1) : null }))
        .sort((x, y) => y.ganancia.cmp(x.ganancia));
    };
    const total = { viajes: viajes.length, ingresos: r2(suma(viajes.map((v) => v.montoCobrado))), ganancia: r2(suma(viajes.map((v) => v.ganancia))), km: suma(viajes.map((v) => v.km)) };
    return { data: {
      desde: aYmd(desde), hasta: aYmd(sumarDias(hasta, -1)), total,
      viajes: [...viajes].sort((a, b) => D(b.ganancia).cmp(D(a.ganancia))),
      mejorPagados: [...viajes].filter((v) => v.ingresoKm).sort((a, b) => b.ingresoKm!.cmp(a.ingresoKm!)).slice(0, 10),
      porCliente: agrupar((v) => v.cliente), porRuta: agrupar((v) => v.ruta ?? `${v.origen} → ${v.destino}`), porCabezal: agrupar((v) => v.cabezal), porPiloto: agrupar((v) => v.piloto),
    } };
  }

  // ─────────────────────────────── app del piloto ──────────────────────────

  /**
   * «Mi día» para la app del piloto: sus viajes abiertos, su cabezal, si ya hizo la inspección de hoy, sus casos
   * abiertos y la lista de revisión. La app lo guarda (cifrado) para trabajar sin señal.
   * Un usuario sin piloto ligado (supervisor) ve los viajes abiertos de la sede.
   */
  async miDia(ctx: Ctx) {
    const sucursalId = this.sucursal(ctx);
    const u = await this.prisma.usuario.findUnique({ where: { id: ctx.usuario.sub }, select: { empleado: { select: { nombres: true, apellidos: true, telefono: true, piloto: { select: { id: true, licenciaTipo: true, licenciaVence: true, cabezales: { where: { activo: true }, select: { id: true } } } } } } } });
    const piloto = u?.empleado?.piloto ?? null;
    const viajes = await this.prisma.viaje.findMany({
      where: { sucursalId, estado: { in: ['PROGRAMADO', 'EN_RUTA', 'FINALIZADO'] }, ...(piloto ? { pilotoId: piloto.id } : {}) },
      orderBy: [{ estado: 'asc' }, { fechaSalida: 'asc' }], take: piloto ? 20 : 40,
      include: {
        ...INCLUIR_LISTA,
        cabezal: { select: { id: true, codigo: true, placa: true, odometro: true, capacidadTanque: true, rendimientoEsperado: true } },
        remolque: { select: { id: true, codigo: true, placa: true } },
        eventos: { orderBy: { ocurridoEn: 'desc' }, take: 1, select: { tipo: true, ocurridoEn: true } },
        anticipos: { select: { monto: true } },
      },
    });
    const cabezalIds = [...new Set([...viajes.map((v) => v.cabezalId), ...(piloto?.cabezales.map((c) => c.id) ?? [])])];
    const [cabezales, inspecciones, casos] = await Promise.all([
      this.prisma.cabezal.findMany({ where: { id: { in: cabezalIds } }, select: { id: true, codigo: true, placa: true, odometro: true, capacidadTanque: true, rendimientoEsperado: true, estado: true } }),
      this.prisma.inspeccion.findMany({ where: { cabezalId: { in: cabezalIds } }, orderBy: { fecha: 'desc' }, distinct: ['cabezalId'], select: { cabezalId: true, remolqueId: true, fecha: true, resultado: true } }),
      this.prisma.caso.findMany({ where: { sucursalId, estado: { in: ['ABIERTO', 'EN_PROCESO'] }, OR: [{ creadoPorId: ctx.usuario.sub }, { cabezalId: { in: cabezalIds } }] }, orderBy: { venceEn: 'asc' }, take: 30, select: { id: true, numero: true, titulo: true, prioridad: true, estado: true, impideSalir: true, cabezalId: true, venceEn: true } }),
    ]);
    const vigencia = Date.now() - VIGENCIA_HORAS * 3_600_000;
    const ultimaDe = new Map(inspecciones.map((i) => [i.cabezalId, i]));
    return { data: {
      generado: new Date(),
      piloto: piloto ? { id: piloto.id, nombre: nombreEmpleado(u!.empleado!), licenciaTipo: piloto.licenciaTipo, licenciaVence: aYmd(piloto.licenciaVence), diasLicencia: Math.floor((piloto.licenciaVence.getTime() - Date.now()) / 86_400_000) } : null,
      cabezales: cabezales.map((c) => {
        const i = ultimaDe.get(c.id);
        return { ...c, asignado: piloto?.cabezales.some((x) => x.id === c.id) ?? false, inspeccion: i ? { fecha: i.fecha, resultado: i.resultado, remolqueId: i.remolqueId, vigente: i.fecha.getTime() >= vigencia && i.resultado !== 'RECHAZADA', fueraDeServicio: i.resultado === 'RECHAZADA' } : null };
      }),
      viajes: viajes.map((v) => ({
        id: v.id, numero: v.numero, estado: v.estado, cliente: nombreTercero(v.cliente), ruta: v.ruta?.nombre ?? null, origen: v.origen, destino: v.destino,
        carga: v.carga, referencia: v.referencia, fechaSalida: v.fechaSalida, fechaCompromiso: v.fechaCompromiso, observaciones: v.observaciones,
        cabezalId: v.cabezalId, cabezal: v.cabezal.codigo, placa: v.cabezal.placa, remolqueId: v.remolqueId, remolque: v.remolque?.codigo ?? null,
        kmSalida: v.kmSalida, anticipos: r2(suma(v.anticipos.map((a) => a.monto))), ultimoReporte: v.eventos[0] ?? null,
        piloto: piloto ? null : nombreEmpleado(v.piloto.empleado),
      })),
      casos,
    } };
  }

  /** Costo indirecto por km del período (para el tablero y la pantalla del cotizador). */
  async costoPorKm() {
    return { data: await this.costoKm.calcular() };
  }
}
