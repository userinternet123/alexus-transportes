// ¿Viajan cifrados los datos (usuario, contraseña, reportes) hacia esa dirección? Sin dependencias: se prueba en la PC.
export type NivelConexion = 'cifrada' | 'tailscale' | 'red-local' | 'insegura' | 'invalida'

const octetos = (h: string) => { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h); return m && m.slice(1).every((x) => Number(x) <= 255) ? m.slice(1).map(Number) : null }

export function clasificarServidor(direccion: string): { nivel: NivelConexion; mensaje: string } {
  const m = /^(https?):\/\/(\[[0-9a-f:]+\]|[^\s/:?#@]+)(?::(\d{1,5}))?(?:[/?#].*)?$/i.exec(direccion.trim())
  if (!m) return { nivel: 'invalida', mensaje: 'Escriba la dirección completa del servidor, por ejemplo http://100.64.1.10:8080' }
  const protocolo = m[1].toLowerCase(); const host = m[2].toLowerCase()
  if (protocolo === 'https') return { nivel: 'cifrada', mensaje: 'Conexión cifrada (HTTPS).' }
  const ip = octetos(host)
  // Tailscale cifra todo el tráfico entre equipos (WireGuard): direcciones 100.64.0.0/10 y nombres *.ts.net
  if ((ip && ip[0] === 100 && ip[1] >= 64 && ip[1] <= 127) || host.endsWith('.ts.net')) return { nivel: 'tailscale', mensaje: 'Conexión cifrada por Tailscale.' }
  const local = ip
    ? ip[0] === 10 || ip[0] === 127 || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] === 192 && ip[1] === 168) || (ip[0] === 169 && ip[1] === 254)
    : host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan') || !host.includes('.') || host.startsWith('[fe80:') || host.startsWith('[fd') || host === '[::1]'
  if (local) return { nivel: 'red-local', mensaje: 'Red local SIN cifrar: quien esté conectado a esa misma red podría leer lo que se envía. Con Tailscale o HTTPS viaja cifrado.' }
  return { nivel: 'insegura', mensaje: 'Esa dirección enviaría su usuario y contraseña SIN cifrar por internet. Use una dirección https://, o conéctese por Tailscale.' }
}
/** A una dirección insegura o inválida no se envía nada. */
export const servidorPermitido = (direccion: string) => { const n = clasificarServidor(direccion).nivel; return n !== 'insegura' && n !== 'invalida' }
