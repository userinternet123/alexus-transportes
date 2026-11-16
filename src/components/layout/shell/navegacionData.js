// Datos de navegación derivados del menú (una sola fuente: sidebarMenu.js)
import { MENU_ITEMS } from '../sidebar/config/sidebarMenu'
import { hasPermission } from '../../../services/authService'

/** Color del cuadro de ícono por módulo (estilo Configuración de macOS). */
export const COLOR_MODULO = {
  inicio: 'bg-gray-500',
  'mod-viajes': 'bg-green-600',
  'mod-flota': 'bg-sky-500',
  'mod-combustible': 'bg-amber-500',
  'mod-taller': 'bg-orange-500',
  'mod-llantas': 'bg-zinc-600',
  'mod-pilotos': 'bg-violet-500',
  'mod-terceros': 'bg-teal-500',
  'mod-reportes': 'bg-indigo-500',
  'mod-rrhh': 'bg-rose-500',
  'mod-admin': 'bg-slate-500',
}

/** Módulos visibles para el usuario, con sus opciones permitidas. */
export function modulosVisibles() {
  return MENU_ITEMS.menu
    .filter((m) => m.action !== 'logout' && hasPermission(m.tag))
    .map((m) => ({ ...m, submenu: (m.submenu ?? []).filter((s) => hasPermission(s.tag)) }))
    .filter((m) => !m.submenu.length ? m.path : true)
}

/** Lista plana para el buscador de comandos. */
export function destinos() {
  return modulosVisibles().flatMap((m) =>
    m.submenu.length ? m.submenu.map((s) => ({ modulo: m, sub: s, etiqueta: s.label, grupo: m.label })) : [{ modulo: m, sub: null, etiqueta: m.label, grupo: '' }])
}

export const rutaDe = (sub) => (sub ? `/home/${sub.path}` : '/home')

/** ¿La opción corresponde a la URL actual? (considera ?modo=…) */
export function esActual(sub, pathname, search) {
  if (!sub) return pathname === '/home'
  const [ruta, query = ''] = sub.path.split('?')
  return pathname === `/home/${ruta}` && (query ? search.includes(query) : !search)
}
