import { liquidar, montoPorTarifa, siguienteNumero } from './viajes.logica';

describe('viajes.logica', () => {
  it('numera correlativo con prefijo', () => {
    expect(siguienteNumero('V-', null)).toBe('V-000001');
    expect(siguienteNumero('V-', 'V-000123')).toBe('V-000124');
    expect(siguienteNumero('OT-', 'basura')).toBe('OT-000001');
  });
  it('calcula el monto según la tarifa', () => {
    expect(montoPorTarifa({ tipo: 'POR_VIAJE', monto: 4500 }, 300, 20)).toBe(4500);
    expect(montoPorTarifa({ tipo: 'POR_KM', monto: 12.5 }, 300, 20)).toBe(3750);
    expect(montoPorTarifa({ tipo: 'POR_TONELADA', monto: 180 }, 300, 20)).toBe(3600);
  });
  it('liquida: utilidad, saldo del piloto y costo por km', () => {
    const l = liquidar({ montoCobrado: 6000, pagoPiloto: 500, anticipoPiloto: 800, kmSalida: 1000, kmLlegada: 1400, kmVacios: 100 }, [
      { tipo: 'COMBUSTIBLE', monto: 1800, pagadoPorPiloto: false },
      { tipo: 'PEAJE', monto: 120, pagadoPorPiloto: true },
      { tipo: 'VIATICO', monto: 300, pagadoPorPiloto: true },
    ]);
    expect(l.costos).toBe(2220);
    expect(l.utilidad).toBe(3280);
    expect(l.margen).toBe(54.67);
    expect(l.rendidoPiloto).toBe(420);
    expect(l.saldoPiloto).toBe(120); // 500 + 420 − 800
    expect(l.km).toBe(400);
    expect(l.porcentajeVacios).toBe(25);
    expect(l.costoPorKm).toBe(6.8);
  });
});
