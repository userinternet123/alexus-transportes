import { calcularLineaPlanilla, diasEnPeriodo, TasasPlanilla } from './planilla.calculo';

const tasas: TasasPlanilla = {
  igssLaboral: 4.83, igssPatronal: 10.67, irtra: 1, intecap: 1, factorHoraExtra: 1.5, horasJornada: 8,
  provisionAguinaldo: 8.33, provisionBono14: 8.33, provisionIndemnizacion: 8.33,
};

describe('Planilla', () => {
  it('mes completo sin extras', () => {
    const l = calcularLineaPlanilla(
      { salarioBaseMensual: 4000, bonificacionIncentivoMensual: 250, fraccionPeriodo: 1, diasPeriodo: 30, diasLaborados: 30, horasExtra: 0, porcentajeComision: 0, ventasNetasPeriodo: 0 },
      tasas,
    );
    expect(l.salarioDevengado.toFixed(2)).toBe('4000.00');
    expect(l.igssLaboral.toFixed(2)).toBe('193.20'); // 4.83% de 4000 (bonificación exenta)
    expect(l.totalDevengado.toFixed(2)).toBe('4250.00');
    expect(l.liquido.toFixed(2)).toBe('4056.80');
    expect(l.igssPatronal.toFixed(2)).toBe('426.80');
  });

  it('horas extra y comisiones afectan IGSS', () => {
    const l = calcularLineaPlanilla(
      { salarioBaseMensual: 3600, bonificacionIncentivoMensual: 250, fraccionPeriodo: 1, diasPeriodo: 30, diasLaborados: 30, horasExtra: 10, porcentajeComision: 2, ventasNetasPeriodo: 50000 },
      tasas,
    );
    expect(l.horasExtraMonto.toFixed(2)).toBe('225.00'); // 3600/30/8 = 15 * 1.5 * 10
    expect(l.comisiones.toFixed(2)).toBe('1000.00');
  });

  it('ingreso a medio mes prorratea', () => {
    expect(diasEnPeriodo(new Date('2026-10-01'), new Date('2026-10-31'), 30, new Date('2026-10-16'), null)).toBe(16);
  });
});
