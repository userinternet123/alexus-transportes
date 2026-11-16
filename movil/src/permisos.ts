// Misma regla que el portal: módulo contratado (licencia) + permiso del rol.
const PREFIJOS: [string, string][] = [
  ['reportes.analitica', 'analitica'], ['reportes.', 'reportes'], ['rrhh.', 'rrhh'],
  ['inventario.trasladar', 'multisucursal'], ['sucursales.todas', 'multisucursal'],
  ['inventario.', 'inventario'], ['compras.', 'inventario'],
  ['ventas.', 'pos'], ['caja.', 'pos'], ['cierre.', 'pos'], ['descuentos.', 'pos'],
]
const moduloDe = (p: string) => PREFIJOS.find(([x]) => p === x || p.startsWith(x))?.[1] ?? null

export interface Perfil {
  id: number
  username: string
  nombre: string
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
