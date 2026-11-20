// Misma regla que el portal y el API: módulo contratado (licencia) + permiso del rol.
const PREFIJOS: [string, string][] = [
  ['reportes.tablero', 'tablero'], ['reportes.', 'reportes'], ['rrhh.', 'rrhh'], ['sucursales.todas', 'multisede'],
  ['viajes.', 'viajes'], ['tarifas.', 'viajes'], ['combustible.', 'combustible'], ['mantenimiento.', 'mantenimiento'],
  ['llantas.', 'llantas'], ['pilotos.', 'pilotos'], ['gastos.', 'finanzas'], ['finanzas.', 'finanzas'],
]
const moduloDe = (p: string) => PREFIJOS.find(([x]) => p === x || p.startsWith(x))?.[1] ?? null

export interface Perfil {
  id: number
  username: string
  nombre: string
  debeCambiarPassword?: boolean
  permisos: string[]
  sucursales: { id: number; codigo: string; nombre: string; predeterminada: boolean }[]
  licencia?: { plan: string; modo: string; modulos: string[]; vence: string; diasRestantes: number | null }
}

export function puede(perfil: Perfil | null, permiso: string): boolean {
  if (!perfil) return false
  const m = moduloDe(permiso)
  if (m && perfil.licencia && !perfil.licencia.modulos.includes(m)) return false
  return perfil.permisos.includes('*') || perfil.permisos.includes(permiso)
}
