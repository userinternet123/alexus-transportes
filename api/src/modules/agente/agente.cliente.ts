/** Cliente HTTP de la API de Claude (Messages) con mensajes claros para cada tipo de falla. */
import { ErrorAgente, LlamarClaude, RespuestaClaude } from './agente.orquestador';

export function crearClienteClaude(cfg: { apiKey: string; timeoutMs?: number }): LlamarClaude {
  return async (cuerpo) => {
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 90_000),
      });
    } catch {
      throw new ErrorAgente('No hay conexión con el servicio de IA. Revise el internet del servidor e intente de nuevo.');
    }
    if (res.status === 401 || res.status === 403) throw new ErrorAgente('La clave del servicio de IA no es válida. Avise al administrador del sistema.');
    if (res.status === 429) throw new ErrorAgente('El servicio de IA está ocupado o se alcanzó su límite de uso. Intente de nuevo en un minuto.');
    if (res.status >= 500) throw new ErrorAgente('El servicio de IA no está disponible en este momento. Intente de nuevo en unos minutos.');
    if (!res.ok) {
      // 400: casi siempre un nombre de modelo inválido o un cambio en la API; el mensaje de la API ayuda a diagnosticar
      const detalle = await res.json().then((j) => (j as { error?: { message?: string } } | null)?.error?.message ?? '').catch(() => '');
      throw new ErrorAgente(`El servicio de IA rechazó la consulta (código ${res.status})${detalle ? `: ${String(detalle).slice(0, 200)}` : ''}.`);
    }
    return (await res.json()) as RespuestaClaude;
  };
}
