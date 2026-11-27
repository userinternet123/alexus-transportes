/**
 * GERENCIA por sede: costo total y rentabilidad de cada cabezal (TCO), scorecard de los pilotos,
 * presupuesto de mantenimiento contra lo gastado y tablero con los indicadores de la flota.
 * Lógica de cálculo en gerencia.logica.ts; aquí solo se juntan los datos.
 */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { PERMISO_COSTOS } from '../../common/auth/ocultar-costos';
import { DepreciacionService } from '../../common/costos/depreciacion.service';
import { reglaNegocio } from '../../common/errors';
import { parseFecha } from '../../common/fecha';
import { D, Decimal, r2, suma, ZERO } from '../../common/money';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { validar } from '../../common/pipes/zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { costoIncidente } from '../incidentes/incidentes.logica';
import {
  estadoPresupuesto, mesDe, NOMBRE_PARTIDA, PARTIDAS, Partida, periodoZ, presupuestoZ, prorrateoDocumento, repartir, scorePiloto, sugerido, tco,
} from './gerencia.logica';

const DIA = 86_400_000;
const HECHOS = ['FINALIZADO', 'LIQUIDADO'] as const;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const Q = (n: Decimal.Value) => `Q${D(n).toNumber().toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kmViaje = (v: { kmSalida: Decimal.Value | null; kmLlegada: Decimal.Value | null }) =>
  v.kmSalida != null && v.kmLlegada != null ? Decimal.max(ZERO, D(v.kmLlegada).minus(D(v.kmSalida))) : ZERO;
const sumar = (m: Map<number, Decimal>, k: number, v: Decimal.Value) => m.set(k, (m.get(k) ?? ZERO).plus(D(v)));
const nombre = (e: { nombres: string; apellidos: string }) => `${e.nombres} ${e.apellidos}`;

/** Primer y último día (inclusive) de un mes «AAAA-MM». */
function rangoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  return { desde: new Date(Date.UTC(a, m - 1, 1)), hasta: new Date(Date.UTC(a, m, 0, 23, 59, 59, 999)) };
}

@Injectable()
export class GerenciaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parametros: ParametrosService,
    private readonly depreciacion: DepreciacionService,
  ) {}

  private sucursal(ctx: Ctx) {
    if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo');
    return ctx.sucursalId;
  }

  /** Período pedido; por omisión, el mes en curso hasta hoy. */
  private periodo(q: unknown) {
    const f = validar(periodoZ, q ?? {});
    const hoy = new Date();
    const desde = f.desde ? parseFecha(f.desde) : new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
    const hasta = f.hasta ? new Date(parseFecha(f.hasta).getTime() + DIA - 1) : hoy;
    if (hasta < desde) throw reglaNegocio('PERIODO_INVALIDO', 'La fecha final es anterior a la inicial');
    if (hasta.getTime() - desde.getTime() > 400 * DIA) throw reglaNegocio('PERIODO_LARGO', 'Elija un período de hasta un año');
    return { desde, hasta, dias: Math.floor((hasta.getTime() - desde.getTime()) / DIA) + 1 };
  }

  // ─────────────────────────────── Costo total por cabezal ───────────────────────────────

  /** TCO de cada cabezal de la sede en el período: partidas de costo, ingresos, utilidad, costo e ingreso por km. */
  private async calcularUnidades(sucursalId: number, desde: Date, hasta: Date, dias: number) {
    const rango = { gte: desde, lte: hasta };
    const [cabezales, viajes, cargas, ordenes, incidentes, gastos, documentos, montajes, incluirDep, kmLlantaDefecto] = await Promise.all([
      this.prisma.cabezal.findMany({ where: { sucursalId, activo: true }, orderBy: { codigo: 'asc' }, select: { id: true, codigo: true, placa: true, marca: true, modelo: true, anio: true, estado: true, rendimientoEsperado: true } }),
      this.prisma.viaje.findMany({
        where: { sucursalId, estado: { in: [...HECHOS] }, fechaSalida: rango },
        select: { id: true, cabezalId: true, pilotoId: true, fechaSalida: true, fechaLlegada: true, kmSalida: true, kmLlegada: true, kmVacios: true, montoCobrado: true, pagoPiloto: true, costos: { where: { tipo: { not: 'COMBUSTIBLE' } }, select: { monto: true } } },
      }),
      this.prisma.cargaCombustible.findMany({ where: { sucursalId, anulada: false, fecha: rango }, select: { cabezalId: true, total: true } }),
      this.prisma.ordenTrabajo.findMany({ where: { sucursalId, estado: 'CERRADA', fechaCierre: rango, cabezalId: { not: null } }, select: { cabezalId: true, total: true } }),
      this.prisma.incidente.findMany({ where: { sucursalId, estado: { not: 'ANULADO' }, fecha: rango, cabezalId: { not: null } }, select: { cabezalId: true, montoMulta: true, montoPagado: true, pagadoEn: true, costoDanos: true, costoTerceros: true, montoRecuperado: true, descuentoPiloto: true } }),
      this.prisma.gasto.findMany({ where: { sucursalId, estado: 'REGISTRADO', fecha: rango }, select: { monto: true, viaje: { select: { cabezalId: true } } } }),
      this.prisma.documentoVehiculo.findMany({ where: { activo: true, cabezal: { sucursalId }, costo: { not: null }, vence: { gte: desde } }, select: { cabezalId: true, costo: true, emitido: true, vence: true } }),
      this.prisma.montajeLlanta.findMany({ where: { cabezal: { sucursalId }, OR: [{ fechaRetiro: null }, { fechaRetiro: { gte: desde } }], fechaMontaje: { lte: hasta } }, select: { cabezalId: true, llanta: { select: { precio: true, costoReencauches: true, kmEsperados: true } } } }),
      this.parametros.booleano('costos.incluir_depreciacion'),
      this.parametros.numero('llantas.km_esperados'),
    ]);
    const ids = new Set(cabezales.map((c) => c.id));
    const avisos: string[] = [];

    // Km, ingresos y días en ruta por cabezal; km de cada piloto en cada cabezal
    const km = new Map<number, Decimal>();
    const kmVacios = new Map<number, Decimal>();
    const ingresos = new Map<number, Decimal>();
    const nViajes = new Map<number, number>();
    const diasRuta = new Map<number, Set<string>>();
    const kmPilotoCabezal = new Map<number, Map<number, Decimal>>();
    const p: Record<Partida, Map<number, Decimal>> = Object.fromEntries(PARTIDAS.map((x) => [x, new Map<number, Decimal>()])) as never;
    for (const v of viajes) {
      const k = kmViaje(v);
      sumar(km, v.cabezalId, k);
      sumar(kmVacios, v.cabezalId, v.kmVacios);
      sumar(ingresos, v.cabezalId, v.montoCobrado);
      nViajes.set(v.cabezalId, (nViajes.get(v.cabezalId) ?? 0) + 1);
      sumar(p.viaje, v.cabezalId, suma(v.costos.map((c) => c.monto)));
      sumar(p.piloto, v.cabezalId, v.pagoPiloto);
      const pm = kmPilotoCabezal.get(v.pilotoId) ?? new Map<number, Decimal>();
      sumar(pm, v.cabezalId, k);
      kmPilotoCabezal.set(v.pilotoId, pm);
      const set = diasRuta.get(v.cabezalId) ?? new Set<string>();
      const fin = Math.min((v.fechaLlegada ?? v.fechaSalida).getTime(), hasta.getTime());
      for (let t = Math.max(v.fechaSalida.getTime(), desde.getTime()); t <= fin; t += DIA) set.add(ymd(new Date(t)));
      set.add(ymd(v.fechaSalida));
      diasRuta.set(v.cabezalId, set);
    }
    for (const c of cargas) sumar(p.combustible, c.cabezalId, c.total);
    for (const o of ordenes) sumar(p.taller, o.cabezalId!, o.total);
    for (const i of incidentes) sumar(p.incidentes, i.cabezalId!, costoIncidente(i).neto);
    for (const d of documentos) if (d.cabezalId) sumar(p.documentos, d.cabezalId, prorrateoDocumento(d, desde, hasta));

    // Llantas: km recorridos × costo por km esperado de las llantas montadas (precio y reencauches ÷ km esperados por vida)
    const costoKmLlantas = new Map<number, Decimal>();
    for (const m of montajes) {
      if (!m.cabezalId) continue;
      const kmEsp = Math.max(1, m.llanta.kmEsperados ?? kmLlantaDefecto);
      sumar(costoKmLlantas, m.cabezalId, D(m.llanta.precio).div(kmEsp));
    }
    for (const [id, ck] of costoKmLlantas) sumar(p.llantas, id, ck.times(km.get(id) ?? ZERO));

    // Depreciación del período de cada cabezal
    if (incluirDep) {
      const dep = await this.depreciacion.calcular({ desde, hasta });
      for (const u of dep.unidades) if (u.tipo === 'CABEZAL' && ids.has(u.id)) sumar(p.depreciacion, u.id, u.periodo);
    }

    // Sueldo de los pilotos (planillas aprobadas del período o estimado) repartido por los km que manejó en cada cabezal
    const pilotos = await this.prisma.piloto.findMany({ where: { id: { in: [...kmPilotoCabezal.keys()] } }, select: { id: true, empleado: { select: { id: true, salarioBase: true, bonificacionIncentivo: true } } } });
    const detalles = await this.prisma.planillaDetalle.findMany({
      where: { empleadoId: { in: pilotos.map((x) => x.empleado.id) }, planilla: { estado: { in: ['APROBADA', 'PAGADA'] }, fechaInicio: { lte: hasta }, fechaFin: { gte: desde } } },
      select: { empleadoId: true, totalDevengado: true, comisiones: true, planilla: { select: { fechaInicio: true, fechaFin: true } } },
    });
    const estimar = await this.parametros.booleano('costos.estimar_sueldos');
    let sueldosEstimados = false;
    for (const pi of pilotos) {
      const suyos = detalles.filter((d) => d.empleadoId === pi.empleado.id);
      let sueldo = ZERO;
      if (suyos.length) {
        for (const d of suyos) {
          const diasPl = Math.floor((d.planilla.fechaFin.getTime() - d.planilla.fechaInicio.getTime()) / DIA) + 1;
          const dentro = Math.min(diasPl, Math.floor((Math.min(d.planilla.fechaFin.getTime() + DIA - 1, hasta.getTime()) - Math.max(d.planilla.fechaInicio.getTime(), desde.getTime())) / DIA) + 1);
          sueldo = sueldo.plus(D(d.totalDevengado).minus(D(d.comisiones)).times(Math.max(0, dentro)).div(diasPl));
        }
      } else if (estimar) {
        sueldo = D(pi.empleado.salarioBase).plus(D(pi.empleado.bonificacionIncentivo)).times(dias).div(30);
        sueldosEstimados = true;
      }
      for (const [cab, monto] of repartir(sueldo, kmPilotoCabezal.get(pi.id)!)) sumar(p.piloto, cab, monto);
    }
    if (sueldosEstimados) avisos.push('Sin planilla aprobada del período: el sueldo de los pilotos se estimó con su salario base.');

    // Gastos: los de un viaje van a su cabezal; los generales se reparten por km
    let generales = ZERO;
    for (const g of gastos) {
      if (g.viaje && ids.has(g.viaje.cabezalId)) sumar(p.viaje, g.viaje.cabezalId, g.monto);
      else generales = generales.plus(D(g.monto));
    }
    const pesos = new Map([...km].filter(([id]) => ids.has(id)));
    for (const [cab, monto] of repartir(generales, pesos)) sumar(p.generales, cab, monto);
    if (generales.gt(0) && !pesos.size) avisos.push(`Hay ${Q(generales)} de gastos generales sin repartir: ningún cabezal tiene km en el período.`);

    const filas = cabezales.map((c) => {
      const r = tco({
        ingresos: ingresos.get(c.id) ?? 0, km: km.get(c.id) ?? 0, kmVacios: kmVacios.get(c.id) ?? 0, viajes: nViajes.get(c.id) ?? 0,
        diasConViaje: diasRuta.get(c.id)?.size ?? 0, diasPeriodo: dias,
        partidas: Object.fromEntries(PARTIDAS.map((x) => [x, p[x].get(c.id) ?? ZERO])),
      });
      return { cabezal: { id: c.id, codigo: c.codigo, placa: c.placa, marca: c.marca, modelo: c.modelo, anio: c.anio, estado: c.estado }, ...r };
    });
    const flota = tco({
      ingresos: suma(filas.map((f) => f.ingresos)), km: suma(filas.map((f) => f.km)), kmVacios: suma(cabezales.map((c) => kmVacios.get(c.id) ?? ZERO)),
      viajes: filas.reduce((a, f) => a + f.viajes, 0), diasConViaje: cabezales.reduce((a, c) => a + (diasRuta.get(c.id)?.size ?? 0), 0), diasPeriodo: dias * Math.max(1, cabezales.length),
      partidas: Object.fromEntries(PARTIDAS.map((x) => [x, suma(filas.map((f) => f.partidas[x]))])),
    });
    const sinKm = filas.filter((f) => f.km.lte(0) && f.costoTotal.gt(0)).map((f) => f.cabezal.codigo);
    if (sinKm.length) avisos.push(`${sinKm.join(', ')}: tiene(n) costos pero no viajes terminados en el período (costo por km no se calcula).`);
    return { filas, flota, avisos };
  }

  async unidades(ctx: Ctx, q: unknown) {
    const { desde, hasta, dias } = this.periodo(q);
    const r = await this.calcularUnidades(this.sucursal(ctx), desde, hasta, dias);
    return {
      data: {
        desde: ymd(desde), hasta: ymd(hasta), dias,
        partidas: PARTIDAS.map((x) => ({ clave: x, nombre: NOMBRE_PARTIDA[x] })),
        unidades: r.filas.sort((a, b) => b.utilidad.comparedTo(a.utilidad)), flota: r.flota, avisos: r.avisos,
      },
    };
  }

  // ─────────────────────────────── Scorecard de pilotos ───────────────────────────────

  async scorecard(ctx: Ctx, q: unknown) {
    const sucursalId = this.sucursal(ctx);
    const { desde, hasta } = this.periodo(q);
    const rango = { gte: desde, lte: hasta };
    const [pilotos, viajes, cargas, incidentes, inspecciones] = await Promise.all([
      this.prisma.piloto.findMany({ where: { OR: [{ activo: true, empleado: { sucursalId } }, { viajes: { some: { sucursalId, fechaSalida: rango } } }] }, select: { id: true, licenciaVence: true, empleado: { select: { nombres: true, apellidos: true } } } }),
      this.prisma.viaje.findMany({ where: { sucursalId, estado: { in: [...HECHOS] }, fechaSalida: rango }, select: { pilotoId: true, kmSalida: true, kmLlegada: true, fechaLlegada: true, fechaCompromiso: true, montoCobrado: true, ganancia: true } }),
      this.prisma.cargaCombustible.findMany({ where: { sucursalId, anulada: false, fecha: rango, pilotoId: { not: null }, rendimiento: { not: null } }, select: { pilotoId: true, rendimiento: true, kmRecorridos: true, galonesTramo: true, cabezal: { select: { rendimientoEsperado: true } } } }),
      this.prisma.incidente.findMany({ where: { sucursalId, estado: { not: 'ANULADO' }, fecha: rango, pilotoId: { not: null }, responsable: { in: ['PILOTO', 'SIN_DEFINIR'] } }, select: { pilotoId: true, tipo: true } }),
      this.prisma.inspeccion.groupBy({ by: ['pilotoId'], where: { sucursalId, fecha: rango, pilotoId: { not: null } }, _count: { _all: true } }),
    ]);
    const hoy = new Date();
    const filas = pilotos.map((pi) => {
      const vs = viajes.filter((v) => v.pilotoId === pi.id);
      const comp = vs.filter((v) => v.fechaCompromiso && v.fechaLlegada);
      const aTiempo = comp.filter((v) => v.fechaLlegada! <= v.fechaCompromiso!).length;
      const cs = cargas.filter((c) => c.pilotoId === pi.id && c.cabezal.rendimientoEsperado != null);
      // Rendimiento ponderado por km (km totales ÷ galones totales) frente al esperado ponderado igual
      const kmC = suma(cs.map((c) => c.kmRecorridos ?? 0));
      const galC = suma(cs.map((c) => c.galonesTramo ?? 0));
      const galEsp = suma(cs.map((c) => D(c.kmRecorridos ?? 0).div(D(c.cabezal.rendimientoEsperado!))));
      const rendimientoReal = galC.gt(0) ? kmC.div(galC).toDecimalPlaces(2) : null;
      const rendimientoEsperado = galEsp.gt(0) ? kmC.div(galEsp).toDecimalPlaces(2) : null;
      const inc = incidentes.filter((i) => i.pilotoId === pi.id);
      const accidentes = inc.filter((i) => i.tipo === 'ACCIDENTE').length;
      const multas = inc.filter((i) => i.tipo === 'MULTA').length;
      const insp = inspecciones.find((x) => x.pilotoId === pi.id)?._count._all ?? 0;
      const s = scorePiloto({ viajes: vs.length, conCompromiso: comp.length, aTiempo, rendimientoReal, rendimientoEsperado, accidentes, multas, otrosIncidentes: inc.length - accidentes - multas, inspecciones: insp });
      const diasLicencia = Math.floor((pi.licenciaVence.getTime() - hoy.getTime()) / DIA);
      return {
        piloto: { id: pi.id, nombre: nombre(pi.empleado) }, ...s,
        viajes: vs.length, km: suma(vs.map(kmViaje)).toDecimalPlaces(0), ingresos: r2(suma(vs.map((v) => v.montoCobrado))), ganancia: r2(suma(vs.map((v) => v.ganancia ?? 0))),
        conCompromiso: comp.length, aTiempo, rendimientoReal, rendimientoEsperado, accidentes, multas, otrosIncidentes: inc.length - accidentes - multas, inspeccionesHechas: insp,
        licenciaVence: ymd(pi.licenciaVence), diasLicencia,
      };
    });
    filas.sort((a, b) => (b.puntaje ?? -1) - (a.puntaje ?? -1));
    return { data: { desde: ymd(desde), hasta: ymd(hasta), pesos: { puntualidad: 30, rendimiento: 25, seguridad: 30, inspecciones: 15 }, pilotos: filas } };
  }

  // ─────────────────────────────── Presupuesto de mantenimiento ───────────────────────────────

  /** Lo gastado en mantenimiento (órdenes cerradas + llantas compradas y reencauches) por mes y cabezal (0 = sin cabezal). */
  private async gastoMantenimiento(sucursalId: number, desde: Date, hasta: Date) {
    const rango = { gte: desde, lte: hasta };
    const [ordenes, llantas, reencauches] = await Promise.all([
      this.prisma.ordenTrabajo.findMany({ where: { sucursalId, estado: 'CERRADA', fechaCierre: rango }, select: { cabezalId: true, total: true, fechaCierre: true } }),
      // Las llantas no tienen sede: se cuentan las que se compraron y se montaron en un cabezal de la sede (o siguen en bodega sin montar)
      this.prisma.llanta.findMany({ where: { fechaCompra: rango, OR: [{ montajes: { some: { cabezal: { sucursalId } } } }, { montajes: { none: {} } }] }, select: { precio: true, fechaCompra: true, montajes: { orderBy: { fechaMontaje: 'asc' }, take: 1, select: { cabezalId: true } } } }),
      this.prisma.reencaucheLlanta.findMany({ where: { fecha: rango }, select: { costo: true, fecha: true } }),
    ]);
    const g = new Map<string, { taller: Decimal; llantas: Decimal }>();
    const add = (mes: string, cab: number, campo: 'taller' | 'llantas', v: Decimal.Value) => {
      const k = `${mes}|${cab}`;
      const x = g.get(k) ?? { taller: ZERO, llantas: ZERO };
      x[campo] = x[campo].plus(D(v));
      g.set(k, x);
    };
    for (const o of ordenes) add(mesDe(o.fechaCierre!), o.cabezalId ?? 0, 'taller', o.total);
    for (const l of llantas) add(ymd(l.fechaCompra!).slice(0, 7), l.montajes[0]?.cabezalId ?? 0, 'llantas', l.precio);
    for (const r of reencauches) add(ymd(r.fecha).slice(0, 7), 0, 'llantas', r.costo);
    return g;
  }

  async presupuesto(ctx: Ctx, q: { anio?: string; mes?: string }) {
    const sucursalId = this.sucursal(ctx);
    const hoy = new Date();
    const anio = Number(q.anio) || hoy.getUTCFullYear();
    const mes = Number(q.mes) || hoy.getUTCMonth() + 1;
    if (mes < 1 || mes > 12 || anio < 2020 || anio > 2100) throw reglaNegocio('PERIODO_INVALIDO', 'Mes o año no válido');
    const clave = `${anio}-${String(mes).padStart(2, '0')}`;
    const { desde, hasta } = rangoMes(clave);
    const hace6 = new Date(Date.UTC(anio, mes - 7, 1));
    const [cabezales, presupuestos, gasto] = await Promise.all([
      this.prisma.cabezal.findMany({ where: { sucursalId, activo: true }, orderBy: { codigo: 'asc' }, select: { id: true, codigo: true, placa: true } }),
      this.prisma.presupuestoMantenimiento.findMany({ where: { sucursalId, anio, mes } }),
      this.gastoMantenimiento(sucursalId, hace6, hasta),
    ]);
    const meses6 = Array.from({ length: 6 }, (_, i) => ymd(new Date(Date.UTC(anio, mes - 7 + i, 1))).slice(0, 7));
    const gastado = (m: string, cab?: number) => {
      let t = ZERO, l = ZERO;
      for (const [k, v] of gasto) {
        const [mm, c] = k.split('|');
        if (mm !== m || (cab != null && Number(c) !== cab)) continue;
        t = t.plus(v.taller);
        l = l.plus(v.llantas);
      }
      return { taller: r2(t), llantas: r2(l), total: r2(t.plus(l)) };
    };
    const fila = (cab: { id: number; codigo: string; placa: string } | null) => {
      const pr = presupuestos.find((x) => x.cabezalId === (cab?.id ?? null));
      const g = gastado(clave, cab?.id);
      const historia = meses6.map((m) => gastado(m, cab?.id).total);
      return {
        cabezal: cab, presupuesto: pr ? r2(pr.monto) : null, notas: pr?.notas ?? null, gastado: g,
        disponible: pr ? r2(D(pr.monto).minus(g.total)) : null, ...estadoPresupuesto(pr?.monto ?? null, g.total),
        sugerido: sugerido(historia), historia: meses6.map((m, i) => ({ mes: m, gastado: historia[i] })),
      };
    };
    // Avance del mes: qué parte del mes ya pasó, para leer si el ritmo de gasto va bien
    const avanceMes = hoy < desde ? 0 : hoy > hasta ? 100 : Math.round(((hoy.getTime() - desde.getTime()) / (hasta.getTime() - desde.getTime())) * 100);
    return { data: { anio, mes, periodo: clave, avanceMes, flota: fila(null), cabezales: cabezales.map(fila) } };
  }

  async guardarPresupuesto(ctx: Ctx, b: unknown) {
    const sucursalId = this.sucursal(ctx);
    const d = validar(presupuestoZ, b);
    if (d.cabezalId && !(await this.prisma.cabezal.count({ where: { id: d.cabezalId, sucursalId } }))) throw reglaNegocio('CABEZAL_INVALIDO', 'Elija un cabezal de esta sede');
    const meses = d.todoElAnio ? Array.from({ length: 13 - d.mes }, (_, i) => d.mes + i) : [d.mes];
    await this.prisma.enTransaccion(async (tx) => {
      for (const mes of meses) {
        const previo = await tx.presupuestoMantenimiento.findFirst({ where: { sucursalId, anio: d.anio, mes, cabezalId: d.cabezalId ?? null } });
        if (previo) await tx.presupuestoMantenimiento.update({ where: { id: previo.id }, data: { monto: d.monto, notas: d.notas ?? null, actualizadoPor: ctx.usuario.sub } });
        else await tx.presupuestoMantenimiento.create({ data: { sucursalId, anio: d.anio, mes, cabezalId: d.cabezalId ?? null, monto: d.monto, notas: d.notas ?? null, actualizadoPor: ctx.usuario.sub } });
      }
      await this.audit.registrar(ctx, { accion: 'PRESUPUESTO_MANTENIMIENTO', entidad: 'presupuesto_mantenimiento', entidadId: `${d.anio}-${d.mes}${d.cabezalId ? `-C${d.cabezalId}` : ''}`, despues: { ...d, meses } }, tx);
    });
    return this.presupuesto(ctx, { anio: String(d.anio), mes: String(d.mes) });
  }

  // ─────────────────────────────── Tablero ───────────────────────────────

  /** Indicadores de la flota del período y la tendencia de los últimos 6 meses (ingresos, costo, utilidad, km). */
  async tablero(ctx: Ctx, q: unknown) {
    const sucursalId = this.sucursal(ctx);
    const { desde, hasta, dias } = this.periodo(q);
    const hoy = new Date();
    const [actual, viajes, enRuta, enTaller, cabezalesActivos, cxc, multasPend] = await Promise.all([
      this.calcularUnidades(sucursalId, desde, hasta, dias),
      this.prisma.viaje.findMany({ where: { sucursalId, estado: { in: [...HECHOS] }, fechaSalida: { gte: desde, lte: hasta } }, select: { fechaLlegada: true, fechaCompromiso: true, toneladas: true } }),
      this.prisma.viaje.count({ where: { sucursalId, estado: 'EN_RUTA' } }),
      this.prisma.cabezal.count({ where: { sucursalId, activo: true, estado: 'EN_TALLER' } }),
      this.prisma.cabezal.count({ where: { sucursalId, activo: true } }),
      this.prisma.cuentaCobrar.findMany({ where: { sucursalId, estado: { in: ['PENDIENTE', 'PARCIAL'] } }, select: { saldo: true, fechaVencimiento: true } }),
      this.prisma.incidente.aggregate({ where: { sucursalId, estado: { in: ['ABIERTO', 'EN_TRAMITE'] }, tipo: 'MULTA', pagadoEn: null }, _sum: { montoMulta: true }, _count: { _all: true } }),
    ]);
    const comp = viajes.filter((v) => v.fechaCompromiso && v.fechaLlegada);
    const aTiempo = comp.filter((v) => v.fechaLlegada! <= v.fechaCompromiso!).length;

    // Tendencia: 6 meses que terminan en el mes de «hasta»
    const meses = Array.from({ length: 6 }, (_, i) => ymd(new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth() - 5 + i, 1))).slice(0, 7));
    const tendencia = [];
    for (const m of meses) {
      const r = rangoMes(m);
      const fin = r.hasta > hoy ? hoy : r.hasta;
      if (fin < r.desde) continue;
      const u = await this.calcularUnidades(sucursalId, r.desde, fin, Math.floor((fin.getTime() - r.desde.getTime()) / DIA) + 1);
      tendencia.push({ mes: m, ingresos: u.flota.ingresos, costo: u.flota.costoTotal, utilidad: u.flota.utilidad, km: u.flota.km, costoKm: u.flota.costoKm, viajes: u.flota.viajes });
    }
    const f = actual.flota;
    const vencida = cxc.filter((c) => c.fechaVencimiento < hoy);
    return {
      data: {
        desde: ymd(desde), hasta: ymd(hasta), dias,
        kpis: {
          ingresos: f.ingresos, costoTotal: f.costoTotal, utilidad: f.utilidad, margen: f.margen, costoKm: f.costoKm, ingresoKm: f.ingresoKm,
          km: f.km, viajes: f.viajes, kmVaciosPct: f.kmVaciosPct, utilizacion: f.utilizacion,
          aTiempoPct: comp.length ? Math.round((aTiempo / comp.length) * 100) : null, conCompromiso: comp.length,
          toneladas: suma(viajes.map((v) => v.toneladas ?? 0)).toDecimalPlaces(1),
          enRuta, enTaller, cabezales: cabezalesActivos, disponibilidad: cabezalesActivos ? Math.round(((cabezalesActivos - enTaller) / cabezalesActivos) * 100) : null,
          porCobrar: r2(suma(cxc.map((c) => c.saldo))), vencido: r2(suma(vencida.map((c) => c.saldo))),
          multasPendientes: multasPend._count._all, montoMultas: r2(multasPend._sum.montoMulta ?? 0),
        },
        // El desglose de costos solo para quien ve costos (el interceptor no reconoce «monto» como sensible)
        partidas: tienePermiso(ctx.usuario, PERMISO_COSTOS) ? PARTIDAS.map((x) => ({ clave: x, nombre: NOMBRE_PARTIDA[x], monto: f.partidas[x] })).filter((x) => x.monto.gt(0)) : [],
        ranking: actual.filas.map((x) => ({ cabezal: x.cabezal.codigo, utilidad: x.utilidad, margen: x.margen, costoKm: x.costoKm, km: x.km, utilizacion: x.utilizacion })).sort((a, b) => b.utilidad.comparedTo(a.utilidad)),
        tendencia, avisos: actual.avisos,
      },
    };
  }

  /** Campana: presupuesto de mantenimiento del mes al 90 % o pasado. */
  async avisos(ctx: Ctx) {
    if (!ctx.sucursalId) return [];
    const r = (await this.presupuesto(ctx, {})).data;
    const lista: { id: string; tipo: string; nivel: 'info' | 'aviso' | 'critico'; titulo: string; detalle: string; ruta: string }[] = [];
    for (const x of [r.flota, ...r.cabezales]) {
      if (x.estado !== 'CERCA' && x.estado !== 'EXCEDIDO') continue;
      const quien = x.cabezal ? x.cabezal.codigo : 'la flota';
      lista.push({
        id: `presupuesto:${r.periodo}:${x.cabezal?.id ?? 0}:${x.estado}`, tipo: 'presupuesto', nivel: x.estado === 'EXCEDIDO' ? 'critico' : 'aviso',
        titulo: x.estado === 'EXCEDIDO' ? `Mantenimiento de ${quien} pasó el presupuesto del mes (${x.usado} %)` : `Mantenimiento de ${quien} va en ${x.usado} % del presupuesto`,
        detalle: `Gastado ${Q(x.gastado.total)} de ${Q(x.presupuesto!)} con el ${r.avanceMes} % del mes transcurrido.`, ruta: '/home/tablero?vista=PRESUPUESTO',
      });
    }
    return lista;
  }
}
