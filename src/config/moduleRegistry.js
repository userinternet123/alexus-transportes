// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO DE MÓDULOS — cada catálogo del portal se arma desde
// src/data/transporte/_indice.json (generado con scripts/generar-configs.mjs),
// así agregar un catálogo nuevo NO requiere tocar Home.jsx.
// ─────────────────────────────────────────────────────────────────────────────
import indice from '../data/transporte/_indice.json'

// Vite: carga todos los JSON de la carpeta en build (sin imports manuales)
const archivos = import.meta.glob('../data/transporte/*.json', { eager: true, import: 'default' })
const leer = (nombre) => archivos[`../data/transporte/${nombre}.json`]

export const MODULOS_TRANSPORTE = Object.fromEntries(
  Object.entries(indice).map(([clave, info]) => [
    `/home/${clave}`,
    {
      type: 'list',
      config: leer(`${clave}-list`),
      modalConfig: leer(`${clave}-form`),
      path: info.endpoint,
      // limit=0 => el API devuelve todo (el ListBase actual pagina en cliente).
      params: { limit: 0, activo: 'todos' },
    },
  ])
)

/** Botones CRUD por módulo (para sidebarMenu.button). */
export const botonesDe = (clave) => indice[clave]?.botones ?? []
