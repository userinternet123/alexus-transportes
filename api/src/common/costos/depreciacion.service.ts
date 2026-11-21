/**
 * Depreciación de toda la flota a una fecha: lee reglas, cabezales, remolques y km recorridos, y aplica
 * `depreciacion.logica.ts`. La usa el costo por km (partida «Depreciación») y la pantalla Finanzas › Depreciación.
 */
import { Global, Injectable, Module } from '@nestjs/common';
import { ParametrosService } from '../parametros/parametros.service';
import { PrismaService } from '../prisma/prisma.service';
import { D, Decimal, r2, suma } from '../money';
import { sumarDias } from '../fecha';
import { Depreciacion, depreciar, politica, Unidad } from './depreciacion.logica';

export interface DepreciacionFlota {
  fecha: string;
  desde: string;
  incluidaEnCostos: boolean;
  tasaFiscal: number;
  unidades: Depreciacion[];
  totales: { costo: Decimal; acumulada: Decimal; valorLibros: Decimal; periodo: Decimal; anual: Decimal; fiscalAcumulada: Decimal; fiscalValorLibros: Decimal; kmPeriodo: Decimal };
  avisos: string[];
}

const KM = { kmSalida: true, kmLlegada: true } as const;
const kmViaje = (v: { kmSalida: unknown; kmLlegada: unknown }) => (v.kmSalida != null && v.kmLlegada != null ? D(v.kmLlegada as string).minus(D(v.kmSalida as string)) : D(0));

@Injectable()
export class DepreciacionService {
  constructor(private readonly prisma: PrismaService, private readonly parametros: ParametrosService) {}

  incluidaEnCostos() { return this.parametros.booleano('costos.incluir_depreciacion'); }

  /** Depreciación al día `hasta` y la del período [desde, hasta] (por defecto, los mismos días que el costo por km). */
  async calcular(o: { hasta?: Date; desde?: Date } = {}): Promise<DepreciacionFlota> {
    const fecha = o.hasta ?? new Date();
    const desde = o.desde ?? sumarDias(fecha, -(await this.parametros.numero('cotizador.dias_historial')));
    const tasaFiscal = await this.parametros.numero('depreciacion.tasa_fiscal');
    const terminados = { estado: { in: ['FINALIZADO' as const, 'LIQUIDADO' as const] } };
    const [reglas, cabezales, remolques, viajesPeriodo, viajesRemolque] = await Promise.all([
      this.prisma.reglaDepreciacion.findMany(),
      this.prisma.cabezal.findMany({ where: { OR: [{ activo: true }, { costoCompra: { not: null } }] }, orderBy: { codigo: 'asc' } }),
      this.prisma.remolque.findMany({ where: { OR: [{ activo: true }, { costoCompra: { not: null } }] }, orderBy: { codigo: 'asc' } }),
      this.prisma.viaje.findMany({ where: { ...terminados, fechaLlegada: { gte: desde, lte: fecha } }, select: { cabezalId: true, remolqueId: true, ...KM } }),
      // Los remolques no tienen odómetro: sus km de vida son los de sus viajes
      this.prisma.viaje.findMany({ where: { ...terminados, remolqueId: { not: null }, fechaLlegada: { lte: fecha } }, select: { remolqueId: true, fechaLlegada: true, ...KM } }),
    ]);
    const kmPor = (campo: 'cabezalId' | 'remolqueId', id: number) => suma(viajesPeriodo.filter((v) => v[campo] === id).map(kmViaje));

    const unidades: Depreciacion[] = [];
    for (const c of cabezales) {
      const u: Unidad = { ...c, tipo: 'CABEZAL', tipoRemolque: null };
      const kmUsados = c.kmCompra != null ? Decimal.max(D(0), D(c.odometro).minus(D(c.kmCompra))) : null;
      unidades.push(depreciar(u, politica(u, reglas, tasaFiscal), { fecha, desde, tasaFiscal, kmUsados, kmPeriodo: kmPor('cabezalId', c.id) }));
    }
    for (const r of remolques) {
      const u: Unidad = { ...r, tipo: 'REMOLQUE', tipoRemolque: r.tipo };
      const kmUsados = suma(viajesRemolque.filter((v) => v.remolqueId === r.id && (!r.fechaCompra || (v.fechaLlegada && v.fechaLlegada >= r.fechaCompra))).map(kmViaje));
      unidades.push(depreciar(u, politica(u, reglas, tasaFiscal), { fecha, desde, tasaFiscal, kmUsados, kmPeriodo: kmPor('remolqueId', r.id) }));
    }

    const conDatos = unidades.filter((x) => x.estado !== 'SIN_DATOS');
    const sinDatos = unidades.filter((x) => x.estado === 'SIN_DATOS');
    const avisos: string[] = [];
    if (sinDatos.length) avisos.push(`${sinDatos.length} unidad(es) sin costo o fecha de compra no se deprecian: ${sinDatos.map((x) => x.codigo).join(', ')}.`);
    const fiscales = conDatos.filter((x) => x.origen === 'FISCAL');
    if (fiscales.length) avisos.push(`${fiscales.length} unidad(es) sin regla usan la tasa fiscal (${tasaFiscal} % anual): ${fiscales.map((x) => x.codigo).join(', ')}. Cree una regla en Finanzas › Reglas de depreciación.`);
    const incluidaEnCostos = await this.incluidaEnCostos();
    return {
      fecha: fecha.toISOString().slice(0, 10), desde: desde.toISOString().slice(0, 10), incluidaEnCostos, tasaFiscal, unidades,
      totales: {
        costo: r2(suma(conDatos.map((x) => x.costo))),
        acumulada: r2(suma(conDatos.map((x) => x.acumulada))),
        valorLibros: r2(suma(conDatos.map((x) => x.valorLibros))),
        periodo: r2(suma(conDatos.map((x) => x.periodo))),
        anual: r2(suma(conDatos.filter((x) => x.entraEnCostos).map((x) => x.anualActual ?? 0))),
        fiscalAcumulada: r2(suma(conDatos.map((x) => x.fiscal.acumulada))),
        fiscalValorLibros: r2(suma(conDatos.map((x) => x.fiscal.valorLibros))),
        kmPeriodo: suma(conDatos.filter((x) => x.tipo === 'CABEZAL').map((x) => x.kmPeriodo)),
      },
      avisos,
    };
  }
}

@Global()
@Module({ providers: [DepreciacionService], exports: [DepreciacionService] })
export class DepreciacionModule {}
