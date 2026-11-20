/**
 * COSTO INDIRECTO POR KILÓMETRO: lo que cuesta tener la flota andando, aparte de los costos directos de cada viaje.
 *
 *   costo/km indirecto = (taller + llantas + sueldos + gastos de operación + combustible sin viaje) ÷ km recorridos
 *
 * Se calcula sobre un período móvil (por defecto 90 días) con lo que ya está registrado. Sirve para dos cosas:
 *  - prorratear en la liquidación de cada viaje (ganancia real = cobrado − directos − pago al piloto − km × costo/km);
 *  - cotizar viajes nuevos.
 * Con menos de `cotizador.km_minimos` en el período el historial no es confiable: se usa el parámetro
 * `cotizador.costo_km_indirecto` y se avisa.
 */
import { Injectable } from '@nestjs/common';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, Decimal, r2, suma } from '../../common/money';
import { sumarDias } from '../../common/fecha';

export interface CostoKm {
  desde: string;
  hasta: string;
  km: Decimal;
  partidas: { concepto: string; monto: Decimal }[];
  total: Decimal;
  costoKm: Decimal;
  fuente: 'HISTORIAL' | 'PARAMETRO';
  avisos: string[];
}

@Injectable()
export class CostoKmService {
  constructor(private readonly prisma: PrismaService, private readonly parametros: ParametrosService) {}

  async calcular(hasta: Date = new Date()): Promise<CostoKm> {
    const dias = await this.parametros.numero('cotizador.dias_historial');
    const kmMinimos = await this.parametros.numero('cotizador.km_minimos');
    const fin = new Date(hasta);
    const inicio = sumarDias(fin, -dias);
    const rango = { gte: inicio, lte: fin };

    const [viajes, ordenes, llantas, gastos, planillas, cargasSueltas] = await Promise.all([
      this.prisma.viaje.findMany({ where: { estado: { in: ['FINALIZADO', 'LIQUIDADO'] }, fechaLlegada: rango }, select: { kmSalida: true, kmLlegada: true } }),
      this.prisma.ordenTrabajo.aggregate({ where: { estado: 'CERRADA', fechaCierre: rango }, _sum: { total: true } }),
      this.prisma.llanta.aggregate({ where: { fechaCompra: rango }, _sum: { precio: true } }),
      this.prisma.gasto.aggregate({ where: { estado: 'REGISTRADO', viajeId: null, fecha: rango }, _sum: { monto: true } }),
      this.prisma.planilla.findMany({ where: { estado: { in: ['APROBADA', 'PAGADA'] }, fechaInicio: rango }, select: { totalDevengado: true, totalPatronal: true, detalles: { select: { comisiones: true } } } }),
      this.prisma.cargaCombustible.aggregate({ where: { anulada: false, viajeId: null, fecha: rango }, _sum: { total: true } }),
    ]);

    const km = suma(viajes.map((v) => (v.kmLlegada && v.kmSalida ? D(v.kmLlegada).minus(D(v.kmSalida)) : 0)));
    // El pago por viaje de los pilotos ya es costo directo de cada viaje: se resta de la planilla para no contarlo dos veces
    const sueldos = suma(planillas.map((p) => D(p.totalDevengado).plus(D(p.totalPatronal)).minus(suma(p.detalles.map((x) => x.comisiones)))));
    const partidas = [
      { concepto: 'Taller y repuestos', monto: r2(ordenes._sum.total) },
      { concepto: 'Llantas compradas', monto: r2(llantas._sum.precio) },
      { concepto: 'Sueldos y prestaciones', monto: r2(sueldos) },
      { concepto: 'Gastos de operación', monto: r2(gastos._sum.monto) },
      { concepto: 'Combustible fuera de viajes', monto: r2(cargasSueltas._sum.total) },
    ];
    const total = r2(suma(partidas.map((p) => p.monto)));
    const avisos: string[] = [];
    let costoKm: Decimal;
    let fuente: CostoKm['fuente'];
    if (km.gte(kmMinimos)) {
      costoKm = total.div(km).toDecimalPlaces(4);
      fuente = 'HISTORIAL';
      if (planillas.length === 0) avisos.push('No hay planillas aprobadas en el período: el costo por km no incluye sueldos.');
    } else {
      costoKm = D(await this.parametros.numero('cotizador.costo_km_indirecto')).toDecimalPlaces(4);
      fuente = 'PARAMETRO';
      avisos.push(`Solo hay ${km.toFixed(0)} km de viajes en los últimos ${dias} días (se necesitan ${kmMinimos}). Se usa el costo indirecto del parámetro «cotizador.costo_km_indirecto» (Q${costoKm.toFixed(2)}/km).`);
      if (costoKm.isZero()) avisos.push('El parámetro está en cero: la ganancia y el precio sugerido no incluyen taller, llantas, sueldos ni gastos fijos. Configúrelo en Administración › Parámetros.');
    }
    return { desde: inicio.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10), km, partidas, total, costoKm, fuente, avisos };
  }

  /** Rendimiento real (km/gal) de los últimos 90 días: de un cabezal o de toda la flota. */
  async rendimientoReal(cabezalId?: number): Promise<Decimal | null> {
    const desde = sumarDias(new Date(), -90);
    const a = await this.prisma.cargaCombustible.aggregate({
      where: { anulada: false, rendimiento: { not: null }, fecha: { gte: desde }, ...(cabezalId ? { cabezalId } : {}) },
      _sum: { kmRecorridos: true, galonesTramo: true },
    });
    const km = D(a._sum.kmRecorridos);
    const gal = D(a._sum.galonesTramo);
    return gal.gt(0) ? km.div(gal).toDecimalPlaces(2) : null;
  }

  /**
   * Rendimiento histórico de una ruta (180 días): km de sus viajes ÷ galones cargados en esos viajes.
   * Ya incluye su terreno y su tráfico. Necesita al menos 3 viajes con cargas para ser confiable.
   */
  async rendimientoRuta(rutaId: number): Promise<{ rendimiento: Decimal; viajes: number } | null> {
    const viajes = await this.prisma.viaje.findMany({
      where: { rutaId, estado: { in: ['FINALIZADO', 'LIQUIDADO'] }, fechaLlegada: { gte: sumarDias(new Date(), -180) }, cargas: { some: { anulada: false } } },
      select: { kmSalida: true, kmLlegada: true, cargas: { where: { anulada: false }, select: { galones: true } } },
    });
    if (viajes.length < 3) return null;
    const km = suma(viajes.map((v) => D(v.kmLlegada).minus(D(v.kmSalida))));
    const gal = suma(viajes.flatMap((v) => v.cargas.map((c) => c.galones)));
    return gal.gt(0) && km.gt(0) ? { rendimiento: km.div(gal).toDecimalPlaces(2), viajes: viajes.length } : null;
  }

  /** Precio promedio pagado por galón en los últimos 15 días, o null si no hay cargas. */
  async precioGalonReciente(): Promise<Decimal | null> {
    const a = await this.prisma.cargaCombustible.aggregate({ where: { anulada: false, fecha: { gte: sumarDias(new Date(), -15) } }, _sum: { total: true, galones: true } });
    const gal = D(a._sum.galones);
    return gal.gt(0) ? D(a._sum.total).div(gal).toDecimalPlaces(2) : null;
  }
}
