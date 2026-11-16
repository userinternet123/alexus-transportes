import { CHECKLIST, evaluar } from './inspecciones.logica';

describe('inspecciones.logica', () => {
  it('aprueba cuando todo pasa (ítems no enviados cuentan como OK)', () => {
    const r = evaluar([{ clave: 'ESPEJOS', ok: true }], false);
    expect(r.resultado).toBe('APROBADA');
    expect(r.filas.some((f) => f.clave === 'KINGPIN')).toBe(false); // sin remolque no aplica
  });
  it('deja salir con observaciones si falla algo no crítico', () => {
    expect(evaluar([{ clave: 'espejos', ok: false, observacion: 'roto el derecho' }], true).resultado).toBe('CON_OBSERVACIONES');
  });
  it('rechaza con una falla crítica', () => {
    const r = evaluar([{ clave: 'FRENO_SERVICIO', ok: false }, { clave: 'BOCINA', ok: false }], true);
    expect(r.resultado).toBe('RECHAZADA');
    expect(r.criticas.map((c) => c.clave)).toEqual(['FRENO_SERVICIO']);
    expect(r.fallas).toHaveLength(2);
  });
  it('el checklist no repite claves', () => {
    expect(new Set(CHECKLIST.map((i) => i.clave)).size).toBe(CHECKLIST.length);
  });
});
