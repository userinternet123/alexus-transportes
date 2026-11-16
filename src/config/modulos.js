// Copia en el portal de la regla del API (api/src/modules/licencia/modulos.ts):
// a qué módulo vendible pertenece cada permiso. null = núcleo, siempre incluido.
const PREFIJOS = [
  ['reportes.analitica', 'analitica'],
  ['reportes.', 'reportes'],
  ['rrhh.', 'rrhh'],
  ['inventario.trasladar', 'multisucursal'],
  ['sucursales.todas', 'multisucursal'],
  ['inventario.', 'inventario'],
  ['giros.', 'giros'],
  ['compras.', 'inventario'],
  ['ventas.', 'pos'],
  ['caja.', 'pos'],
  ['cierre.', 'pos'],
  ['descuentos.', 'pos'],
]

export function moduloDe(permiso) {
  return PREFIJOS.find(([p]) => permiso === p || permiso.startsWith(p))?.[1] ?? null
}

/** ¿El permiso pertenece a un módulo contratado? Sin datos de licencia (API anterior) => sí. */
export function moduloContratado(permiso, modulosContratados) {
  if (!Array.isArray(modulosContratados)) return true
  const m = moduloDe(permiso)
  return m === null || modulosContratados.includes(m)
}
