import { validar } from '../../common/pipes/zod';
import {
  abonoZ, antiguedad, crearCuentaZ, diasDeCobro, diasVencida, documentoDe, estadoPorSaldo, estadoPromesa, gestionZ, mensajeRecordatorio, parsearTramos,
  saldoDe, telefonoWhatsapp, tramoDe, tramos, vencimiento,
} from './cobros.logica';

const f = (s: string) => new Date(`${s}T00:00:00.000Z`);
const n = (x: { toString(): string } | null) => Number(x?.toString());

describe('plazos y vencimiento', () => {
  it('vence a los días de crédito de la fecha de emisión', () => {
    expect(vencimiento(f('2026-10-01'), 30).toISOString().slice(0, 10)).toBe('2026-10-31');
    expect(vencimiento(f('2026-10-01'), 90).toISOString().slice(0, 10)).toBe('2026-12-30');
  });
  it('días vencida por día calendario (negativo = faltan)', () => {
    expect(diasVencida(f('2026-11-20'), f('2026-11-21'))).toBe(1);
    expect(diasVencida(f('2026-11-21'), f('2026-11-21'))).toBe(0);
    expect(diasVencida(f('2026-11-26'), new Date('2026-11-21T23:30:00Z'))).toBe(-5);
  });
});

describe('antigüedad de saldos', () => {
  it('tramos configurables', () => {
    expect(parsearTramos('90, 30,60 30')).toEqual([30, 60, 90]);
    expect(parsearTramos('basura')).toEqual([30, 60, 90]);
    const t = tramos([30, 60, 90]);
    expect(t.map((x) => x.nombre)).toEqual(['Al día', '1 a 30 días', '31 a 60 días', '61 a 90 días', 'Más de 90 días']);
    expect([-3, 0, 1, 30, 31, 90, 91, 400].map((d) => tramoDe(d, t).nombre)).toEqual(['Al día', 'Al día', '1 a 30 días', '1 a 30 días', '31 a 60 días', '61 a 90 días', 'Más de 90 días', 'Más de 90 días']);
    expect(tramos([15, 45]).map((x) => x.nombre)).toEqual(['Al día', '1 a 15 días', '16 a 45 días', 'Más de 45 días']);
  });
  it('agrupa por cliente y tramo, ignora lo pagado y ordena por lo vencido', () => {
    const hoy = f('2026-11-21');
    const a = antiguedad([
      { id: 1, clienteId: 1, cliente: 'A', monto: 1000, saldo: 1000, fechaVencimiento: f('2026-11-30'), fechaEmision: f('2026-10-31') }, // al día
      { id: 2, clienteId: 1, cliente: 'A', monto: 2000, saldo: 500, fechaVencimiento: f('2026-11-01'), fechaEmision: f('2026-10-02') }, // 20 días
      { id: 3, clienteId: 2, cliente: 'B', monto: 5000, saldo: 5000, fechaVencimiento: f('2026-07-01'), fechaEmision: f('2026-06-01') }, // 143 días
      { id: 4, clienteId: 2, cliente: 'B', monto: 900, saldo: 0, fechaVencimiento: f('2026-01-01'), fechaEmision: f('2025-12-01') }, // pagada
    ], hoy, [30, 60, 90]);
    expect(a.clientes.map((c) => c.cliente)).toEqual(['B', 'A']);
    expect(n(a.total.saldo)).toBe(6500);
    expect(n(a.total.vencido)).toBe(5500);
    expect(n(a.total.tramos.AL_DIA)).toBe(1000);
    expect(n(a.total.tramos.D1_30)).toBe(500);
    expect(n(a.total.tramos.MAS_90)).toBe(5000);
    expect(a.clientes[0].diasMasVieja).toBe(143);
    expect(a.total.cuentas).toBe(3);
  });
  it('días de cobro = saldo ÷ ventas diarias', () => {
    expect(n(diasDeCobro(45_000, 90_000, 90))).toBe(45);
    expect(diasDeCobro(1000, 0, 90)).toBeNull();
  });
});

describe('saldo, abonos y promesas', () => {
  it('saldo = monto − abonos vigentes; estado según saldo', () => {
    const s = saldoDe(10_000, [{ monto: 3000, anulado: false }, { monto: 1200, anulado: false }, { monto: 5000, anulado: true }]);
    expect(n(s)).toBe(5800);
    expect(estadoPorSaldo(10_000, s)).toBe('PARCIAL');
    expect(estadoPorSaldo(10_000, 10_000)).toBe('PENDIENTE');
    expect(estadoPorSaldo(10_000, 0)).toBe('PAGADA');
  });
  it('promesa: pendiente, cumplida con lo abonado desde que se hizo, incumplida si pasó la fecha', () => {
    const g = [{ tipo: 'PROMESA', promesaFecha: f('2026-11-25'), promesaMonto: 4000, creadoEn: new Date('2026-11-18T15:00:00Z') }];
    expect(estadoPromesa(g, [], 8000, f('2026-11-21'))?.estado).toBe('PENDIENTE');
    expect(estadoPromesa(g, [], 8000, f('2026-11-26'))?.estado).toBe('INCUMPLIDA');
    // El de antes de la promesa (aunque sea del mismo día) no cuenta
    const abonos = [{ monto: 1000, anulado: false, fecha: f('2026-11-18'), creadoEn: new Date('2026-11-18T09:00:00Z') }, { monto: 4000, anulado: false, fecha: f('2026-11-24'), creadoEn: new Date('2026-11-24T10:00:00Z') }];
    const p = estadoPromesa(g, abonos, 4000, f('2026-11-26'));
    expect([p?.estado, n(p!.abonado)]).toEqual(['CUMPLIDA', 4000]);
    expect(estadoPromesa(g, [{ ...abonos[1], anulado: true }], 8000, f('2026-11-26'))?.estado).toBe('INCUMPLIDA');
    expect(estadoPromesa([], [], 100, f('2026-11-26'))).toBeNull();
  });
});

describe('validaciones', () => {
  it('cuenta: viajes o monto', () => {
    expect(() => validar(crearCuentaZ, { clienteId: 1, fechaEmision: '2026-11-21' })).toThrow();
    expect(validar(crearCuentaZ, { clienteId: 1, viajeIds: [3, 4], fechaEmision: '2026-11-21', serie: '' }).serie).toBeNull();
    expect(validar(crearCuentaZ, { clienteId: 1, monto: '1,250.50', fechaEmision: '2026-11-21' }).monto).toBe(1250.5);
  });
  it('abono mayor que cero; promesa con fecha', () => {
    expect(() => validar(abonoZ, { fecha: '2026-11-21', monto: 0, medio: 'TRANSFERENCIA' })).toThrow();
    expect(validar(abonoZ, { fecha: '2026-11-21', monto: 150, medio: 'RETENCION_IVA', referencia: 'CR-55' }).medio).toBe('RETENCION_IVA');
    expect(() => validar(gestionZ, { tipo: 'PROMESA', nota: 'Paga el viernes' })).toThrow();
  });
});

describe('recordatorio al cliente', () => {
  it('texto amable con cada documento, cuándo vence y el total', () => {
    const t = mensajeRecordatorio({ empresa: 'Transportes Ejemplo, S.A.', contacto: 'Ana', hoy: f('2026-11-21'), cuentas: [
      { documento: 'Factura A-120', saldo: 3500, fechaVencimiento: f('2026-11-01') },
      { documento: 'Factura A-131', saldo: 1250.5, fechaVencimiento: f('2026-11-21') },
    ] });
    expect(t).toContain('Buen día, Ana.');
    expect(t).toContain('Le saludamos de Transportes Ejemplo, S.A. Le recordamos');
    expect(t).toContain('saldo pendiente');
    expect(t).toMatch(/Factura A-120: Q3,500\.00 \(venció el 1 de noviembre de 2026\)/);
    expect(t).toContain('Factura A-131: Q1,250.50 (vence hoy)');
    expect(t).toContain('Total: Q4,750.50.');
  });
  it('documento legible y teléfono para WhatsApp', () => {
    expect(documentoDe({ tipoDocumento: 'FACTURA', serie: 'A', numeroDocumento: '120', numero: 'CC-000001' })).toBe('Factura A-120');
    expect(documentoDe({ tipoDocumento: 'RECIBO', serie: null, numeroDocumento: null, numero: 'CC-000002' })).toBe('Recibo CC-000002');
    expect(telefonoWhatsapp('5555-1234')).toBe('50255551234');
    expect(telefonoWhatsapp('+502 5555 1234')).toBe('50255551234');
    expect(telefonoWhatsapp('123')).toBeNull();
  });
});
