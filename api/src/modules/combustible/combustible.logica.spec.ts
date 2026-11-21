import { bajoRendimiento, saltoMaximo, tramo, variacionPct } from './combustible.logica';

describe('rendimiento tanque lleno a tanque lleno', () => {
  it('la primera carga completa no tiene tramo', () => {
    expect(tramo([], { odometro: 1000, galones: 80, tanqueLleno: true })).toBeNull();
  });
  it('una carga parcial no cierra el tramo', () => {
    expect(tramo([{ odometro: 1000, galones: 80, tanqueLleno: true }], { odometro: 1300, galones: 30, tanqueLleno: false })).toBeNull();
  });
  it('suma las parciales intermedias', () => {
    const t = tramo([
      { odometro: 1000, galones: 80, tanqueLleno: true },
      { odometro: 1300, galones: 30, tanqueLleno: false },
      { odometro: 500, galones: 70, tanqueLleno: true },
    ], { odometro: 1550, galones: 70, tanqueLleno: true });
    expect(t?.km.toString()).toBe('550');
    expect(t?.galones.toString()).toBe('100');
    expect(t?.rendimiento.toString()).toBe('5.5');
  });
});

describe('alertas', () => {
  it('avisa si cae más del 15 %', () => {
    expect(bajoRendimiento(4.6, 5.5, 15)).toBe(true); // límite 4.675
    expect(bajoRendimiento(4.7, 5.5, 15)).toBe(false);
    expect(bajoRendimiento(3, 0, 15)).toBe(false); // sin esperado no hay alerta
    expect(variacionPct(4.95, 5.5)?.toString()).toBe('-10');
  });
  it('estima el salto máximo de odómetro por tanque', () => {
    expect(saltoMaximo(150, 5.5)?.toString()).toBe('1238');
    expect(saltoMaximo(null, 5.5)).toBeNull();
  });
});
