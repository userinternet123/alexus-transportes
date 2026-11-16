// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO DE MÓDULOS — reemplaza el objeto COMPONENT_CONFIGS escrito a mano
// en Home.jsx. Cada ruta se arma desde src/data/spvi/_indice.json (generado),
// así agregar un catálogo nuevo NO requiere tocar Home.jsx.
//
// Uso en Home.jsx:
//   import { MODULOS_SPVI } from '../config/moduleRegistry'
//   const COMPONENT_CONFIGS = { ...MODULOS_SPVI, ...configsExistentes }
// ─────────────────────────────────────────────────────────────────────────────
import indice from '../data/spvi/_indice.json'

// Vite: carga todos los JSON de la carpeta en build (sin imports manuales)
const archivos = import.meta.glob('../data/spvi/*.json', { eager: true, import: 'default' })
const leer = (nombre) => archivos[`../data/spvi/${nombre}.json`]

export const MODULOS_SPVI = Object.fromEntries(
  Object.entries(indice).map(([clave, info]) => [
    `/home/${clave}`,
    {
      type: 'list',
      config: leer(`${clave}-list`),
      modalConfig: leer(`${clave}-form`),
      path: info.endpoint,
      // limit=0 => el API devuelve todo (el ListBase actual pagina en cliente).
      // Cuando migres a paginación en servidor: { page, limit: 25 }.
      params: { limit: 0, activo: 'todos' },
    },
  ])
)

/** Botones CRUD por módulo (para sidebarMenu.button). */
export const botonesDe = (clave) => indice[clave]?.botones ?? []
