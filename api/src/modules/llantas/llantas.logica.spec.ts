import { kmMontajeCabezal, kmViajesRemolque, montarZ, posiciones, rendimientoPorMarca, vidaLlanta } from './llantas.logica';

const dia = (s: string) => new Date(`${s}T12:00:00Z`);
const U = { minimoMm: 3, avisoMm: 5, diasSinMedir: 30 };

describe('llantas: posiciones', () => {
  it('cabezal de 3 ejes: 2 direccionales + 8 duales + repuesto', () => {
    const p = posiciones(3, 'CABEZAL');
    expect(p).toHaveLength(11);
    expect(p.slice(0, 3)).toEqual(['E1-I', 'E1-D', 'E2-IE']);
  });
  it('remolque de 2 ejes: 8 duales + repuesto', () => expect(posiciones(2, 'REMOLQUE')).toHaveLength(9));
  it('valida la posición', () => {
    expect(montarZ.safeParse({ cabezalId: 1, posicion: 'e2-de', fecha: '2026-11-01' }).success).toBe(true);
    expect(montarZ.safeParse({ cabezalId: 1, posicion: 'E2-X', fecha: '2026-11-01' }).success).toBe(false);
  });
});

describe('llantas: km', () => {
  it('cabezal: del montaje al retiro o al odómetro', () => {
    expect(kmMontajeCabezal({ kmMontaje: 300000, kmRetiro: 345000 }, 999999).toString()).toBe('45000');
    expect(kmMontajeCabezal({ kmMontaje: 300000, kmRetiro: null }, 312500).toString()).toBe('12500');
  });
  it('remolque: suma los viajes dentro del montaje', () => {
    const v = [{ fechaSalida: dia('2026-10-01'), kmSalida: 1000, kmLlegada: 1400 }, { fechaSalida: dia('2026-11-05'), kmSalida: 2000, kmLlegada: 2300 }, { fechaSalida: dia('2026-09-01'), kmSalida: 0, kmLlegada: 900 }];
    expect(kmViajesRemolque(v, dia('2026-09-15'), null).toString()).toBe('700');
    expect(kmViajesRemolque(v, dia('2026-09-15'), dia('2026-10-15')).toString()).toBe('400');
  });
});

describe('llantas: vida y alertas', () => {
  const base = { precio: 3500, costoReencauches: 0, kmTotales: 40000, kmVidaActual: 40000, profundidadInicialMm: 18, kmEsperados: 80000, montada: true };
  it('costo por km, desgaste y km restantes', () => {
    const v = vidaLlanta({ ...base, ultimaMedicion: { profundidadMm: 10, fecha: dia('2026-11-20') } }, U, dia('2026-11-25'));
    expect(v.costoKm?.toString()).toBe('0.0875');
    expect(v.desgaste1000?.toString()).toBe('0.2'); // 8 mm en 40,000 km
    expect(v.kmRestantes?.toString()).toBe('35000'); // le quedan 7 mm
    expect(v.alerta).toBe('BIEN');
  });
  it('alertas por labrado, km y falta de medición', () => {
    expect(vidaLlanta({ ...base, ultimaMedicion: { profundidadMm: 3, fecha: dia('2026-11-20') } }, U, dia('2026-11-25')).alerta).toBe('CAMBIAR');
    expect(vidaLlanta({ ...base, ultimaMedicion: { profundidadMm: 4.5, fecha: dia('2026-11-20') } }, U, dia('2026-11-25')).alerta).toBe('PRONTO');
    expect(vidaLlanta({ ...base, kmVidaActual: 90000, ultimaMedicion: { profundidadMm: 8, fecha: dia('2026-11-20') } }, U, dia('2026-11-25')).alerta).toBe('KM_EXCEDIDO');
    expect(vidaLlanta({ ...base, ultimaMedicion: { profundidadMm: 9, fecha: dia('2026-09-01') } }, U, dia('2026-11-25')).alerta).toBe('SIN_MEDIR');
    expect(vidaLlanta({ ...base, montada: false, ultimaMedicion: null }, U, dia('2026-11-25')).alerta).toBe('BIEN');
  });
  it('el reencauche suma al costo', () => {
    expect(vidaLlanta({ ...base, costoReencauches: 1500, kmTotales: 100000, ultimaMedicion: null }, U, dia('2026-11-25')).costoKm?.toString()).toBe('0.05');
  });
});

describe('llantas: por marca', () => {
  it('ordena por costo por km y promedia la vida de las desechadas', () => {
    const r = rendimientoPorMarca([
      { marca: 'A', modelo: null, estado: 'DESECHADA', costo: 3000, kmTotales: 60000, desgaste1000: null, reencauches: 0 },
      { marca: 'A', modelo: null, estado: 'MONTADA', costo: 3000, kmTotales: 20000, desgaste1000: 0.2, reencauches: 0 },
      { marca: 'B', modelo: null, estado: 'DESECHADA', costo: 4000, kmTotales: 100000, desgaste1000: null, reencauches: 1 },
    ]);
    expect(r[0].marca).toBe('B');
    expect(r[0].costoKm?.toString()).toBe('0.04');
    expect(r[1]).toMatchObject({ marca: 'A', llantas: 2, terminadas: 1 });
    expect(r[1].kmPromedioVida?.toString()).toBe('60000');
    expect(r[1].costoKm?.toString()).toBe('0.075');
  });
});
