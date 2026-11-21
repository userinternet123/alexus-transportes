import { validar } from '../../common/pipes/zod';
import { crearOrdenZ, duracionPorMarca, estadoOrdenZ, estadoPlan, totales, TRANSICIONES } from './taller.logica';

const f = (s: string) => new Date(`${s}T12:00:00.000Z`);
const n = (x: { toString(): string } | null) => (x == null ? null : Number(x.toString()));

describe('órdenes de trabajo', () => {
  it('total = mano de obra + repuestos', () => {
    const t = totales(850, [{ total: 1200 }, { total: 345.5 }]);
    expect([n(t.totalRepuestos), n(t.total)]).toEqual([1545.5, 2395.5]);
  });
  it('cabezal o remolque (uno), y un servicio ya hecho necesita su fecha', () => {
    expect(() => validar(crearOrdenZ, { tipo: 'CORRECTIVO', descripcion: 'Fuga de aire' })).toThrow();
    expect(() => validar(crearOrdenZ, { cabezalId: 1, remolqueId: 2, tipo: 'CORRECTIVO', descripcion: 'Fuga de aire' })).toThrow();
    expect(() => validar(crearOrdenZ, { cabezalId: 1, tipo: 'PREVENTIVO', descripcion: 'Cambio de aceite', yaRealizado: true })).toThrow();
    expect(validar(crearOrdenZ, { cabezalId: 1, tipo: 'PREVENTIVO', descripcion: 'Cambio de aceite', yaRealizado: true, fecha: '2026-10-01', odometro: '300,000' }).odometro).toBe(300000);
  });
  it('cerrar o anular pide qué se hizo; las cerradas no cambian', () => {
    expect(() => validar(estadoOrdenZ, { estado: 'CERRADA' })).toThrow();
    expect(validar(estadoOrdenZ, { estado: 'EN_PROCESO' }).estado).toBe('EN_PROCESO');
    expect(TRANSICIONES.CERRADA).toEqual([]);
    expect(TRANSICIONES.ABIERTA).toContain('CERRADA');
  });
});

describe('alertas de mantenimiento (km o días, lo que ocurra primero)', () => {
  const aceite = { cadaKm: 15_000, cadaDias: 120, avisoKm: 1_000, avisoDias: 15 };
  const hoy = f('2026-11-21');
  it('al día, próximo por km, vencido por días', () => {
    expect(estadoPlan(aceite, { fecha: f('2026-10-01'), odometro: 300_000 }, { hoy, odometro: 305_000 }).estado).toBe('AL_DIA');
    const p = estadoPlan(aceite, { fecha: f('2026-10-01'), odometro: 300_000 }, { hoy, odometro: 314_200 });
    expect([p.estado, n(p.faltaKm), n(p.proximoKm)]).toEqual(['PROXIMO', 800, 315_000]);
    const v = estadoPlan(aceite, { fecha: f('2026-07-01'), odometro: 300_000 }, { hoy, odometro: 302_000 });
    expect([v.estado, v.faltaDias, v.proximaFecha]).toEqual(['VENCIDO', -23, '2026-10-29']);
  });
  it('remolques: km de sus viajes; sin servicio registrado: sin historial', () => {
    expect(estadoPlan({ cadaKm: 50_000, cadaDias: null, avisoKm: 2_000, avisoDias: 0 }, { fecha: f('2026-01-01'), odometro: null }, { hoy, kmDesde: 51_000 }).estado).toBe('VENCIDO');
    expect(estadoPlan(aceite, null, { hoy, odometro: 1 }).estado).toBe('SIN_HISTORIAL');
  });
});

describe('duración de repuestos por marca', () => {
  const uso = (unidad: string, marca: string, odometro: number, costo: number, dia: string) => ({ unidad, repuestoId: 7, repuesto: 'Filtro de aceite', categoria: 'FILTROS', marca, odometro, fecha: f(dia), costoUnitario: costo, cantidad: 1 });
  it('km entre cambios del mismo repuesto en la misma unidad, atribuidos a la marca que se puso', () => {
    const r = duracionPorMarca([
      uso('C1', 'Fleetguard', 100_000, 300, '2026-01-01'), uso('C1', 'Baldwin', 118_000, 240, '2026-03-01'), uso('C1', 'Fleetguard', 130_000, 300, '2026-05-01'),
      uso('C2', 'Fleetguard', 50_000, 300, '2026-02-01'), uso('C2', 'Fleetguard', 70_000, 300, '2026-06-01'),
    ]);
    const fg = r.find((x) => x.marca === 'Fleetguard')!;
    const bw = r.find((x) => x.marca === 'Baldwin')!;
    // Fleetguard: 18,000 (C1) y 20,000 (C2) → 19,000 km; Baldwin: 12,000 km
    expect([fg.veces, n(fg.kmPromedio), n(fg.costoKm)]).toEqual([4, 19_000, 0.0158]);
    expect([bw.veces, n(bw.kmPromedio), n(bw.costoKm)]).toEqual([1, 12_000, 0.02]);
    expect(r[0].marca).toBe('Fleetguard'); // menor costo por km primero
  });
});
