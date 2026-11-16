/**
 * COTIZADOR: cuánto cuesta un viaje y a cuánto conviene cobrarlo.
 * Usa datos reales cuando los hay (rendimiento del cabezal, precio del diésel de
 * las últimas cargas, mantenimiento y gastos fijos por km de los últimos 12 meses)
 * y, si no, los parámetros del sistema. Cada renglón dice de dónde salió el dato.
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Ctx } from '../../common/auth/tipos';
import { reglaNegocio } from '../../common/errors';
import { hoyGuatemala } from '../../common/fecha';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { zIdOpt, zMontoOpt } from '../../common/pipes/zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { rendimientos, resumenRendimiento } from '../combustible/combustible.logica';
import { montoPorTarifa, r2 } from './viajes.logica';

const cotizarZ = z.object({
  rutaId: zIdOpt,
  km: zMontoOpt,
  horas: zMontoOpt,
  toneladas: zMontoOpt,
  clienteId: zIdOpt,
  cabezalId: zIdOpt,
  pilotoId: zIdOpt,
  kmVacios: zMontoOpt, // km de regreso o posicionamiento sin carga (también cuestan)
  margen: zMontoOpt, // % deseado; por defecto viajes.margen_objetivo
});

const N = (d: unknown) => (d == null ? 0 : Number(d));
type Fuente = 'real' | 'parametro' | 'ruta' | 'cabezal' | 'piloto' | 'cliente';
interface Linea { concepto: string; monto: number; fuente: Fuente; detalle: string }

@Injectable()
export class CotizadorService {
  constructor(private readonly prisma: PrismaService, private readonly parametros: ParametrosService) {}

  async cotizar(ctx: Ctx, body: unknown) {
    const d = cotizarZ.parse(body ?? {});
    const ruta = d.rutaId ? await this.prisma.ruta.findUnique({ where: { id: d.rutaId } }) : null;
    const kmCarga = d.km ?? N(ruta?.kmEstimados);
    if (kmCarga <= 0) throw reglaNegocio('KM_REQUERIDO', 'Indique los km del viaje o elija una ruta');
    const kmVacios = d.kmVacios ?? 0;
    const km = kmCarga + kmVacios;
    const horas = d.horas ?? (N(ruta?.horasEstimadas) || km / 45); // 45 km/h promedio en carretera centroamericana
    const dias = Math.max(1, Math.ceil(horas / 12));
    const hace12m = new Date(Date.now() - 365 * 86_400_000); const hace30d = new Date(Date.now() - 30 * 86_400_000);
    const lineas: Linea[] = [];

    // 1) Combustible: km / rendimiento × precio
    const cabezal = d.cabezalId ? await this.prisma.cabezal.findUnique({ where: { id: d.cabezalId } }) : null;
    const cargas = await this.prisma.cargaCombustible.findMany({ where: { anulada: false, fecha: { gte: hace12m }, ...(cabezal ? { cabezalId: cabezal.id } : {}) }, select: { id: true, cabezalId: true, fecha: true, odometro: true, galones: true, total: true, tanqueLleno: true } });
    const real = resumenRendimiento(rendimientos(cargas.map((c) => ({ ...c, odometro: N(c.odometro), galones: N(c.galones), total: N(c.total) }))));
    let rendimiento: number; let fuenteRend: Fuente; let detRend: string;
    if (real.kmPorGalon && real.km >= 500) { rendimiento = real.kmPorGalon; fuenteRend = 'real'; detRend = `${rendimiento} km/gal reales (${real.km} km, ${real.galones} gal${cabezal ? ` del ${cabezal.codigo}` : ' de la flota'})`; }
    else if (cabezal?.rendimientoEsperado) { rendimiento = N(cabezal.rendimientoEsperado); fuenteRend = 'cabezal'; detRend = `${rendimiento} km/gal esperados del ${cabezal.codigo}`; }
    else { rendimiento = await this.parametros.numero('combustible.rendimiento_referencia'); fuenteRend = 'parametro'; detRend = `${rendimiento} km/gal de referencia (parámetro)`; }
    const recientes = await this.prisma.cargaCombustible.aggregate({ where: { anulada: false, fecha: { gte: hace30d } }, _sum: { galones: true, total: true } });
    const precioReal = N(recientes._sum.galones) > 0 ? r2(N(recientes._sum.total) / N(recientes._sum.galones)) : 0;
    const precioGalon = precioReal || (await this.parametros.numero('combustible.precio_galon'));
    const galones = r2(km / rendimiento);
    lineas.push({ concepto: 'Combustible', monto: r2(galones * precioGalon), fuente: fuenteRend, detalle: `${km} km ÷ ${detRend} = ${galones} gal × Q${precioGalon.toFixed(2)} (${precioReal ? 'precio promedio últimos 30 días' : 'precio de referencia'})` });

    // 2) Peajes y viáticos
    if (ruta && N(ruta.peajesEstimados) > 0) lineas.push({ concepto: 'Peajes', monto: N(ruta.peajesEstimados), fuente: 'ruta', detalle: `Peajes estimados de la ruta ${ruta.nombre}` });
    const piloto = d.pilotoId ? await this.prisma.piloto.findUnique({ where: { id: d.pilotoId }, include: { empleado: { select: { nombres: true } } } }) : null;
    const promPilotos = await this.prisma.piloto.aggregate({ where: { activo: true }, _avg: { viaticoDiario: true, pagoPorViaje: true } });
    if (ruta && N(ruta.viaticoEstimado) > 0) lineas.push({ concepto: 'Viáticos', monto: N(ruta.viaticoEstimado), fuente: 'ruta', detalle: `Viático estimado de la ruta` });
    else { const vd = piloto ? N(piloto.viaticoDiario) : N(promPilotos._avg.viaticoDiario); if (vd > 0) lineas.push({ concepto: 'Viáticos', monto: r2(vd * dias), fuente: piloto ? 'piloto' : 'real', detalle: `${dias} día(s) × Q${vd.toFixed(2)} ${piloto ? `de ${piloto.empleado.nombres}` : 'promedio de los pilotos'}` }); }

    // 3) Pago al piloto por el viaje
    const pago = piloto ? N(piloto.pagoPorViaje) : N(promPilotos._avg.pagoPorViaje);
    if (pago > 0) lineas.push({ concepto: 'Pago al piloto', monto: r2(pago), fuente: piloto ? 'piloto' : 'real', detalle: piloto ? `Bono por viaje de ${piloto.empleado.nombres}` : 'Promedio del bono por viaje de los pilotos' });

    // 4) Mantenimiento + llantas y 5) gastos fijos, prorrateados por km de los últimos 12 meses
    const kmPeriodo = await this.prisma.$queryRaw<{ km: number | null }[]>`SELECT COALESCE(SUM(km_llegada - km_salida), 0)::float AS km FROM viajes WHERE estado IN ('FINALIZADO','LIQUIDADO') AND km_llegada IS NOT NULL AND fecha_salida >= ${hace12m}`;
    const kmHist = N(kmPeriodo[0]?.km);
    const [ot, llantas, gastos] = await Promise.all([
      this.prisma.ordenTrabajo.aggregate({ where: { estado: 'CERRADA', fechaCierre: { gte: hace12m } }, _sum: { total: true } }),
      this.prisma.llanta.aggregate({ where: { fechaCompra: { gte: hace12m } }, _sum: { precio: true } }),
      this.prisma.gasto.aggregate({ where: { estado: 'REGISTRADO', fecha: { gte: hace12m } }, _sum: { monto: true } }),
    ]);
    const mantPorKm = kmHist >= 5000 ? r2((N(ot._sum.total) + N(llantas._sum.precio)) / kmHist) : await this.parametros.numero('viajes.costo_mantenimiento_km');
    lineas.push({ concepto: 'Mantenimiento y llantas', monto: r2(mantPorKm * km), fuente: kmHist >= 5000 ? 'real' : 'parametro', detalle: `${km} km × Q${mantPorKm.toFixed(2)}/km ${kmHist >= 5000 ? `(taller + llantas de 12 meses ÷ ${r2(kmHist)} km)` : '(parámetro, aún sin historial suficiente)'}` });
    const fijoPorKm = kmHist >= 5000 ? r2(N(gastos._sum.monto) / kmHist) : await this.parametros.numero('viajes.costo_fijo_km');
    lineas.push({ concepto: 'Gastos fijos de operación', monto: r2(fijoPorKm * km), fuente: kmHist >= 5000 ? 'real' : 'parametro', detalle: `${km} km × Q${fijoPorKm.toFixed(2)}/km ${kmHist >= 5000 ? '(gastos de operación de 12 meses ÷ km recorridos)' : '(parámetro, aún sin historial suficiente)'}` });

    const costo = r2(lineas.reduce((a, l) => a + l.monto, 0));
    const margen = d.margen ?? (await this.parametros.numero('viajes.margen_objetivo'));
    const precioSugerido = r2(costo / (1 - Math.min(margen, 95) / 100));

    // Tarifa vigente del cliente (si la hay) para comparar
    let tarifa: { id: number; descripcion: string | null; tipo: string; monto: number; cobro: number; utilidad: number; margen: number } | null = null;
    if (d.clienteId) {
      const hoy = new Date(`${hoyGuatemala()}T00:00:00Z`);
      const t = await this.prisma.tarifa.findFirst({ where: { clienteId: d.clienteId, activo: true, OR: [{ rutaId: d.rutaId ?? -1 }, { rutaId: null }], vigenteDesde: { lte: hoy }, AND: [{ OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: hoy } }] }] }, orderBy: [{ rutaId: { sort: 'desc', nulls: 'last' } }, { vigenteDesde: 'desc' }] });
      if (t) { const cobro = montoPorTarifa({ tipo: t.tipo, monto: N(t.monto) }, kmCarga, N(d.toneladas)); tarifa = { id: t.id, descripcion: t.descripcion, tipo: t.tipo, monto: N(t.monto), cobro, utilidad: r2(cobro - costo), margen: cobro > 0 ? r2(((cobro - costo) / cobro) * 100) : 0 }; }
    }

    // Historial de la misma ruta (lo que realmente costó)
    let historial: { viajes: number; ingresoPromedio: number; costoPromedio: number; kmPromedio: number; margenPromedio: number } | null = null;
    if (d.rutaId) {
      const h = await this.prisma.viaje.findMany({ where: { rutaId: d.rutaId, estado: { in: ['FINALIZADO', 'LIQUIDADO'] }, fechaSalida: { gte: hace12m } }, select: { montoCobrado: true, totalCostos: true, pagoPiloto: true, kmSalida: true, kmLlegada: true } });
      if (h.length) {
        const ing = h.reduce((a, v) => a + N(v.montoCobrado), 0) / h.length; const cos = h.reduce((a, v) => a + N(v.totalCostos) + N(v.pagoPiloto), 0) / h.length;
        historial = { viajes: h.length, ingresoPromedio: r2(ing), costoPromedio: r2(cos), kmPromedio: r2(h.reduce((a, v) => a + Math.max(0, N(v.kmLlegada) - N(v.kmSalida)), 0) / h.length), margenPromedio: ing > 0 ? r2(((ing - cos) / ing) * 100) : 0 };
      }
    }

    return { data: {
      ruta: ruta ? { id: ruta.id, nombre: ruta.nombre, origen: ruta.origen, destino: ruta.destino } : null,
      km, kmCarga, kmVacios, horas: r2(horas), dias, galones, rendimiento, precioGalon,
      lineas, costo, costoPorKm: r2(costo / km), margenObjetivo: margen, precioSugerido, precioPorKm: r2(precioSugerido / kmCarga),
      tarifa, historial,
    } };
  }
}
