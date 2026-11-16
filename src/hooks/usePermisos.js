import { useContext, useMemo } from 'react'
import { AuthContext } from '../context/AuthContext'
import { moduloContratado } from '../config/modulos'

/**
 * Permisos del usuario (vienen de GET /auth/me). '*' = superadmin.
 * Uso:  const { puede } = usePermisos();  puede('ventas.anular')
 */
export function usePermisos() {
  const { user } = useContext(AuthContext)
  return useMemo(() => {
    const permisos = new Set(user?.permisos ?? [])
    const modulos = user?.usuario?.licencia?.modulos
    // Primero el plan contratado (aplica también al superadministrador), luego el rol
    const puede = (codigo) => !codigo || (moduloContratado(codigo, modulos) && (permisos.has('*') || permisos.has(codigo)))
    return { puede, permisos }
  }, [user])
}

/** Filtra el menú por `permissionKey` (código de permiso del API). */
export function filtrarMenu(menu, puede) {
  return menu
    .map((item) => (item.submenu ? { ...item, submenu: filtrarMenu(item.submenu, puede) } : item))
    .filter((item) => puede(item.permissionKey) && (!item.submenu || item.submenu.length > 0))
}
