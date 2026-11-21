import { D } from '../money';
import { acumuladaAl, cuotasAnuales, depreciar, errorRegla, parsearTabla, politica, Regla, reglaQueAplica, Unidad } from './depreciacion.logica';

const regla = (r: Partial<Regla> & { id: number }): Regla => ({
  nombre: `R${r.id}`, aplicaA: 'CABEZAL', marca: null, tipoRemolque: null, anioDesde: null, anioHasta: null, metodo: 'LINEA_RECTA',
  vidaUtilAnios: 10, vidaUtilKm: null, valorResidualPct: 0, tablaAnual: null, activo: true, ...r,
});
const cabezal = (u: Partial<Unidad> = {}): Unidad => ({
  tipo: 'CABEZAL', id: 1, codigo: 'C-01', placa: 'C123', marca: 'Freightliner', anio: 2018, costoCompra: 500_000, fechaCompra: new Date('2020-01-01'),
  metodoDepreciacion: null, vidaUtilAnios: null, vidaUtilKm: null, valorResidual: null, excluirDepreciacion: false, fechaBaja: null, ...u,
});
const n = (x: { toString(): string } | null) => Number(x?.toString());

describe('reglas de depreciación', () => {
  const reglas = [
    regla({ id: 1, nombre: 'Cabezales', vidaUtilAnios: 10, valorResidualPct: 25 }),
    regla({ id: 2, nombre: 'Freightliner', marca: 'freightliner ', vidaUtilAnios: 12, valorResidualPct: 30 }),
    regla({ id: 3, nombre: 'Usados hasta 2012', anioHasta: 2012, vidaUtilAnios: 5, valorResidualPct: 15 }),
    regla({ id: 4, nombre: 'Freightliner 2016-2020', marca: 'Freightliner', anioDesde: 2016, anioHasta: 2020, vidaUtilAnios: 11 }),
    regla({ id: 5, nombre: 'Remolques plataforma', aplicaA: 'REMOLQUE', tipoRemolque: 'PLATAFORMA', vidaUtilAnios: 15 }),
    regla({ id: 6, nombre: 'Inactiva', marca: 'Kenworth', activo: false }),
  ];
  it('gana la más específica: marca y año > marca > año > general', () => {
    expect(reglaQueAplica(cabezal(), reglas)?.nombre).toBe('Freightliner 2016-2020');
    expect(reglaQueAplica(cabezal({ anio: 2022 }), reglas)?.nombre).toBe('Freightliner');
    expect(reglaQueAplica(cabezal({ marca: 'Volvo', anio: 2010 }), reglas)?.nombre).toBe('Usados hasta 2012');
    expect(reglaQueAplica(cabezal({ marca: 'Kenworth', anio: 2019 }), reglas)?.nombre).toBe('Cabezales');
    expect(reglaQueAplica(cabezal({ anio: null, marca: 'Volvo' }), reglas)?.nombre).toBe('Cabezales');
  });
  it('las de remolque no aplican a cabezales y viceversa', () => {
    const r = { ...cabezal(), tipo: 'REMOLQUE' as const, marca: null, tipoRemolque: 'PLATAFORMA' };
    expect(reglaQueAplica(r, reglas)?.nombre).toBe('Remolques plataforma');
    expect(reglaQueAplica({ ...r, tipoRemolque: 'FURGON' }, reglas)).toBeNull();
  });
  it('valida lo que cada método necesita', () => {
    expect(errorRegla({ metodo: 'POR_KM' })).toMatch(/km/);
    expect(errorRegla({ metodo: 'TABLA', tablaAnual: '30,30' })).toMatch(/sumar 100/);
    expect(errorRegla({ metodo: 'TABLA', tablaAnual: '40, 30, 30' })).toBeNull();
    expect(errorRegla({ metodo: 'LINEA_RECTA', vidaUtilAnios: null })).toMatch(/años/);
    expect(errorRegla({ aplicaA: 'CABEZAL', tipoRemolque: 'FURGON', vidaUtilAnios: 5 })).toMatch(/remolques/);
    expect(errorRegla({ anioDesde: 2020, anioHasta: 2010, vidaUtilAnios: 5 })).toMatch(/mayor/);
    expect(parsearTabla('25;20 15,10,10,10,10')).toEqual([25, 20, 15, 10, 10, 10, 10]);
  });
  it('lo propio de la unidad manda sobre la regla, y sin nada usa la tasa fiscal', () => {
    const p = politica(cabezal({ vidaUtilAnios: 8, valorResidual: 100_000 }), reglas, 20);
    expect([p.vidaAnios, n(p.residual), n(p.residualPct), p.origen]).toEqual([8, 100_000, 20, 'UNIDAD']);
    const f = politica(cabezal({ marca: 'Volvo', anio: 2019 }), [], 20);
    expect([f.metodo, f.vidaAnios, n(f.residual), f.origen]).toEqual(['LINEA_RECTA', 5, 0, 'FISCAL']);
    expect(f.avisos[0]).toMatch(/20 % anual/);
  });
});

describe('métodos', () => {
  it('línea recta: igual cada año y cierra en el residual', () => {
    const c = cuotasAnuales(500_000, 125_000, { metodo: 'LINEA_RECTA', vidaAnios: 10, tabla: null });
    expect(c.map(n)).toEqual(Array(10).fill(37_500));
    expect(n(acumuladaAl(c, 2.5))).toBe(93_750);
    expect(n(acumuladaAl(c, 15))).toBe(375_000);
  });
  it('suma de dígitos: más al inicio', () => {
    const c = cuotasAnuales(150_000, 0, { metodo: 'SUMA_DIGITOS', vidaAnios: 5, tabla: null });
    expect(c.map(n)).toEqual([50_000, 40_000, 30_000, 20_000, 10_000]);
  });
  it('saldo decreciente: doble tasa, nunca bajo el residual, cierra exacto', () => {
    const c = cuotasAnuales(100_000, 10_000, { metodo: 'SALDO_DECRECIENTE', vidaAnios: 5, tabla: null });
    expect(n(c[0])).toBe(40_000);
    expect(n(c[1])).toBe(24_000);
    expect(c.reduce((a, b) => a.plus(b), D(0)).toNumber()).toBe(90_000);
    expect(c.every((x) => x.gte(0))).toBe(true);
  });
  it('tabla por año', () => {
    const c = cuotasAnuales(200_000, 0, { metodo: 'TABLA', vidaAnios: 3, tabla: [50, 30, 20] });
    expect(c.map(n)).toEqual([100_000, 60_000, 40_000]);
  });
  it('los centavos cierran exacto', () => {
    const c = cuotasAnuales(100_000, 0, { metodo: 'LINEA_RECTA', vidaAnios: 3, tabla: null });
    expect(c.map(n)).toEqual([33_333.33, 33_333.33, 33_333.34]);
  });
});

describe('depreciar una unidad', () => {
  const reglas = [regla({ id: 1, vidaUtilAnios: 10, valorResidualPct: 20 })];
  const fecha = new Date('2024-01-01');
  const desde = new Date('2023-10-03'); // 90 días
  it('acumulada, valor en libros, período y por km', () => {
    const u = cabezal();
    const d = depreciar(u, politica(u, reglas, 20), { fecha, desde, tasaFiscal: 20, kmPeriodo: 20_000 });
    // base 400,000 ÷ 10 = 40,000 por año; 4 años (con bisiestos ≈ 4.0) de uso
    expect(n(d.anualActual)).toBe(40_000);
    expect(n(d.acumulada)).toBeCloseTo(160_000, -2);
    expect(n(d.valorLibros)).toBeCloseTo(340_000, -2);
    expect(n(d.periodo)).toBeCloseTo(40_000 * 90 / 365.25, 0);
    expect(n(d.porKm)).toBeCloseTo(n(d.periodo) / 20_000, 3);
    expect(d.estado).toBe('DEPRECIANDO');
    expect(d.terminaEl).toBe('2030-01-01');
    // Fiscal: 20 % del costo por año, sin residual
    expect(n(d.fiscal.anual)).toBe(100_000);
    expect(n(d.fiscal.acumulada)).toBeCloseTo(400_000, -2);
    expect(d.calendario).toHaveLength(10);
    expect(n(d.calendario[9].valorLibros)).toBe(100_000);
  });
  it('por km: base ÷ km de vida, por cada km recorrido', () => {
    const u = cabezal({ metodoDepreciacion: 'POR_KM', vidaUtilKm: 1_000_000 });
    const d = depreciar(u, politica(u, reglas, 20), { fecha, desde, tasaFiscal: 20, kmUsados: 300_000, kmPeriodo: 25_000 });
    expect(n(d.porKm)).toBe(0.4);
    expect(n(d.acumulada)).toBe(120_000);
    expect(n(d.periodo)).toBe(10_000);
  });
  it('totalmente depreciada: ya no suma al período', () => {
    const u = cabezal({ fechaCompra: new Date('2010-01-01') });
    const d = depreciar(u, politica(u, reglas, 20), { fecha, desde, tasaFiscal: 20 });
    expect([d.estado, n(d.periodo), n(d.valorLibros)]).toEqual(['DEPRECIADA', 0, 100_000]);
  });
  it('dada de baja: se deprecia solo hasta la fecha de baja', () => {
    const u = cabezal({ fechaBaja: new Date('2023-11-01') });
    const d = depreciar(u, politica(u, reglas, 20), { fecha, desde, tasaFiscal: 20 });
    expect(d.estado).toBe('DE_BAJA');
    expect(n(d.periodo)).toBeCloseTo(40_000 * 29 / 365.25, 0);
  });
  it('excluida o sin datos: no entra en los costos', () => {
    const u = cabezal({ excluirDepreciacion: true });
    const d = depreciar(u, politica(u, reglas, 20), { fecha, desde, tasaFiscal: 20 });
    expect([d.estado, d.entraEnCostos, n(d.periodo)]).toEqual(['EXCLUIDA', false, 0]);
    expect(n(d.acumulada)).toBeGreaterThan(0); // el valor en libros sí se muestra
    const s = cabezal({ costoCompra: null });
    expect(depreciar(s, politica(s, reglas, 20), { fecha, desde, tasaFiscal: 20 }).estado).toBe('SIN_DATOS');
  });
});
