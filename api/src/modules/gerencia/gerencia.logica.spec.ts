import { D } from '../../common/money';
import { diasTraslape, estadoPresupuesto, presupuestoZ, prorrateoDocumento, repartir, scorePiloto, sugerido, tco } from './gerencia.logica';

const dia = (s: string) => new Date(`${s}T12:00:00Z`);

describe('gerencia: costo total por cabezal', () => {
  it('suma las partidas y calcula utilidad, margen y por km', () => {
    const t = tco({ ingresos: 100000, km: 20000, kmVacios: 3000, viajes: 10, diasConViaje: 20, diasPeriodo: 30, partidas: { combustible: 40000, piloto: 15000, taller: 5000, depreciacion: 10000, generales: 2000 } });
    expect(t.costoTotal.toString()).toBe('72000');
    expect(t.utilidad.toString()).toBe('28000');
    expect(t.margen?.toString()).toBe('28');
    expect(t.costoKm?.toString()).toBe('3.6');
    expect(t.ingresoKm?.toString()).toBe('5');
    expect(t.kmVaciosPct?.toString()).toBe('15');
    expect(t.utilizacion).toBe(67);
    expect(t.partidas.llantas.toString()).toBe('0');
  });
  it('sin km ni ingresos no divide entre cero', () => {
    const t = tco({ ingresos: 0, km: 0, kmVacios: 0, viajes: 0, diasConViaje: 0, diasPeriodo: 30, partidas: { depreciacion: 5000 } });
    expect(t.costoKm).toBeNull();
    expect(t.margen).toBeNull();
    expect(t.utilidad.toString()).toBe('-5000');
  });
  it('prorratea un seguro anual por los días del período', () => {
    expect(diasTraslape(dia('2026-11-01'), dia('2026-11-30'), dia('2026-11-15'), dia('2026-12-31'))).toBe(16);
    expect(prorrateoDocumento({ costo: 36500, emitido: dia('2026-01-01'), vence: dia('2026-12-31') }, dia('2026-11-01'), dia('2026-11-10')).toString()).toBe('1000');
    expect(prorrateoDocumento({ costo: null, emitido: null, vence: dia('2026-12-31') }, dia('2026-11-01'), dia('2026-11-10')).toString()).toBe('0');
  });
  it('reparte gastos generales por km', () => {
    const r = repartir(1000, new Map([[1, D(3000)], [2, D(1000)]]));
    expect(r.get(1)?.toString()).toBe('750');
    expect(r.get(2)?.toString()).toBe('250');
    expect(repartir(1000, new Map()).size).toBe(0);
  });
});

describe('gerencia: scorecard del piloto', () => {
  const base = { viajes: 10, conCompromiso: 10, aTiempo: 9, rendimientoReal: 8.5, rendimientoEsperado: 9, accidentes: 0, multas: 0, otrosIncidentes: 0, inspecciones: 10 };
  it('combina puntualidad, rendimiento, seguridad e inspecciones', () => {
    const s = scorePiloto(base);
    expect(s).toMatchObject({ puntualidad: 90, rendimiento: 94, seguridad: 100, inspecciones: 100, nivel: 'EXCELENTE' });
    expect(s.puntaje).toBe(96);
  });
  it('un accidente y una multa bajan la seguridad', () => {
    const s = scorePiloto({ ...base, accidentes: 1, multas: 1, inspecciones: 5 });
    expect(s.seguridad).toBe(50);
    expect(s.inspecciones).toBe(50);
    expect(s.nivel).toBe('BUENO');
  });
  it('sin dato de puntualidad reparte su peso entre lo demás; sin viajes no hay puntaje', () => {
    expect(scorePiloto({ ...base, conCompromiso: 0, aTiempo: 0 }).puntualidad).toBeNull();
    expect(scorePiloto({ ...base, conCompromiso: 0, aTiempo: 0 }).puntaje).toBe(98);
    expect(scorePiloto({ ...base, viajes: 0, conCompromiso: 0 }).nivel).toBe('SIN_DATOS');
  });
});

describe('gerencia: presupuesto de mantenimiento', () => {
  it('avisa al 90 % y al pasarse', () => {
    expect(estadoPresupuesto(null, 500).estado).toBe('SIN_PRESUPUESTO');
    expect(estadoPresupuesto(10000, 5000)).toEqual({ estado: 'BIEN', usado: 50 });
    expect(estadoPresupuesto(10000, 9200).estado).toBe('CERCA');
    expect(estadoPresupuesto(10000, 12000)).toEqual({ estado: 'EXCEDIDO', usado: 120 });
  });
  it('sugiere el promedio de los meses con gasto', () => {
    expect(sugerido([0, 8000, 12050, 0])?.toString()).toBe('10100');
    expect(sugerido([0, 0])).toBeNull();
  });
  it('valida el monto', () => {
    expect(presupuestoZ.safeParse({ anio: 2026, mes: 13, monto: 100 }).success).toBe(false);
    expect(presupuestoZ.parse({ anio: '2026', mes: '12', monto: 'Q 15,000' }).monto).toBe(15000);
  });
});
