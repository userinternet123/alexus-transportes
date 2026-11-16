import { reglaNegocio } from '../../common/errors';
import { env } from '../../config/env';

/** Límite de preguntas con IA por usuario y hora (cada una cuesta dinero). Lo comparten el agente y las explicaciones. */
const usoPorUsuario = new Map<number, number[]>();
export function limitarPorHora(usuarioId: number) {
  const ahora = Date.now();
  const recientes = (usoPorUsuario.get(usuarioId) ?? []).filter((t) => ahora - t < 3_600_000);
  if (recientes.length >= env.IA_AGENTE_LIMITE_HORA) throw reglaNegocio('LIMITE_IA', `Llegó al límite de ${env.IA_AGENTE_LIMITE_HORA} consultas con IA por hora. Intente más tarde.`);
  recientes.push(ahora);
  usoPorUsuario.set(usuarioId, recientes);
}
