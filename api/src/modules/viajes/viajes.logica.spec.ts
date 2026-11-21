import { cotizar, elegirTarifa, liquidar, montoPorTarifa, siguienteNumero, TRANSICIONES } from './viajes.logica';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('tarifas', () => {
  it('calcula el monto según el tipo', () => {
    expect(montoPorTarifa({ tipo: 'POR_VIAJE', monto: 6500 }, 110, 0).toString()).toBe('6500');
    expect(montoPorTarifa({ tipo: 'POR_KM', monto: 18.5 }, 110, 0).toString()).toBe('2035');
    expect(montoPorTarifa({ tipo: 'POR_TONELADA', monto: 210 }, 110, 22.5).toString()).toBe('4725');
  });
  it('prefiere la tarifa de la ruta y luego la general, solo vigentes', () => {
    const t = [
      { id: 1, rutaId: null, vigenteDesde: d('2026-01-01'), vigenteHasta: null, activo: true },
      { id: 2, rutaId: 7, vigenteDesde: d('2026-01-01'), vigenteHasta: d('2026-06-30'), activo: true },
      { id: 3, rutaId: 7, vigenteDesde: d('2026-07-01'), vigenteHasta: null, activo: true },
      { id: 4, rutaId: 7, vigenteDesde: d('2026-09-01'), vigenteHasta: null, activo: false },
    ];
    expect(elegirTarifa(t, 7, d('2026-03-10'))?.id).toBe(2);
    expect(elegirTarifa(t, 7, d('2026-10-10'))?.id).toBe(3);
    expect(elegirTarifa(t, 9, d('2026-10-10'))?.id).toBe(1);
    expect(elegirTarifa(t.slice(1), 9, d('2026-10-10'))).toBeNull();
  });
});

describe('liquidación', () => {
  const base = { montoCobrado: 6500, pagoPiloto: 300, kmRecorridos: 220, costoKmFijo: 4.5 };
  it('separa lo que pagó el piloto del anticipo y calcula la ganancia real', () => {
    const l = liquidar({ ...base, anticipos: [1000], costos: [
      { tipo: 'COMBUSTIBLE', monto: 1650, pagadoPorPiloto: false },
      { tipo: 'PEAJE', monto: 210.5, pagadoPorPiloto: true },
      { tipo: 'VIATICO', monto: 150, pagadoPorPiloto: true },
    ] });
    expect(l.costosDirectos.toString()).toBe('2010.5');
    expect(l.pagadoPorPiloto.toString()).toBe('360.5');
    expect(l.pagadoPorEmpresa.toString()).toBe('1650');
    expect(l.saldoPiloto.toString()).toBe('639.5'); // devuelve
    expect(l.prorrateo.toString()).toBe('990');
    expect(l.ganancia.toString()).toBe('3199.5'); // 6500 − 2010.50 − 300 − 990
    expect(l.margen?.toString()).toBe('49.2');
    expect(l.porTipo[0].tipo).toBe('COMBUSTIBLE');
  });
  it('suma las cargas laborales incluidas sobre el pago al piloto', () => {
    const l = liquidar({ ...base, factorCargas: 12.67, anticipos: [], costos: [] });
    expect(l.cargasPagoPiloto.toString()).toBe('38.01'); // 300 × 12.67 %
    expect(l.ganancia.toString()).toBe('5171.99'); // 6500 − 300 − 38.01 − 990
  });
  it('saldo negativo cuando el piloto gastó más del anticipo', () => {
    const l = liquidar({ ...base, anticipos: [200], costos: [{ tipo: 'PEAJE', monto: 350, pagadoPorPiloto: true }] });
    expect(l.saldoPiloto.toString()).toBe('-150');
  });
  it('sin cobro el margen es nulo y la ganancia negativa', () => {
    const l = liquidar({ ...base, montoCobrado: 0, anticipos: [], costos: [] });
    expect(l.margen).toBeNull();
    expect(l.ganancia.isNegative()).toBe(true);
  });
});

describe('cotizador', () => {
  const factores = {
    combustibleTerreno: { PLANO: 0, ONDULADO: 8, MONTANA: 20 }, desgasteTerreno: { PLANO: 0, ONDULADO: 5, MONTANA: 15 },
    combustibleTrafico: { FLUIDO: 0, NORMAL: 3, LENTO: 10, MUY_LENTO: 20 }, galonesPor100mSubida: 0.6, velocidadPromedio: 50, costoHoraEspera: 100,
  };
  const base = { kmIda: 110, regreso: 'VACIO' as const, terreno: 'PLANO' as const, trafico: 'FLUIDO' as const, horasEspera: 0, rendimiento: 5.5, precioGalon: 30, peajes: 60, viatico: 50, pagoPiloto: 300, costoKmIndirecto: 4, extras: [], margenObjetivo: 25, factores };

  it('ida y regreso vacío en plano: base sin recargos', () => {
    const c = cotizar({ ...base, tarifaActual: 3000 });
    expect(c.kmTotal.toString()).toBe('220');
    expect(c.kmVacios.toString()).toBe('110');
    expect(c.partidas[0].monto.toString()).toBe('1200'); // 220/5.5 = 40 gal × 30
    expect(c.costoTotal.toString()).toBe('2600'); // 1200 + 120 + 100 + 300 + 880
    expect(c.precioSugerido.toString()).toBe('3250');
    expect(c.margenTarifaActual?.toString()).toBe('13.3');
    expect(c.horasEstimadas.toString()).toBe('4'); // 220 km / 50 × 0.9
  });
  it('agrega las cargas laborales del pago al piloto si están incluidas', () => {
    const c = cotizar({ ...base, factorCargasPiloto: 12.67 });
    expect(c.partidas.find((p) => p.concepto === 'Cargas laborales del pago al piloto')?.monto.toString()).toBe('38.01');
    expect(c.costoTotal.toString()).toBe('2638.01');
    expect(cotizar({ ...base, factorCargasPiloto: 0 }).partidas.some((p) => p.concepto.startsWith('Cargas'))).toBe(false);
  });
  it('solo ida no cobra el regreso', () => {
    const c = cotizar({ ...base, regreso: 'NINGUNO' });
    expect(c.kmTotal.toString()).toBe('110');
    expect(c.partidas.find((p) => p.concepto === 'Peajes')?.monto.toString()).toBe('60');
  });
  it('montaña y tráfico lento encarecen combustible, desgaste y tiempo; las esperas y extras se suman', () => {
    const c = cotizar({ ...base, terreno: 'MONTANA', trafico: 'LENTO', horasEspera: 3, extras: [{ concepto: 'Escolta', monto: 400 }] });
    expect(c.partidas[0].monto.toString()).toBe('1560'); // 40 gal × 1.30 × 30
    expect(c.partidas.find((p) => p.concepto.startsWith('Taller'))?.monto.toString()).toBe('1012'); // 880 × 1.15
    expect(c.partidas.find((p) => p.concepto === 'Esperas y colas')?.monto.toString()).toBe('300');
    expect(c.partidas.find((p) => p.concepto === 'Escolta')?.monto.toString()).toBe('400');
    expect(c.horasEstimadas.toString()).toBe('8.9'); // 4.4 h × 1.35 + 3
  });
  it('con la subida medida no se suma el % de terreno al combustible', () => {
    const c = cotizar({ ...base, terreno: 'MONTANA', subidaMetros: 1500 });
    expect(c.galones.toString()).toBe('49'); // 40 + 1500/100 × 0.6 (solo la ida va cargada)
  });
  it('con el rendimiento histórico de la ruta no se agregan recargos de combustible', () => {
    const c = cotizar({ ...base, terreno: 'MONTANA', trafico: 'MUY_LENTO', rendimientoDeRuta: true });
    expect(c.galones.toString()).toBe('40');
  });
  it('redondea el precio hacia arriba a Q50', () => {
    const c = cotizar({ ...base, kmIda: 100, regreso: 'NINGUNO', rendimiento: 6, precioGalon: 31, peajes: 0, viatico: 0, pagoPiloto: 0, costoKmIndirecto: 0, margenObjetivo: 0 });
    expect(c.precioSugerido.toString()).toBe('516.67');
    expect(c.precioRedondeado.toString()).toBe('550');
  });
});

describe('estados y numeración', () => {
  it('solo se liquida un viaje finalizado', () => {
    expect(TRANSICIONES.liquidar).toEqual(['FINALIZADO']);
    expect(TRANSICIONES.cancelar).not.toContain('FINALIZADO');
  });
  it('genera el correlativo', () => {
    expect(siguienteNumero(null)).toBe('V-000001');
    expect(siguienteNumero('V-000041')).toBe('V-000042');
    expect(siguienteNumero('OT-000009', 'OT-')).toBe('OT-000010');
  });
});
