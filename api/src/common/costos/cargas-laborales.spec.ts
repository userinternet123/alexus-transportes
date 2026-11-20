import { D } from '../money';
import { avisosCargas, Concepto, factorIncluido, partidasCargas } from './cargas-laborales';

const c = (clave: Concepto['clave'], tasa: number, paga: boolean, incluida: boolean): Concepto => ({ clave, nombre: clave.toUpperCase(), tasa: D(tasa), paga, incluida });

describe('cargas laborales', () => {
  const todas = [c('igss', 10.67, true, true), c('irtra', 1, true, true), c('intecap', 1, false, true), c('prestaciones', 24.99, false, false)];
  it('suma solo lo incluido en el costo', () => {
    expect(factorIncluido(todas).toString()).toBe('12.67');
  });
  it('calcula una partida por concepto incluido sobre la base afecta', () => {
    const p = partidasCargas(todas, 10000);
    expect(p.map((x) => [x.concepto, x.monto.toString(), x.pagadaHoy])).toEqual([['IGSS', '1067', true], ['IRTRA', '100', true], ['INTECAP', '100', false]]);
  });
  it('avisa lo que se cuesta sin pagarse y lo que se paga sin costearse', () => {
    expect(avisosCargas(todas)).toEqual(['Se incluye en el costo aunque hoy no se paga: INTECAP.']);
    expect(avisosCargas([c('igss', 10.67, true, false)])[0]).toMatch(/NO está en el costo/);
  });
});
