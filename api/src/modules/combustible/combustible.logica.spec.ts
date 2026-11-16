import { rendimientos, resumenRendimiento } from './combustible.logica';

const f = (d: string) => new Date(d);
describe('combustible.logica', () => {
  it('calcula tanque lleno a tanque lleno sumando cargas parciales', () => {
    const r = rendimientos([
      { id: 1, cabezalId: 1, fecha: f('2026-11-01'), odometro: 10000, galones: 60, total: 1800, tanqueLleno: true },
      { id: 2, cabezalId: 1, fecha: f('2026-11-03'), odometro: 10250, galones: 20, total: 600, tanqueLleno: false },
      { id: 3, cabezalId: 1, fecha: f('2026-11-05'), odometro: 10480, galones: 40, total: 1200, tanqueLleno: true },
      { id: 4, cabezalId: 2, fecha: f('2026-11-05'), odometro: 500, galones: 50, total: 1500, tanqueLleno: true }, // sin anterior: no calcula
    ]);
    expect(r).toEqual([{ cargaId: 3, km: 480, galones: 60, kmPorGalon: 8, costoPorKm: 3.75 }]);
    expect(resumenRendimiento(r, 1800)).toEqual({ km: 480, galones: 60, kmPorGalon: 8, costoPorKm: 3.75 });
  });
  it('ignora tramos sin km', () => {
    expect(rendimientos([
      { id: 1, cabezalId: 1, fecha: f('2026-11-01'), odometro: 100, galones: 10, total: 300, tanqueLleno: true },
      { id: 2, cabezalId: 1, fecha: f('2026-11-01'), odometro: 100, galones: 10, total: 300, tanqueLleno: true },
    ])).toEqual([]);
  });
});
