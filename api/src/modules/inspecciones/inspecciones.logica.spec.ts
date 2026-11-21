import { evaluar, faltantes, inspeccionZ, prioridadSugerida, PUNTOS, puntosPara, tipoDeCaso } from './inspecciones.logica';

const todos = (conRemolque: boolean, estado: 'OK' | 'FALLA' = 'OK') => puntosPara(conRemolque).map((p) => ({ codigo: p.codigo, estado }));

describe('inspección pre viaje', () => {
  it('aprueba si todo está bien', () => {
    expect(evaluar(todos(false))).toEqual({ resultado: 'APROBADA', fallas: 0, fallasCriticas: 0 });
  });
  it('una falla menor deja observaciones', () => {
    const r = todos(false).map((p) => (p.codigo === 'BOCINA' ? { ...p, estado: 'FALLA' as const } : p));
    expect(evaluar(r).resultado).toBe('CON_OBSERVACIONES');
  });
  it('una falla crítica rechaza', () => {
    const r = todos(true).map((p) => (p.codigo === 'REM_FRENOS' || p.codigo === 'ESPEJOS' ? { ...p, estado: 'FALLA' as const } : p));
    expect(evaluar(r)).toEqual({ resultado: 'RECHAZADA', fallas: 2, fallasCriticas: 1 });
  });
  it('exige contestar todos los puntos que aplican', () => {
    expect(faltantes(false, todos(false))).toEqual([]);
    expect(faltantes(true, todos(false)).length).toBe(PUNTOS.filter((p) => p.aplicaA === 'REMOLQUE').length);
  });
  it('una falla necesita descripción', () => {
    const r = inspeccionZ.safeParse({ cabezalId: 1, puntos: [{ codigo: 'FRENOS', estado: 'FALLA' }] });
    expect(r.success).toBe(false);
  });
  it('un hallazgo que impide salir rechaza; uno menor deja observaciones', () => {
    expect(evaluar(todos(false), [{ impideSalir: true }]).resultado).toBe('RECHAZADA');
    expect(evaluar(todos(false), [{ impideSalir: false }])).toEqual({ resultado: 'CON_OBSERVACIONES', fallas: 1, fallasCriticas: 0 });
  });
  it('clasifica la falla y sugiere la prioridad', () => {
    expect(tipoDeCaso('FRENOS')).toBe('MECANICO');
    expect(tipoDeCaso('REM_LLANTAS')).toBe('LLANTAS');
    expect(tipoDeCaso('EXTINTOR')).toBe('SEGURIDAD');
    expect(tipoDeCaso('DOCUMENTOS')).toBe('DOCUMENTOS');
    expect(prioridadSugerida('FRENOS')).toBe('URGENTE');
    expect(prioridadSugerida('BOCINA')).toBe('MODERADA');
  });
});
