/**
 * VIAJES: ciclo de vida PROGRAMADO → EN_RUTA → FINALIZADO → LIQUIDADO (o CANCELADO).
 *  - Al programar se valida que el cabezal y el piloto estén disponibles y con licencia vigente.
 *  - Al iniciar se toma el km de salida (odómetro del cabezal) y, si la empresa lo exige, una inspección aprobada.
 *  - Al finalizar se registra el km de llegada y se actualiza el odómetro del cabezal (dispara alertas de servicio).
 *  - Los costos (combustible, peajes, viáticos…) se van registrando; totalCostos queda materializado.
 *  - Al liquidar se fija lo cobrado, el pago del piloto y el saldo a pagarle (bono + gastos rendidos − anticipo).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { hoyGuatemala } from '../../common/fecha';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { rangoMes } from '../gastos/gastos.logica';
import { cancelarZ, costoZ, editarZ, filtroViajesZ, finalizarZ, iniciarZ, liquidar, liquidarZ, montoPorTarifa, nombreTercero, NOMBRE_COSTO, programarZ, Programar, r2, siguienteNumero } from './viajes.logica';

const sucursal = (ctx: Ctx) => ctx.sucursalId ?? (() => { throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo'); })();
const fechaDb = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
/** "2026-11-16" o "2026-11-16T08:30" (hora local de Guatemala, UTC−6) → Date. */
const fechaHoraDb = (s: string) => (s.length <= 10 ? new Date(`${s}T06:00:00Z`) : s.length === 16 ? new Date(`${s}:00-06:00`) : new Date(s));
const D = (n: number | null | undefined) => new Prisma.Decimal(n ?? 0);
const N = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

const INCLUIR = {
  cliente: { select: { razonSocial: true, nombreComercial: true, nombres: true, apellidos: true } },
  ruta: { select: { nombre: true, kmEstimados: true } },
  cabezal: { select: { codigo: true, placa: true, odometro: true } },
  remolque: { select: { codigo: true, placa: true } },
  piloto: { select: { id: true, empleado: { select: { nombres: true, apellidos: true } } } },
} satisfies Prisma.ViajeInclude;

@Injectable()
export class ViajesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parametros: ParametrosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private resumen(v: Prisma.ViajeGetPayload<{ include: typeof INCLUIR }>) {
    const km = v.kmSalida != null && v.kmLlegada != null ? Math.max(0, N(v.kmLlegada) - N(v.kmSalida)) : null;
    return {
      id: v.id, numero: v.numero, estado: v.estado, fechaSalida: v.fechaSalida.toISOString(), fechaLlegada: v.fechaLlegada?.toISOString() ?? null, fechaCompromiso: v.fechaCompromiso?.toISOString() ?? null,
      cliente: nombreTercero(v.cliente), clienteId: v.clienteId, ruta: v.ruta?.nombre ?? null, rutaId: v.rutaId, tarifaId: v.tarifaId, origen: v.origen, destino: v.destino, carga: v.carga, toneladas: N(v.toneladas) || null, referencia: v.referencia,
      cabezal: v.cabezal.codigo, cabezalId: v.cabezalId, placa: v.cabezal.placa, remolque: v.remolque?.codigo ?? null, remolqueId: v.remolqueId,
      piloto: [v.piloto.empleado.nombres, v.piloto.empleado.apellidos].join(' '), pilotoId: v.pilotoId,
      kmSalida: v.kmSalida == null ? null : N(v.kmSalida), kmLlegada: v.kmLlegada == null ? null : N(v.kmLlegada), km, kmVacios: N(v.kmVacios),
      montoCobrado: N(v.montoCobrado), anticipoPiloto: N(v.anticipoPiloto), pagoPiloto: N(v.pagoPiloto), totalCostos: N(v.totalCostos),
      utilidad: r2(N(v.montoCobrado) - N(v.totalCostos) - N(v.pagoPiloto)),
      atrasado: Boolean(v.fechaCompromiso && (v.fechaLlegada ?? new Date()) > v.fechaCompromiso && v.estado !== 'CANCELADO'),
      observaciones: v.observaciones,
    };
  }

  async listar(ctx: Ctx, query: unknown) {
    const f = filtroViajesZ.parse(query ?? {});
    const mes = f.mes ?? hoyGuatemala().slice(0, 7);
    const [desde, hasta] = rangoMes(mes);
    const where: Prisma.ViajeWhereInput = {
      sucursalId: sucursal(ctx),
      ...(f.cabezalId ? { cabezalId: f.cabezalId } : {}), ...(f.pilotoId ? { pilotoId: f.pilotoId } : {}), ...(f.clienteId ? { clienteId: f.clienteId } : {}),
      ...(f.estado ? { estado: f.estado } : {}),
      // Los viajes abiertos (programados / en ruta) se ven siempre; los demás, por mes de salida
      ...(f.estado && ['PROGRAMADO', 'EN_RUTA'].includes(f.estado) ? {} : { OR: [{ estado: { in: ['PROGRAMADO', 'EN_RUTA'] } }, { fechaSalida: { gte: fechaDb(desde), lt: new Date(fechaDb(hasta).getTime() + 86_400_000) } }] }),
    };
    const filas = await this.prisma.viaje.findMany({ where, include: INCLUIR, orderBy: [{ fechaSalida: 'desc' }, { id: 'desc' }] });
    const viajes = filas.map((v) => this.resumen(v));
    const cerrados = viajes.filter((v) => ['FINALIZADO', 'LIQUIDADO'].includes(v.estado));
    const totales = {
      programados: viajes.filter((v) => v.estado === 'PROGRAMADO').length, enRuta: viajes.filter((v) => v.estado === 'EN_RUTA').length, cerrados: cerrados.length,
      ingresos: r2(cerrados.reduce((a, v) => a + v.montoCobrado, 0)), costos: r2(cerrados.reduce((a, v) => a + v.totalCostos + v.pagoPiloto, 0)),
      km: r2(cerrados.reduce((a, v) => a + (v.km ?? 0), 0)), kmVacios: r2(cerrados.reduce((a, v) => a + v.kmVacios, 0)),
    };
    return { data: { mes, totales: { ...totales, utilidad: r2(totales.ingresos - totales.costos), margen: totales.ingresos > 0 ? r2(((totales.ingresos - totales.costos) / totales.ingresos) * 100) : 0 }, viajes } };
  }

  async detalle(ctx: Ctx, id: number) {
    const v = await this.prisma.viaje.findFirst({ where: { id, sucursalId: sucursal(ctx) }, include: {
      ...INCLUIR,
      costos: { orderBy: { fecha: 'asc' }, include: { registradoPor: { select: { nombre: true } } } },
      cargas: { where: { anulada: false }, orderBy: { fecha: 'asc' } },
      inspecciones: { orderBy: { fecha: 'desc' }, select: { id: true, fecha: true, resultado: true, fallas: true } },
    } });
    if (!v) throw noEncontrado('Viaje', id);
    const liq = liquidar({ montoCobrado: N(v.montoCobrado), pagoPiloto: N(v.pagoPiloto), anticipoPiloto: N(v.anticipoPiloto), kmSalida: v.kmSalida == null ? null : N(v.kmSalida), kmLlegada: v.kmLlegada == null ? null : N(v.kmLlegada), kmVacios: N(v.kmVacios) },
      v.costos.map((c) => ({ tipo: c.tipo, monto: N(c.monto), pagadoPorPiloto: c.pagadoPorPiloto })));
    return { data: {
      ...this.resumen(v),
      costos: v.costos.map((c) => ({ id: c.id, tipo: c.tipo, tipoNombre: NOMBRE_COSTO[c.tipo], descripcion: c.descripcion, monto: N(c.monto), fecha: c.fecha.toISOString().slice(0, 10), archivoId: c.archivoId, pagadoPorPiloto: c.pagadoPorPiloto, cargaId: c.cargaId, registro: c.registradoPor.nombre })),
      cargas: v.cargas.map((c) => ({ id: c.id, fecha: c.fecha.toISOString().slice(0, 10), odometro: N(c.odometro), galones: N(c.galones), total: N(c.total), estacion: c.estacion })),
      inspecciones: v.inspecciones.map((i) => ({ ...i, fecha: i.fecha.toISOString() })),
      liquidacion: liq,
    } };
  }

  /** Completa origen/destino desde la ruta y el monto desde la tarifa; valida disponibilidad de cabezal y piloto. */
  private async armar(tx: Prisma.TransactionClient, d: Programar, excluirViajeId?: number) {
    const [cliente, ruta, tarifa, cabezal, piloto, remolque] = await Promise.all([
      tx.tercero.findFirst({ where: { id: d.clienteId, esCliente: true, activo: true } }),
      d.rutaId ? tx.ruta.findFirst({ where: { id: d.rutaId, activo: true } }) : null,
      d.tarifaId ? tx.tarifa.findFirst({ where: { id: d.tarifaId, activo: true } }) : null,
      tx.cabezal.findFirst({ where: { id: d.cabezalId, activo: true } }),
      tx.piloto.findFirst({ where: { id: d.pilotoId, activo: true }, include: { empleado: true } }),
      d.remolqueId ? tx.remolque.findFirst({ where: { id: d.remolqueId, activo: true } }) : null,
    ]);
    if (!cliente) throw reglaNegocio('CLIENTE_INVALIDO', 'Elija un cliente activo');
    if (d.rutaId && !ruta) throw reglaNegocio('RUTA_INVALIDA', 'La ruta no existe o está inactiva');
    if (d.tarifaId && !tarifa) throw reglaNegocio('TARIFA_INVALIDA', 'La tarifa no existe o está inactiva');
    if (tarifa && tarifa.clienteId !== d.clienteId) throw reglaNegocio('TARIFA_DE_OTRO_CLIENTE', 'Esa tarifa pertenece a otro cliente');
    if (!cabezal) throw reglaNegocio('CABEZAL_INVALIDO', 'Elija un cabezal activo');
    if (cabezal.estado === 'EN_TALLER') throw reglaNegocio('CABEZAL_EN_TALLER', `El cabezal ${cabezal.codigo} está en taller`);
    if (cabezal.estado !== 'ACTIVO') throw reglaNegocio('CABEZAL_NO_DISPONIBLE', `El cabezal ${cabezal.codigo} está ${cabezal.estado.toLowerCase()}`);
    if (!piloto) throw reglaNegocio('PILOTO_INVALIDO', 'Elija un piloto activo');
    if (piloto.empleado.estado !== 'ACTIVO') throw reglaNegocio('PILOTO_NO_ACTIVO', 'El piloto no está activo en RRHH');
    if (piloto.licenciaVence < fechaDb(hoyGuatemala())) throw reglaNegocio('LICENCIA_VENCIDA', `La licencia de ${piloto.empleado.nombres} venció el ${piloto.licenciaVence.toISOString().slice(0, 10)}`);
    if (d.remolqueId && !remolque) throw reglaNegocio('REMOLQUE_INVALIDO', 'El remolque no existe o está inactivo');
    const ocupado = await tx.viaje.findFirst({ where: { estado: 'EN_RUTA', OR: [{ cabezalId: d.cabezalId }, { pilotoId: d.pilotoId }], ...(excluirViajeId ? { id: { not: excluirViajeId } } : {}) }, select: { numero: true, cabezalId: true } });
    if (ocupado) throw reglaNegocio('EN_RUTA', `${ocupado.cabezalId === d.cabezalId ? 'El cabezal' : 'El piloto'} ya va en el viaje ${ocupado.numero}`);

    const origen = d.origen || ruta?.origen; const destino = d.destino || ruta?.destino;
    if (!origen || !destino) throw reglaNegocio('ORIGEN_DESTINO', 'Indique origen y destino o elija una ruta');
    // Tarifa por defecto: la vigente del cliente para esa ruta (o general sin ruta)
    const hoy = fechaDb(hoyGuatemala());
    const tarifaUsada = tarifa ?? (await tx.tarifa.findFirst({ where: { clienteId: d.clienteId, activo: true, OR: [{ rutaId: d.rutaId ?? -1 }, { rutaId: null }], vigenteDesde: { lte: hoy }, AND: [{ OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: hoy } }] }] }, orderBy: [{ rutaId: { sort: 'desc', nulls: 'last' } }, { vigenteDesde: 'desc' }] }));
    const km = N(ruta?.kmEstimados);
    const montoCobrado = d.montoCobrado ?? (tarifaUsada ? montoPorTarifa({ tipo: tarifaUsada.tipo, monto: N(tarifaUsada.monto) }, km, N(d.toneladas)) : 0);
    return {
      datos: {
        clienteId: d.clienteId, rutaId: d.rutaId ?? null, tarifaId: tarifaUsada?.id ?? null, cabezalId: d.cabezalId, remolqueId: d.remolqueId ?? null, pilotoId: d.pilotoId,
        origen, destino, carga: d.carga || null, toneladas: d.toneladas == null ? null : D(d.toneladas), referencia: d.referencia || null,
        fechaSalida: fechaHoraDb(d.fechaSalida), fechaCompromiso: d.fechaCompromiso ? fechaHoraDb(d.fechaCompromiso) : null,
        montoCobrado: D(montoCobrado), anticipoPiloto: D(d.anticipoPiloto), pagoPiloto: D(d.pagoPiloto ?? N(piloto.pagoPorViaje)), kmVacios: D(d.kmVacios), observaciones: d.observaciones || null,
      },
      cabezal, piloto,
    };
  }

  async programar(ctx: Ctx, body: unknown) {
    const d = programarZ.parse(body);
    const sucursalId = sucursal(ctx);
    const v = await this.prisma.enTransaccion(async (tx) => {
      const { datos } = await this.armar(tx, d);
      const ultimo = await tx.viaje.findFirst({ orderBy: { id: 'desc' }, select: { numero: true } });
      return tx.viaje.create({ data: { ...datos, numero: siguienteNumero('V-', ultimo?.numero), sucursalId, creadoPorId: ctx.usuario.sub } });
    });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Viaje', entidadId: String(v.id), despues: { numero: v.numero, ...d } as unknown as Prisma.InputJsonValue });
    return { data: { id: v.id, numero: v.numero, montoCobrado: N(v.montoCobrado) }, message: `Viaje ${v.numero} programado` };
  }

  async editar(ctx: Ctx, id: number, body: unknown) {
    const cambios = editarZ.parse(body);
    const v = await this.prisma.viaje.findFirst({ where: { id, sucursalId: sucursal(ctx) } });
    if (!v) throw noEncontrado('Viaje', id);
    if (!['PROGRAMADO', 'EN_RUTA'].includes(v.estado)) throw reglaNegocio('VIAJE_CERRADO', `El viaje ${v.numero} ya está ${v.estado.toLowerCase()}; no se puede editar`);
    if (v.estado === 'EN_RUTA' && ((cambios.cabezalId && cambios.cabezalId !== v.cabezalId) || (cambios.pilotoId && cambios.pilotoId !== v.pilotoId))) throw reglaNegocio('VIAJE_EN_RUTA', 'No se cambia el cabezal ni el piloto de un viaje en ruta');
    const base: Programar = {
      clienteId: v.clienteId, rutaId: v.rutaId, tarifaId: v.tarifaId, cabezalId: v.cabezalId, remolqueId: v.remolqueId, pilotoId: v.pilotoId, origen: v.origen, destino: v.destino, carga: v.carga, toneladas: v.toneladas == null ? null : N(v.toneladas), referencia: v.referencia,
      fechaSalida: v.fechaSalida.toISOString(), fechaCompromiso: v.fechaCompromiso?.toISOString() ?? null, montoCobrado: N(v.montoCobrado), anticipoPiloto: N(v.anticipoPiloto), pagoPiloto: N(v.pagoPiloto), kmVacios: N(v.kmVacios), observaciones: v.observaciones,
    };
    const d: Programar = { ...base, ...Object.fromEntries(Object.entries(cambios).filter(([, val]) => val !== undefined)) } as Programar;
    // Si cambió la tarifa o la ruta y no mandaron monto, se recalcula
    if ((cambios.tarifaId !== undefined || cambios.rutaId !== undefined || cambios.toneladas !== undefined) && cambios.montoCobrado === undefined) d.montoCobrado = null;
    await this.prisma.enTransaccion(async (tx) => {
      const { datos } = await this.armar(tx, d, id);
      await tx.viaje.update({ where: { id }, data: datos });
    });
    await this.audit.registrar(ctx, { accion: 'EDITAR', entidad: 'Viaje', entidadId: String(id), despues: cambios as unknown as Prisma.InputJsonValue });
    return { message: `Viaje ${v.numero} actualizado` };
  }

  async iniciar(ctx: Ctx, id: number, body: unknown) {
    const d = iniciarZ.parse(body ?? {});
    const v = await this.prisma.viaje.findFirst({ where: { id, sucursalId: sucursal(ctx) }, include: { cabezal: true } });
    if (!v) throw noEncontrado('Viaje', id);
    if (v.estado !== 'PROGRAMADO') throw reglaNegocio('ESTADO_INVALIDO', `El viaje ${v.numero} está ${v.estado.toLowerCase()}; solo se inicia un viaje programado`);
    const ocupado = await this.prisma.viaje.findFirst({ where: { estado: 'EN_RUTA', OR: [{ cabezalId: v.cabezalId }, { pilotoId: v.pilotoId }] }, select: { numero: true } });
    if (ocupado) throw reglaNegocio('EN_RUTA', `El cabezal o el piloto ya van en el viaje ${ocupado.numero}`);
    if (await this.parametros.booleano('viajes.exigir_inspeccion')) {
      const desde = new Date(Date.now() - 24 * 3_600_000);
      const insp = await this.prisma.inspeccion.findFirst({ where: { cabezalId: v.cabezalId, fecha: { gte: desde }, resultado: { in: ['APROBADA', 'CON_OBSERVACIONES'] }, OR: [{ viajeId: null }, { viajeId: id }] }, orderBy: { fecha: 'desc' } });
      if (!insp) throw reglaNegocio('SIN_INSPECCION', `Registre la inspección pre viaje del cabezal ${v.cabezal.codigo} (últimas 24 h) antes de salir`);
    }
    const kmSalida = d.kmSalida ?? N(v.cabezal.odometro);
    await this.prisma.enTransaccion(async (tx) => {
      await tx.viaje.update({ where: { id }, data: { estado: 'EN_RUTA', kmSalida: D(kmSalida), fechaSalida: d.fechaSalida ? fechaHoraDb(d.fechaSalida) : new Date() } });
      if (kmSalida > N(v.cabezal.odometro)) await tx.cabezal.update({ where: { id: v.cabezalId }, data: { odometro: D(kmSalida) } });
      if (d.inspeccionId) await tx.inspeccion.updateMany({ where: { id: d.inspeccionId, viajeId: null }, data: { viajeId: id } });
    });
    await this.audit.registrar(ctx, { accion: 'INICIAR', entidad: 'Viaje', entidadId: String(id), despues: { kmSalida } });
    return { message: `Viaje ${v.numero} en ruta (km ${kmSalida})` };
  }

  async finalizar(ctx: Ctx, id: number, body: unknown) {
    const d = finalizarZ.parse(body);
    const v = await this.prisma.viaje.findFirst({ where: { id, sucursalId: sucursal(ctx) }, include: { cabezal: true } });
    if (!v) throw noEncontrado('Viaje', id);
    if (v.estado !== 'EN_RUTA') throw reglaNegocio('ESTADO_INVALIDO', `El viaje ${v.numero} no está en ruta`);
    const kmSalida = N(v.kmSalida);
    if (d.kmLlegada < kmSalida) throw reglaNegocio('KM_INVALIDO', `El km de llegada (${d.kmLlegada}) no puede ser menor que el de salida (${kmSalida})`);
    if (d.kmLlegada - kmSalida > 5000) throw reglaNegocio('KM_INVALIDO', 'Más de 5,000 km en un viaje: revise el odómetro');
    const km = d.kmLlegada - kmSalida;
    if ((d.kmVacios ?? 0) > km) throw reglaNegocio('KM_VACIOS', 'Los km vacíos no pueden superar los km recorridos');
    const fechaLlegada = d.fechaLlegada ? fechaHoraDb(d.fechaLlegada) : new Date();
    if (fechaLlegada < v.fechaSalida) throw reglaNegocio('FECHA_INVALIDA', 'La llegada no puede ser antes de la salida');
    await this.prisma.enTransaccion(async (tx) => {
      await tx.viaje.update({ where: { id }, data: { estado: 'FINALIZADO', kmLlegada: D(d.kmLlegada), fechaLlegada, kmVacios: d.kmVacios == null ? undefined : D(d.kmVacios), observaciones: d.observaciones ?? undefined } });
      if (d.kmLlegada > N(v.cabezal.odometro)) await tx.cabezal.update({ where: { id: v.cabezalId }, data: { odometro: D(d.kmLlegada) } });
    });
    await this.audit.registrar(ctx, { accion: 'FINALIZAR', entidad: 'Viaje', entidadId: String(id), despues: { kmLlegada: d.kmLlegada, km } });
    if (v.fechaCompromiso && fechaLlegada > v.fechaCompromiso) await this.notificaciones.evento({ sucursalId: v.sucursalId, permiso: 'viajes.ver', tipo: 'viaje_atrasado', nivel: 'aviso', titulo: `Viaje ${v.numero} llegó tarde`, detalle: `Compromiso ${v.fechaCompromiso.toISOString().slice(0, 16).replace('T', ' ')}, llegó ${fechaLlegada.toISOString().slice(0, 16).replace('T', ' ')}`, ruta: `/home/viajes` });
    const meta = await this.parametros.numero('viajes.meta_km_vacios');
    if (km > 0 && ((d.kmVacios ?? 0) / km) * 100 > meta) await this.notificaciones.evento({ sucursalId: v.sucursalId, permiso: 'viajes.ver', tipo: 'km_vacios', nivel: 'aviso', titulo: `Viaje ${v.numero}: ${r2(((d.kmVacios ?? 0) / km) * 100)}% de km vacíos`, detalle: `Meta máxima ${meta}%`, ruta: '/home/viajes' });
    await this.avisarServicio(v.cabezalId);
    return { message: `Viaje ${v.numero} finalizado: ${r2(km)} km`, data: { km } };
  }

  /** Avisa si el cabezal ya alcanzó (o está por alcanzar) un servicio por km según sus planes. */
  async avisarServicio(cabezalId: number) {
    const cab = await this.prisma.cabezal.findUnique({ where: { id: cabezalId }, select: { codigo: true, odometro: true, sucursalId: true } });
    if (!cab) return;
    const planes = await this.prisma.planMantenimiento.findMany({ where: { activo: true, cadaKm: { not: null } } });
    const aviso = await this.parametros.numero('mantenimiento.aviso_km');
    for (const p of planes) {
      const ultima = await this.prisma.ordenTrabajo.findFirst({ where: { cabezalId, planId: p.id, estado: 'CERRADA' }, orderBy: { fechaCierre: 'desc' }, select: { odometro: true } });
      const proximo = N(ultima?.odometro) + N(p.cadaKm);
      const faltan = proximo - N(cab.odometro);
      if (faltan <= Math.max(N(p.avisoKm), aviso)) await this.notificaciones.evento({ sucursalId: cab.sucursalId, permiso: 'mantenimiento.ver', tipo: 'servicio_por_km', nivel: faltan <= 0 ? 'critico' : 'aviso', titulo: `${cab.codigo}: ${p.nombre} ${faltan <= 0 ? 'vencido' : `en ${r2(faltan)} km`}`, detalle: `Odómetro ${N(cab.odometro)} km; servicio a los ${proximo} km`, ruta: '/home/cabezales' });
    }
  }

  async agregarCosto(ctx: Ctx, id: number, body: unknown) {
    const d = costoZ(hoyGuatemala()).parse(body);
    const v = await this.prisma.viaje.findFirst({ where: { id, sucursalId: sucursal(ctx) } });
    if (!v) throw noEncontrado('Viaje', id);
    if (['LIQUIDADO', 'CANCELADO'].includes(v.estado)) throw reglaNegocio('VIAJE_CERRADO', `El viaje ${v.numero} está ${v.estado.toLowerCase()}; no admite más costos`);
    const c = await this.prisma.enTransaccion(async (tx) => {
      const c = await tx.costoViaje.create({ data: { viajeId: id, tipo: d.tipo, descripcion: d.descripcion || null, monto: D(d.monto), fecha: d.fecha ? fechaDb(d.fecha) : new Date(), archivoId: d.archivoId ?? null, pagadoPorPiloto: d.pagadoPorPiloto ?? true, registradoPorId: ctx.usuario.sub } });
      await this.recalcular(tx, id);
      return c;
    });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'CostoViaje', entidadId: String(c.id), despues: { viaje: v.numero, ...d } as unknown as Prisma.InputJsonValue });
    return { data: { id: c.id }, message: `${NOMBRE_COSTO[d.tipo]}: Q${d.monto.toFixed(2)} agregado al viaje ${v.numero}` };
  }

  async quitarCosto(ctx: Ctx, id: number, costoId: number) {
    const c = await this.prisma.costoViaje.findFirst({ where: { id: costoId, viajeId: id, viaje: { sucursalId: sucursal(ctx) } }, include: { viaje: { select: { estado: true, numero: true } } } });
    if (!c) throw noEncontrado('Costo', costoId);
    if (['LIQUIDADO', 'CANCELADO'].includes(c.viaje.estado)) throw reglaNegocio('VIAJE_CERRADO', 'El viaje ya está cerrado');
    if (c.cargaId) throw reglaNegocio('COSTO_DE_CARGA', 'Este costo nace de una carga de combustible: anule la carga');
    await this.prisma.enTransaccion(async (tx) => { await tx.costoViaje.delete({ where: { id: costoId } }); await this.recalcular(tx, id); });
    await this.audit.registrar(ctx, { accion: 'ELIMINAR', entidad: 'CostoViaje', entidadId: String(costoId), antes: { viaje: c.viaje.numero, tipo: c.tipo, monto: N(c.monto) } });
    return { message: 'Costo eliminado' };
  }

  /** totalCostos materializado = suma de sus costos. */
  async recalcular(tx: Prisma.TransactionClient, viajeId: number) {
    const s = await tx.costoViaje.aggregate({ where: { viajeId }, _sum: { monto: true } });
    await tx.viaje.update({ where: { id: viajeId }, data: { totalCostos: s._sum.monto ?? D(0) } });
  }

  async liquidar(ctx: Ctx, id: number, body: unknown) {
    const d = liquidarZ.parse(body ?? {});
    const v = await this.prisma.viaje.findFirst({ where: { id, sucursalId: sucursal(ctx) }, include: { costos: true } });
    if (!v) throw noEncontrado('Viaje', id);
    if (v.estado !== 'FINALIZADO') throw reglaNegocio('ESTADO_INVALIDO', `Solo se liquida un viaje finalizado (está ${v.estado.toLowerCase()})`);
    const montoCobrado = d.montoCobrado ?? N(v.montoCobrado); const pagoPiloto = d.pagoPiloto ?? N(v.pagoPiloto); const anticipoPiloto = d.anticipoPiloto ?? N(v.anticipoPiloto);
    if (montoCobrado <= 0) throw reglaNegocio('SIN_MONTO', 'Indique cuánto se cobra al cliente por este viaje');
    const liq = liquidar({ montoCobrado, pagoPiloto, anticipoPiloto, kmSalida: N(v.kmSalida), kmLlegada: N(v.kmLlegada), kmVacios: N(v.kmVacios) }, v.costos.map((c) => ({ tipo: c.tipo, monto: N(c.monto), pagadoPorPiloto: c.pagadoPorPiloto })));
    await this.prisma.viaje.update({ where: { id }, data: { estado: 'LIQUIDADO', montoCobrado: D(montoCobrado), pagoPiloto: D(pagoPiloto), anticipoPiloto: D(anticipoPiloto), observaciones: d.observaciones ?? undefined } });
    await this.audit.registrar(ctx, { accion: 'LIQUIDAR', entidad: 'Viaje', entidadId: String(id), despues: liq as unknown as Prisma.InputJsonValue });
    const margenObjetivo = await this.parametros.numero('viajes.margen_objetivo');
    if (liq.margen < margenObjetivo) await this.notificaciones.evento({ sucursalId: v.sucursalId, permiso: 'finanzas.costos', tipo: 'margen_bajo', nivel: liq.utilidad < 0 ? 'critico' : 'aviso', titulo: `Viaje ${v.numero} con margen ${liq.margen}%`, detalle: `Objetivo ${margenObjetivo}%. Ingreso Q${liq.ingreso}, costos Q${liq.costos + liq.pagoPiloto}`, ruta: '/home/viajes' });
    return { data: liq, message: `Viaje ${v.numero} liquidado. Saldo al piloto: Q${liq.saldoPiloto.toFixed(2)}` };
  }

  async cancelar(ctx: Ctx, id: number, body: unknown) {
    const { motivo } = cancelarZ.parse(body);
    const v = await this.prisma.viaje.findFirst({ where: { id, sucursalId: sucursal(ctx) } });
    if (!v) throw noEncontrado('Viaje', id);
    if (v.estado === 'CANCELADO') return { message: 'Ya estaba cancelado' };
    if (v.estado === 'LIQUIDADO') throw reglaNegocio('VIAJE_LIQUIDADO', 'Un viaje liquidado no se cancela');
    await this.prisma.viaje.update({ where: { id }, data: { estado: 'CANCELADO', observaciones: [v.observaciones, `CANCELADO: ${motivo}`].filter(Boolean).join('\n') } });
    await this.audit.registrar(ctx, { accion: 'ANULAR', entidad: 'Viaje', entidadId: String(id), antes: { estado: v.estado }, despues: { estado: 'CANCELADO', motivo } });
    return { message: `Viaje ${v.numero} cancelado` };
  }

  /** Datos para los formularios: cabezales, pilotos, remolques, clientes, rutas y tarifas activos. */
  async opciones(ctx: Ctx) {
    const sucursalId = sucursal(ctx);
    const enRuta = await this.prisma.viaje.findMany({ where: { estado: 'EN_RUTA' }, select: { cabezalId: true, pilotoId: true, numero: true } });
    const [cabezales, remolques, pilotos, clientes, rutas, tarifas] = await Promise.all([
      this.prisma.cabezal.findMany({ where: { activo: true, sucursalId }, orderBy: { codigo: 'asc' }, select: { id: true, codigo: true, placa: true, odometro: true, estado: true, pilotoAsignadoId: true, rendimientoEsperado: true } }),
      this.prisma.remolque.findMany({ where: { activo: true }, orderBy: { codigo: 'asc' }, select: { id: true, codigo: true, placa: true, tipo: true } }),
      this.prisma.piloto.findMany({ where: { activo: true, empleado: { estado: 'ACTIVO' } }, select: { id: true, licenciaVence: true, pagoPorViaje: true, viaticoDiario: true, empleado: { select: { nombres: true, apellidos: true } } } }),
      this.prisma.tercero.findMany({ where: { esCliente: true, activo: true }, select: { id: true, razonSocial: true, nombreComercial: true, nombres: true, apellidos: true } }),
      this.prisma.ruta.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, origen: true, destino: true, kmEstimados: true, horasEstimadas: true, peajesEstimados: true, viaticoEstimado: true } }),
      this.prisma.tarifa.findMany({ where: { activo: true }, select: { id: true, clienteId: true, rutaId: true, descripcion: true, tipo: true, monto: true, vigenteHasta: true } }),
    ]);
    const hoy = fechaDb(hoyGuatemala());
    return { data: {
      cabezales: cabezales.map((c) => ({ ...c, odometro: N(c.odometro), rendimientoEsperado: N(c.rendimientoEsperado) || null, enRuta: enRuta.find((e) => e.cabezalId === c.id)?.numero ?? null })),
      remolques,
      pilotos: pilotos.map((p) => ({ id: p.id, nombre: [p.empleado.nombres, p.empleado.apellidos].join(' '), licenciaVence: p.licenciaVence.toISOString().slice(0, 10), licenciaVencida: p.licenciaVence < hoy, pagoPorViaje: N(p.pagoPorViaje), viaticoDiario: N(p.viaticoDiario), enRuta: enRuta.find((e) => e.pilotoId === p.id)?.numero ?? null })),
      clientes: clientes.map((c) => ({ id: c.id, nombre: nombreTercero(c) })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
      rutas: rutas.map((r) => ({ ...r, kmEstimados: N(r.kmEstimados), horasEstimadas: N(r.horasEstimadas) || null, peajesEstimados: N(r.peajesEstimados), viaticoEstimado: N(r.viaticoEstimado) })),
      tarifas: tarifas.filter((t) => !t.vigenteHasta || t.vigenteHasta >= hoy).map((t) => ({ ...t, monto: N(t.monto), vigenteHasta: undefined })),
    } };
  }
}
