/** Cliente del motor analítico local (Python). Solo habla con una dirección de la empresa (validada al arrancar). */
import { reglaNegocio } from '../../common/errors';
import { env } from '../../config/env';

export async function llamarAnalitica<T>(ruta: string, cuerpo: unknown, tiempoMs = 30_000): Promise<T> {
  if (!env.ANALITICA_TOKEN) throw reglaNegocio('ANALITICA_NO_CONFIGURADA', 'El motor analítico no está configurado en este servidor (falta ANALITICA_TOKEN).');
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), tiempoMs);
  let r: Response;
  try {
    r = await fetch(`${env.ANALITICA_URL}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SPVI-Token': env.ANALITICA_TOKEN }, body: JSON.stringify(cuerpo), signal: control.signal });
  } catch {
    throw reglaNegocio('ANALITICA_NO_DISPONIBLE', 'El motor analítico no está encendido o no responde. Inícielo e intente de nuevo.');
  } finally { clearTimeout(reloj); }
  if (r.status === 401) throw reglaNegocio('ANALITICA_TOKEN', 'El token del motor analítico no coincide con el del API (ANALITICA_TOKEN).');
  if (!r.ok) throw reglaNegocio('ANALITICA_ERROR', `El motor analítico no pudo hacer el cálculo (código ${r.status}).`);
  return (await r.json()) as T;
}
