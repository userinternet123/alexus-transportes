/**
 * CARGAS LABORALES (Guatemala): IGSS patronal, IRTRA, INTECAP y prestaciones (aguinaldo, bono 14, indemnización).
 *
 * Cada concepto tiene dos decisiones independientes, en Administración › Parámetros:
 *  - «se paga hoy» (rrhh.paga_*): la planilla lo calcula y lo descuenta o provisiona. Si no se paga, queda en cero.
 *  - «incluir en costos» (costos.incluir_*): entra al costo por km, al cotizador y a la liquidación de viajes,
 *    aunque hoy no se pague (para cotizar con el costo real de tener a la gente en regla).
 * Las tasas son las de los parámetros rrhh.* y deben validarse con el contador.
 */
import { Global, Injectable, Module } from '@nestjs/common';
import { D, Decimal, Num, r2 } from '../money';
import { ParametrosService } from '../parametros/parametros.service';

export interface DefConcepto { clave: 'igss' | 'irtra' | 'intecap' | 'prestaciones'; nombre: string; tasas: string[]; paga: string; incluir: string }

export const CONCEPTOS: DefConcepto[] = [
  { clave: 'igss', nombre: 'IGSS patronal', tasas: ['rrhh.igss_patronal'], paga: 'rrhh.paga_igss', incluir: 'costos.incluir_igss' },
  { clave: 'irtra', nombre: 'IRTRA', tasas: ['rrhh.irtra'], paga: 'rrhh.paga_irtra', incluir: 'costos.incluir_irtra' },
  { clave: 'intecap', nombre: 'INTECAP', tasas: ['rrhh.intecap'], paga: 'rrhh.paga_intecap', incluir: 'costos.incluir_intecap' },
  { clave: 'prestaciones', nombre: 'Prestaciones (aguinaldo, bono 14, indemnización)', tasas: ['rrhh.provision_aguinaldo', 'rrhh.provision_bono14', 'rrhh.provision_indemnizacion'], paga: 'rrhh.provisiona_prestaciones', incluir: 'costos.incluir_prestaciones' },
];

export interface Concepto { clave: DefConcepto['clave']; nombre: string; tasa: Decimal; paga: boolean; incluida: boolean }

/** % total que se suma al costo sobre una base afecta (solo los conceptos incluidos). */
export const factorIncluido = (cs: Concepto[]) => cs.filter((c) => c.incluida).reduce((a, c) => a.plus(c.tasa), D(0));

/** Una partida por concepto incluido, calculada sobre la base afecta (sueldos sin bonificación incentivo). */
export function partidasCargas(cs: Concepto[], baseAfecta: Num) {
  return cs.filter((c) => c.incluida && c.tasa.gt(0)).map((c) => ({ concepto: c.nombre, monto: r2(D(baseAfecta).times(c.tasa).div(100)), pagadaHoy: c.paga }));
}

/** Avisos cuando lo que se paga y lo que se cuesta no coinciden. */
export function avisosCargas(cs: Concepto[]): string[] {
  const noPagadas = cs.filter((c) => c.incluida && !c.paga).map((c) => c.nombre);
  const fuera = cs.filter((c) => c.paga && !c.incluida).map((c) => c.nombre);
  return [
    ...(noPagadas.length ? [`Se incluye en el costo aunque hoy no se paga: ${noPagadas.join(', ')}.`] : []),
    ...(fuera.length ? [`Se paga pero NO está en el costo (la ganancia sale más alta que la real): ${fuera.join(', ')}.`] : []),
  ];
}

@Injectable()
export class CargasLaboralesService {
  constructor(private readonly parametros: ParametrosService) {}

  async conceptos(): Promise<Concepto[]> {
    return Promise.all(CONCEPTOS.map(async (c) => ({
      clave: c.clave, nombre: c.nombre,
      tasa: (await Promise.all(c.tasas.map((t) => this.parametros.numero(t)))).reduce((a, n) => a.plus(D(n)), D(0)),
      paga: await this.parametros.booleano(c.paga),
      incluida: await this.parametros.booleano(c.incluir),
    })));
  }
}

@Global()
@Module({ providers: [CargasLaboralesService], exports: [CargasLaboralesService] })
export class CargasLaboralesModule {}
