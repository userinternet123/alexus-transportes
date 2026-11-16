import { D, Decimal, Num, r2 } from '../../common/money';

/**
 * Cálculo de planilla (Guatemala) — función pura, parametrizada.
 * ⚠️ Las tasas vienen de ParametrosService y DEBEN validarse con el
 *    contador / asesor laboral antes de producción. El ISR se recibe como
 *    dato (proyección anual) — ver docs/03-modelo-de-dominio.md.
 */
export interface TasasPlanilla {
  igssLaboral: Num; // %
  igssPatronal: Num; // %
  irtra: Num; // %
  intecap: Num; // %
  factorHoraExtra: Num; // 1.5
  horasJornada: Num; // 8
  provisionAguinaldo: Num; // %
  provisionBono14: Num; // %
  provisionIndemnizacion: Num; // %
}

export interface EntradaPlanilla {
  salarioBaseMensual: Num;
  bonificacionIncentivoMensual: Num; // Decreto 37-2001 (no afecta IGSS)
  fraccionPeriodo: Num; // 1 = mensual, 0.5 = quincenal
  diasPeriodo: number; // 30 o 15 (mes comercial)
  diasLaborados: Num; // descontadas ausencias sin goce / faltas / suspensiones
  horasExtra: Num;
  porcentajeComision: Num;
  ventasNetasPeriodo: Num;
  otrosIngresos?: Num; // afectos
  isr?: Num;
  otrosDescuentos?: Num;
}

export interface LineaPlanilla {
  diasLaborados: Decimal;
  salarioDevengado: Decimal;
  horasExtraMonto: Decimal;
  comisiones: Decimal;
  bonificacionIncentivo: Decimal;
  otrosIngresos: Decimal;
  totalDevengado: Decimal;
  igssLaboral: Decimal;
  isr: Decimal;
  otrosDescuentos: Decimal;
  totalDescuentos: Decimal;
  liquido: Decimal;
  igssPatronal: Decimal;
  irtra: Decimal;
  intecap: Decimal;
  provisionAguinaldo: Decimal;
  provisionBono14: Decimal;
  provisionIndemnizacion: Decimal;
}

const pct = (base: Decimal, tasa: Num) => r2(base.times(D(tasa)).div(100));

export function calcularLineaPlanilla(e: EntradaPlanilla, t: TasasPlanilla): LineaPlanilla {
  const dias = Decimal.max(0, Decimal.min(D(e.diasLaborados), e.diasPeriodo));
  const proporcion = dias.div(e.diasPeriodo);

  const salarioDevengado = r2(D(e.salarioBaseMensual).times(D(e.fraccionPeriodo)).times(proporcion));
  const valorHora = D(e.salarioBaseMensual).div(30).div(D(t.horasJornada));
  const horasExtraMonto = r2(D(e.horasExtra).times(valorHora).times(D(t.factorHoraExtra)));
  const comisiones = r2(D(e.ventasNetasPeriodo).times(D(e.porcentajeComision)).div(100));
  const bonificacionIncentivo = r2(D(e.bonificacionIncentivoMensual).times(D(e.fraccionPeriodo)).times(proporcion));
  const otrosIngresos = r2(e.otrosIngresos ?? 0);

  // Base afecta a IGSS: todo lo devengado excepto la bonificación incentivo
  const baseAfecta = salarioDevengado.plus(horasExtraMonto).plus(comisiones).plus(otrosIngresos);
  const totalDevengado = baseAfecta.plus(bonificacionIncentivo);

  const igssLaboral = pct(baseAfecta, t.igssLaboral);
  const isr = r2(e.isr ?? 0);
  const otrosDescuentos = r2(e.otrosDescuentos ?? 0);
  const totalDescuentos = igssLaboral.plus(isr).plus(otrosDescuentos);

  return {
    diasLaborados: dias,
    salarioDevengado,
    horasExtraMonto,
    comisiones,
    bonificacionIncentivo,
    otrosIngresos,
    totalDevengado,
    igssLaboral,
    isr,
    otrosDescuentos,
    totalDescuentos,
    liquido: totalDevengado.minus(totalDescuentos),
    igssPatronal: pct(baseAfecta, t.igssPatronal),
    irtra: pct(baseAfecta, t.irtra),
    intecap: pct(baseAfecta, t.intecap),
    provisionAguinaldo: pct(baseAfecta, t.provisionAguinaldo),
    provisionBono14: pct(baseAfecta, t.provisionBono14),
    provisionIndemnizacion: pct(baseAfecta, t.provisionIndemnizacion),
  };
}

/** Días laborados en el período considerando ingreso/baja (mes comercial de 30 días). */
export function diasEnPeriodo(inicio: Date, fin: Date, diasPeriodo: number, fechaIngreso: Date, fechaBaja: Date | null): number {
  const desde = fechaIngreso > inicio ? fechaIngreso : inicio;
  const hasta = fechaBaja && fechaBaja < fin ? fechaBaja : fin;
  if (hasta < desde) return 0;
  const completo = desde.getTime() === inicio.getTime() && hasta.getTime() === fin.getTime();
  if (completo) return diasPeriodo;
  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1;
  return Math.min(dias, diasPeriodo);
}
