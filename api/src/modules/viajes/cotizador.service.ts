/**
 * COTIZADOR Y COTIZACIONES: precio de un viaje según distancia, condiciones de la ruta (terreno, subida, tráfico,
 * esperas), ida y vuelta, extras y los costos reales de la empresa. Cada supuesto dice de dónde salió (historial o
 * parámetro) para que el despachador sepa qué tan confiable es. Una cotización guardada congela el cálculo y se
 * puede convertir en viaje.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { aYmd, fechaContable, sumarDias } from '../../common/fecha';
import { D, Decimal } from '../../common/money';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { validar } from '../../common/pipes/zod';
import { z } from 'zod';
import { CostoKmService } from './costo-km.service';
import { factorIncluido } from '../../common/costos/cargas-laborales';
import { ViajesService } from './viajes.service';
import { convertirZ, cotizar, cotizarZ, elegirTarifa, Factores, guardarCotizacionZ, montoPorTarifa, siguienteNumero } from './viajes.logica';

const LOCK_NUMERO_COTIZACION = 710_004;
type Entrada = z.infer<typeof cotizarZ>;

@Injectable()
export class CotizadorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parametros: ParametrosService,
    private readonly costoKm: CostoKmService,
    private readonly viajes: ViajesService,
  ) {}

  private sucursal(ctx: Ctx) {
    if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo');
    return ctx.sucursalId;
  }

  async factores(): Promise<Factores> {
    const n = (k: string) => this.parametros.numero(`cotizador.${k}`);
    const [to, tm, dO, dm, tn, tl, tml, gs, vel, che] = await Promise.all([
      n('terreno_ondulado_combustible'), n('terreno_montana_combustible'), n('terreno_ondulado_desgaste'), n('terreno_montana_desgaste'),
      n('trafico_normal'), n('trafico_lento'), n('trafico_muy_lento'), n('galones_por_100m_subida'), n('velocidad_promedio'), n('costo_hora_espera'),
    ]);
    return {
      combustibleTerreno: { PLANO: 0, ONDULADO: to, MONTANA: tm }, desgasteTerreno: { PLANO: 0, ONDULADO: dO, MONTANA: dm },
      combustibleTrafico: { FLUIDO: 0, NORMAL: tn, LENTO: tl, MUY_LENTO: tml }, galonesPor100mSubida: gs, velocidadPromedio: vel, costoHoraEspera: che,
    };
  }

  /** Calcula una cotización con todos sus supuestos (no guarda nada). */
  async calcular(d: Entrada) {
    const avisos: string[] = [];
    const ruta = d.rutaId ? await this.prisma.ruta.findFirst({ where: { id: d.rutaId, activo: true } }) : null;
    if (d.rutaId && !ruta) throw reglaNegocio('RUTA_INVALIDA', 'Elija una ruta activa');
    const kmIda = d.kmIda != null ? D(d.kmIda) : ruta ? D(ruta.kmEstimados) : null;
    if (!kmIda || kmIda.lte(0)) throw reglaNegocio('SIN_KM', 'Elija una ruta o escriba los km de ida');
    const origen = d.origen ?? ruta?.origen ?? null;
    const destino = d.destino ?? ruta?.destino ?? null;
    const terreno = d.terreno ?? ruta?.terreno ?? 'PLANO';
    const trafico = d.trafico ?? ruta?.trafico ?? 'NORMAL';
    const subidaMetros = d.subidaMetros ?? ruta?.subidaMetros ?? null;
    const horasEspera = d.horasEspera ?? (ruta ? Number(ruta.horasEspera) : 0);

    // Rendimiento, del más específico al más general
    let rendimiento: Decimal | null = d.rendimiento != null ? D(d.rendimiento) : null;
    let fuenteRend = 'indicado';
    let rendimientoDeRuta = false;
    if (!rendimiento && ruta) {
      const h = await this.costoKm.rendimientoRuta(ruta.id);
      if (h) { rendimiento = h.rendimiento; fuenteRend = `histórico de la ruta (${h.viajes} viajes)`; rendimientoDeRuta = true; }
    }
    if (!rendimiento && d.cabezalId) {
      rendimiento = await this.costoKm.rendimientoReal(d.cabezalId); fuenteRend = 'real del cabezal (90 días)';
      if (!rendimiento) { const c = await this.prisma.cabezal.findUnique({ where: { id: d.cabezalId }, select: { rendimientoEsperado: true } }); rendimiento = c?.rendimientoEsperado ? D(c.rendimientoEsperado) : null; fuenteRend = 'esperado del cabezal'; }
    }
    if (!rendimiento) { rendimiento = await this.costoKm.rendimientoReal(); fuenteRend = 'real de la flota (90 días)'; }
    if (!rendimiento) {
      const a = await this.prisma.cabezal.aggregate({ where: { activo: true, rendimientoEsperado: { not: null } }, _avg: { rendimientoEsperado: true } });
      rendimiento = a._avg.rendimientoEsperado ? D(a._avg.rendimientoEsperado).toDecimalPlaces(2) : null; fuenteRend = 'esperado promedio de la flota';
    }
    if (!rendimiento) throw reglaNegocio('SIN_RENDIMIENTO', 'No hay rendimiento de combustible registrado: escriba los km por galón');

    let precioGalon = d.precioGalon != null ? D(d.precioGalon) : await this.costoKm.precioGalonReciente();
    const fuentePrecio = d.precioGalon != null ? 'indicado' : precioGalon ? 'promedio pagado (15 días)' : 'parámetro combustible.precio_galon';
    if (!precioGalon) precioGalon = D(await this.parametros.numero('combustible.precio_galon'));

    let pagoPiloto = d.pagoPiloto != null ? D(d.pagoPiloto) : null;
    if (pagoPiloto == null) {
      const a = await this.prisma.piloto.aggregate({ where: { activo: true }, _avg: { pagoPorViaje: true } });
      pagoPiloto = D(a._avg.pagoPorViaje ?? 0).toDecimalPlaces(2);
    }
    const ck = await this.costoKm.calcular();
    avisos.push(...ck.avisos);
    const margen = d.margen ?? (await this.parametros.numero('viajes.margen_objetivo'));

    let tarifaActual: Prisma.Decimal | null = null;
    if (d.clienteId) {
      const t = elegirTarifa(await this.prisma.tarifa.findMany({ where: { clienteId: d.clienteId } }), ruta?.id ?? null, new Date());
      if (t) tarifaActual = montoPorTarifa(t, kmIda, d.toneladas ?? 0);
    }
    const factores = await this.factores();
    const c = cotizar({
      kmIda, regreso: d.regreso, terreno, trafico, subidaMetros, horasEspera, horasIda: ruta?.horasEstimadas ?? null,
      rendimiento, rendimientoDeRuta, precioGalon, pagoPiloto, factorCargasPiloto: factorIncluido(ck.cargas), costoKmIndirecto: ck.costoKm, margenObjetivo: margen, tarifaActual,
      peajes: d.peajes ?? ruta?.peajesEstimados ?? 0, viatico: d.viatico ?? ruta?.viaticoEstimado ?? 0, extras: d.extras, factores,
    });
    if (c.margenTarifaActual && c.margenTarifaActual.lt(0)) avisos.push(`La tarifa actual del cliente (Q${c.tarifaActual!.toFixed(2)}) no cubre el costo estimado`);
    if (horasEspera > 0 && D(factores.costoHoraEspera).isZero()) avisos.push('Las horas de espera no tienen costo: configure «cotizador.costo_hora_espera» si quiere cobrarlas');
    return {
      ...c, ruta: ruta?.nombre ?? null, rutaId: ruta?.id ?? null, origen, destino, kmIda, regreso: d.regreso, terreno, trafico, subidaMetros, horasEspera, extras: d.extras,
      margenObjetivo: margen, avisos,
      supuestos: { rendimiento, fuenteRendimiento: fuenteRend, precioGalon, fuentePrecio, pagoPiloto, costoKmIndirecto: ck.costoKm, fuenteCostoKm: ck.fuente, fuenteSueldos: ck.fuenteSueldos,
        cargas: ck.cargas.map((x) => ({ nombre: x.nombre, tasa: x.tasa, pagaHoy: x.paga, incluida: x.incluida })) },
      periodoCostoKm: { desde: ck.desde, hasta: ck.hasta, km: ck.km, partidas: ck.partidas },
    };
  }

  async cotizar(body: unknown) {
    return { data: await this.calcular(validar(cotizarZ, body ?? {})) };
  }

  // ─────────────────────────────── cotizaciones guardadas ──────────────────

  async guardar(ctx: Ctx, body: unknown) {
    const d = validar(guardarCotizacionZ, body);
    const sucursalId = this.sucursal(ctx);
    if (d.clienteId && !(await this.prisma.tercero.findFirst({ where: { id: d.clienteId, activo: true, esCliente: true } }))) throw reglaNegocio('CLIENTE_INVALIDO', 'Elija un cliente activo');
    const c = await this.calcular(d);
    if (!c.origen || !c.destino) throw reglaNegocio('ORIGEN_DESTINO', 'Elija una ruta o escriba el origen y el destino');
    const vigencia = await this.parametros.numero('cotizador.vigencia_dias');
    const precioOfrecido = d.precioOfrecido != null ? D(d.precioOfrecido) : c.precioRedondeado;
    const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
    const cot = await this.prisma.enTransaccion(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NUMERO_COTIZACION})`;
      const ultima = await tx.cotizacion.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } });
      const r = await tx.cotizacion.create({ data: {
        numero: siguienteNumero(ultima?.numero, 'CT-'), sucursalId, clienteId: d.clienteId ?? null, rutaId: c.rutaId, origen: c.origen!, destino: c.destino!,
        kmIda: c.kmIda, regreso: c.regreso, terreno: c.terreno, trafico: c.trafico, subidaMetros: c.subidaMetros, horasEspera: c.horasEspera, extras: json(c.extras), toneladas: d.toneladas ?? null,
        supuestos: json({ ...c.supuestos, margenObjetivo: c.margenObjetivo, avisos: c.avisos }), partidas: json(c.partidas), kmTotal: c.kmTotal, horasEstimadas: c.horasEstimadas,
        costoTotal: c.costoTotal, margen: c.margenObjetivo, precioSugerido: c.precioSugerido, precioOfrecido, vigenteHasta: sumarDias(fechaContable(), vigencia),
        notas: d.notas, creadoPorId: ctx.usuario.sub,
      } });
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Cotizacion', entidadId: r.id, despues: { numero: r.numero, precioOfrecido, costoTotal: c.costoTotal } }, tx);
      return r;
    });
    const avisoPrecio = precioOfrecido.lt(c.costoTotal) ? ' ⚠ el precio ofrecido no cubre el costo' : '';
    return { data: { id: cot.id, numero: cot.numero, precioOfrecido, vigenteHasta: aYmd(cot.vigenteHasta) }, message: `Cotización ${cot.numero} por Q${precioOfrecido.toFixed(2)}, vigente hasta el ${aYmd(cot.vigenteHasta)}${avisoPrecio}` };
  }

  async listar(ctx: Ctx, query: unknown) {
    const f = validar(z.object({ estado: z.enum(['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'CONVERTIDA']).optional(), clienteId: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }), query ?? {});
    const filas = await this.prisma.cotizacion.findMany({ where: { sucursalId: this.sucursal(ctx), ...(f.estado ? { estado: f.estado } : {}), ...(f.clienteId ? { clienteId: f.clienteId } : {}) }, orderBy: { creadoEn: 'desc' }, take: f.limit, include: { cliente: { select: { razonSocial: true, nombreComercial: true, nombres: true, apellidos: true } }, viaje: { select: { numero: true } }, creadoPor: { select: { nombre: true } } } });
    const hoy = fechaContable();
    return { data: filas.map((c) => ({
      id: c.id, numero: c.numero, cliente: c.cliente ? c.cliente.nombreComercial || c.cliente.razonSocial || [c.cliente.nombres, c.cliente.apellidos].filter(Boolean).join(' ') : null,
      origen: c.origen, destino: c.destino, regreso: c.regreso, kmTotal: c.kmTotal, costoTotal: c.costoTotal, precioOfrecido: c.precioOfrecido,
      ganancia: D(c.precioOfrecido).minus(D(c.costoTotal)), estado: c.estado, vencida: c.estado !== 'CONVERTIDA' && c.vigenteHasta < hoy, vigenteHasta: aYmd(c.vigenteHasta),
      viaje: c.viaje?.numero ?? null, creadoPor: c.creadoPor.nombre, creadoEn: c.creadoEn,
    })) };
  }

  async detalle(ctx: Ctx, id: number) {
    const c = await this.prisma.cotizacion.findFirst({ where: { id, sucursalId: this.sucursal(ctx) }, include: { cliente: true, ruta: { select: { nombre: true } }, viaje: { select: { id: true, numero: true } }, creadoPor: { select: { nombre: true } } } });
    if (!c) throw noEncontrado('Cotización', id);
    return { data: { ...c, ganancia: D(c.precioOfrecido).minus(D(c.costoTotal)), vencida: c.estado !== 'CONVERTIDA' && c.vigenteHasta < fechaContable() } };
  }

  async cambiarEstado(ctx: Ctx, id: number, body: unknown) {
    const { estado, precioOfrecido } = validar(z.object({ estado: z.enum(['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA']), precioOfrecido: z.coerce.number().positive().max(10_000_000).optional() }), body);
    const c = await this.prisma.cotizacion.findFirst({ where: { id, sucursalId: this.sucursal(ctx) } });
    if (!c) throw noEncontrado('Cotización', id);
    if (c.estado === 'CONVERTIDA') throw reglaNegocio('COTIZACION_CONVERTIDA', `La cotización ${c.numero} ya es el viaje: no se modifica`);
    await this.prisma.cotizacion.update({ where: { id }, data: { estado, ...(precioOfrecido ? { precioOfrecido } : {}) } });
    await this.audit.registrar(ctx, { accion: 'ESTADO', entidad: 'Cotizacion', entidadId: id, antes: { estado: c.estado, precioOfrecido: c.precioOfrecido }, despues: { estado, precioOfrecido } });
    return { message: `Cotización ${c.numero}: ${estado.toLowerCase()}` };
  }

  /** Convierte la cotización en un viaje programado con el precio ofrecido y los km vacíos según el regreso. */
  async convertir(ctx: Ctx, id: number, body: unknown) {
    const d = validar(convertirZ, body);
    const c = await this.prisma.cotizacion.findFirst({ where: { id, sucursalId: this.sucursal(ctx) } });
    if (!c) throw noEncontrado('Cotización', id);
    if (c.estado === 'CONVERTIDA') throw reglaNegocio('COTIZACION_CONVERTIDA', `La cotización ${c.numero} ya se convirtió en viaje`);
    if (c.estado === 'RECHAZADA') throw reglaNegocio('COTIZACION_RECHAZADA', `La cotización ${c.numero} fue rechazada por el cliente`);
    if (!c.clienteId) throw reglaNegocio('SIN_CLIENTE', 'La cotización no tiene cliente: guárdela de nuevo con el cliente');
    if (c.vigenteHasta < fechaContable()) throw reglaNegocio('COTIZACION_VENCIDA', `La cotización ${c.numero} venció el ${aYmd(c.vigenteHasta)}: haga una nueva con los costos de hoy`);
    const v = await this.viajes.programar(ctx, {
      ...d, clienteId: c.clienteId, rutaId: c.rutaId, origen: c.origen, destino: c.destino, toneladas: c.toneladas != null ? Number(c.toneladas) : null, montoCobrado: Number(c.precioOfrecido),
      kmVacios: c.regreso === 'VACIO' ? Number(c.kmIda) : 0, observaciones: `Cotización ${c.numero}${c.notas ? ` · ${c.notas}` : ''}`,
    });
    // Si dos personas convierten a la vez, solo una gana (viajeId es único)
    const r = await this.prisma.cotizacion.updateMany({ where: { id, estado: { not: 'CONVERTIDA' } }, data: { estado: 'CONVERTIDA', viajeId: v.data.id } });
    if (r.count === 0) {
      await this.viajes.cancelar(ctx, v.data.id, { motivo: `Duplicado: la cotización ${c.numero} ya se había convertido` });
      throw reglaNegocio('COTIZACION_CONVERTIDA', 'Otra persona ya convirtió esta cotización');
    }
    return { data: v.data, message: `Cotización ${c.numero} convertida en el viaje ${v.data.numero}` };
  }
}
