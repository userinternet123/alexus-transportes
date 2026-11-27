import { D } from '../../common/money';
import { agrupar, costoIncidente, crearIncidenteZ, estadoMulta, repartirDescuentos } from './incidentes.logica';

const base = { montoMulta: 0, montoPagado: 0, pagadoEn: null, costoDanos: 0, costoTerceros: 0, montoRecuperado: 0, descuentoPiloto: 0 };
const dia = (s: string) => new Date(`${s}T12:00:00Z`);

describe('incidentes: costo', () => {
  it('multa sin pagar cuenta por lo que dice la boleta; pagada, por lo pagado', () => {
    expect(costoIncidente({ ...base, montoMulta: 500 }).costo.toString()).toBe('500');
    expect(costoIncidente({ ...base, montoMulta: 500, montoPagado: 375, pagadoEn: dia('2026-11-10') }).costo.toString()).toBe('375');
  });
  it('neto = daños + terceros − seguro − descuento al piloto', () => {
    const c = costoIncidente({ ...base, costoDanos: 12000, costoTerceros: 3000, montoRecuperado: 9000, descuentoPiloto: 1500 });
    expect(c.costo.toString()).toBe('15000');
    expect(c.recuperado.toString()).toBe('10500');
    expect(c.neto.toString()).toBe('4500');
  });
});

describe('incidentes: estado de la multa', () => {
  const hoy = dia('2026-11-25');
  it('sin multa no aplica', () => expect(estadoMulta({ montoMulta: 0, pagadoEn: null, fechaLimitePago: null }, hoy, 7)).toBeNull());
  it('vencida, por vencer y pendiente', () => {
    expect(estadoMulta({ montoMulta: 300, pagadoEn: null, fechaLimitePago: dia('2026-11-20') }, hoy, 7)).toEqual({ estado: 'VENCIDA', dias: -5 });
    expect(estadoMulta({ montoMulta: 300, pagadoEn: null, fechaLimitePago: dia('2026-11-30') }, hoy, 7)).toEqual({ estado: 'POR_VENCER', dias: 5 });
    expect(estadoMulta({ montoMulta: 300, pagadoEn: null, fechaLimitePago: dia('2026-12-30') }, hoy, 7)?.estado).toBe('PENDIENTE');
    expect(estadoMulta({ montoMulta: 300, pagadoEn: dia('2026-11-01'), fechaLimitePago: dia('2026-11-20') }, hoy, 7)?.estado).toBe('PAGADA');
  });
});

describe('incidentes: descuento al piloto por planilla', () => {
  it('reparte en cuotas y respeta el tope', () => {
    const r = repartirDescuentos([
      { incidenteId: 2, descuento: 600, cuotas: 3, descontado: 0, reservado: 0 },
      { incidenteId: 1, descuento: 300, cuotas: 1, descontado: 0, reservado: 0 },
    ], 450);
    expect(r.map((x) => [x.incidenteId, x.monto.toString()])).toEqual([[1, '300'], [2, '150']]);
  });
  it('no descuenta más de lo pendiente (lo ya descontado y lo reservado en otra planilla)', () => {
    const r = repartirDescuentos([{ incidenteId: 1, descuento: 1000, cuotas: 2, descontado: 500, reservado: 300 }], 5000);
    expect(r[0].monto.toString()).toBe('200');
    expect(repartirDescuentos([{ incidenteId: 1, descuento: 1000, cuotas: 2, descontado: 1000, reservado: 0 }], 5000)).toEqual([]);
  });
});

describe('incidentes: validación y resumen', () => {
  it('una multa exige monto', () => {
    expect(crearIncidenteZ.safeParse({ tipo: 'MULTA', fecha: '2026-11-20', descripcion: 'Exceso de velocidad' }).success).toBe(false);
    expect(crearIncidenteZ.safeParse({ tipo: 'MULTA', fecha: '2026-11-20', descripcion: 'Exceso de velocidad', montoMulta: '500' }).success).toBe(true);
  });
  it('agrupa por piloto ordenando por costo neto', () => {
    const g = agrupar([
      { ...base, tipo: 'MULTA', montoMulta: 500, p: 'A' },
      { ...base, tipo: 'ACCIDENTE', costoDanos: 8000, p: 'B' },
      { ...base, tipo: 'MULTA', montoMulta: 250, p: 'A' },
    ], (f) => f.p);
    expect(g[0]).toMatchObject({ clave: 'B', accidentes: 1 });
    expect(g[1]).toMatchObject({ clave: 'A', incidentes: 2, multas: 2 });
    expect(D(g[1].neto).toString()).toBe('750');
  });
});
