/** Consultas de recuperación para las listas de útiles (SQL fijo y parametrizado; solo lectura). */
import { Consulta } from '../agente/agente.consultas';

/** Mismo criterio que normalizarTexto() de lista.logica: sin tildes ni signos, minúsculas. */
const NORM = (e: string) => `regexp_replace(translate(lower(${e}), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', ' ', 'g')`;

/** Los N productos del catálogo más parecidos a cada renglón (en una sola consulta). */
export function consultaCandidatos(textosNormalizados: string[], limite = 5): Consulta {
  const nombre = NORM(`p.nombre || ' ' || COALESCE(p.texto_busqueda, '')`);
  return {
    valores: [textosNormalizados],
    texto: `SELECT i.idx::int AS idx, c.id::int AS id, c.puntaje::float8 AS puntaje
FROM unnest($1::text[]) WITH ORDINALITY AS i(texto, idx)
CROSS JOIN LATERAL (
  SELECT p.id, GREATEST(similarity(${nombre}, i.texto), word_similarity(i.texto, ${nombre}) * 0.9) AS puntaje
  FROM productos p WHERE p.activo
  ORDER BY puntaje DESC, p.id LIMIT ${Math.min(10, Math.max(1, Math.trunc(limite)))}
) c WHERE c.puntaje >= 0.15
ORDER BY i.idx, c.puntaje DESC, c.id`,
  };
}

/** Renglones ya resueltos antes por la tienda (memoria). */
export function consultaMemoria(textosNormalizados: string[]): Consulta {
  return {
    valores: [textosNormalizados],
    texto: `SELECT a.texto, a.producto_id::int AS producto_id FROM producto_alias a JOIN productos p ON p.id = a.producto_id WHERE p.activo AND a.texto = ANY($1::text[])`,
  };
}
