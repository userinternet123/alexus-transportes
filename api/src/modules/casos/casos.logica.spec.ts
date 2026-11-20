import { masUrgente, puedePasar, semaforo } from './casos.logica';

describe('casos', () => {
  it('la prioridad de la orden es la más urgente', () => {
    expect(masUrgente(['BAJA', 'ALTA', 'MODERADA'])).toBe('ALTA');
    expect(masUrgente([])).toBe('MODERADA');
  });
  it('estados permitidos', () => {
    expect(puedePasar('ABIERTO', 'RESUELTO')).toBe(true);
    expect(puedePasar('RESUELTO', 'ABIERTO')).toBe(true);
    expect(puedePasar('ANULADO', 'ABIERTO')).toBe(false);
  });
  it('semáforo del plazo', () => {
    const creadoEn = new Date('2026-11-20T08:00:00Z');
    const venceEn = new Date('2026-11-20T12:00:00Z');
    expect(semaforo({ estado: 'ABIERTO', creadoEn, venceEn }, new Date('2026-11-20T09:00:00Z'))).toBe('A_TIEMPO');
    expect(semaforo({ estado: 'ABIERTO', creadoEn, venceEn }, new Date('2026-11-20T11:30:00Z'))).toBe('POR_VENCER');
    expect(semaforo({ estado: 'EN_PROCESO', creadoEn, venceEn }, new Date('2026-11-20T12:01:00Z'))).toBe('VENCIDO');
    expect(semaforo({ estado: 'RESUELTO', creadoEn, venceEn })).toBeNull();
  });
});
