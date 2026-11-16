// ─────────────────────────────────────────────────────────────────────────────
// Menú SPVI 2.0 — se integra en MENU_ITEMS.menu del sidebar existente.
// `permissionKey` = código de permiso del API. El menú se filtra con
// filtrarMenu(menu, puede) de hooks/usePermisos.js (ya no por "tag").
// ─────────────────────────────────────────────────────────────────────────────
import {
  ShoppingCart, Boxes, Truck, Wallet, CalendarCheck, BarChart3, Users, Tags, ShieldCheck, Settings,
} from 'lucide-react'
import { botonesDe } from './moduleRegistry'

const catalogo = (clave, label, permiso) => ({
  name: clave, label, component: 'list', action: 'path', path: clave, module: label, title: '',
  permissionKey: permiso, button: botonesDe(clave),
})

export const MENU_SPVI = [
  {
    label: 'Punto de venta', name: 'pos', icon: ShoppingCart, permissionKey: 'ventas.ver',
    submenu: [
      { name: 'pos', label: 'Vender', action: 'path', path: '/home/pos', component: 'pos', permissionKey: 'ventas.crear' },
      { name: 'cotizar', label: 'Cotizar', action: 'path', path: '/home/pos?modo=cotizacion', component: 'pos', permissionKey: 'ventas.cotizar' },
      { name: 'ventas', label: 'Ventas del día', action: 'path', path: '/home/ventas', component: 'ventas', permissionKey: 'ventas.ver' },
    ],
  },
  {
    label: 'Caja', name: 'caja', icon: Wallet, permissionKey: 'caja.operar',
    submenu: [
      { name: 'mi-caja', label: 'Mi caja (apertura y cuadre)', action: 'path', path: '/home/caja', component: 'caja', permissionKey: 'caja.operar' },
      { name: 'sesiones', label: 'Turnos de caja', action: 'path', path: '/home/caja/sesiones', component: 'caja-sesiones', permissionKey: 'caja.supervisar' },
    ],
  },
  {
    label: 'Cierre del día', name: 'cierre', icon: CalendarCheck, permissionKey: 'cierre.ver',
    submenu: [{ name: 'cierre', label: 'Cierre diario', action: 'path', path: '/home/cierre', component: 'cierre', permissionKey: 'cierre.ver' }],
  },
  {
    label: 'Inventario', name: 'inventario', icon: Boxes, permissionKey: 'inventario.ver',
    submenu: [
      { name: 'existencias', label: 'Existencias', action: 'path', path: '/home/existencias', component: 'existencias', permissionKey: 'inventario.ver' },
      { name: 'ajustes', label: 'Conteo físico / ajustes', action: 'path', path: '/home/ajustes', component: 'ajustes', permissionKey: 'inventario.ajustar' },
      { name: 'traslados', label: 'Traslados entre sucursales', action: 'path', path: '/home/traslados', component: 'traslados', permissionKey: 'inventario.trasladar' },
    ],
  },
  {
    label: 'Compras', name: 'compras', icon: Truck, permissionKey: 'compras.ver',
    submenu: [
      { name: 'compras', label: 'Ingreso de facturas', action: 'path', path: '/home/compras', component: 'compras', permissionKey: 'compras.crear' },
      catalogo('proveedores', 'Proveedores', 'terceros.ver'),
    ],
  },
  {
    label: 'Productos', name: 'productos', icon: Tags, permissionKey: 'productos.ver',
    submenu: [
      catalogo('productos', 'Productos', 'productos.ver'),
      catalogo('categorias', 'Categorías', 'catalogos.ver'),
      catalogo('grupos', 'Grupos', 'catalogos.ver'),
      catalogo('subgrupos', 'Sub-agrupaciones', 'catalogos.ver'),
      catalogo('marcas', 'Marcas', 'catalogos.ver'),
      catalogo('presentaciones', 'Presentaciones', 'catalogos.ver'),
      catalogo('politicas-descuento', 'Políticas de descuento', 'descuentos.ver'),
    ],
  },
  {
    label: 'Clientes', name: 'clientes', icon: Users, permissionKey: 'terceros.ver',
    submenu: [catalogo('clientes', 'Clientes', 'terceros.ver')],
  },
  {
    label: 'Reportes', name: 'reportes', icon: BarChart3, permissionKey: null,
    submenu: [{ name: 'reportes', label: 'Centro de reportes', action: 'path', path: '/home/reportes', component: 'reportes', permissionKey: null }],
  },
  {
    label: 'Recursos humanos', name: 'rrhh', icon: Users, permissionKey: 'rrhh.empleados.ver',
    submenu: [
      catalogo('empleados', 'Empleados', 'rrhh.empleados.ver'),
      catalogo('puestos', 'Puestos', 'catalogos.ver'),
      { name: 'asistencia', label: 'Asistencia', action: 'path', path: '/home/asistencia', component: 'asistencia', permissionKey: 'rrhh.asistencia' },
      { name: 'planillas', label: 'Planillas', action: 'path', path: '/home/planillas', component: 'planillas', permissionKey: 'rrhh.planilla.ver' },
    ],
  },
  {
    label: 'Configuración', name: 'config', icon: Settings, permissionKey: 'catalogos.ver',
    submenu: [
      catalogo('sucursales', 'Sucursales', 'catalogos.ver'),
      catalogo('bodegas', 'Bodegas', 'catalogos.ver'),
      catalogo('cajas', 'Cajas', 'catalogos.ver'),
      { name: 'parametros', label: 'Parámetros del sistema', action: 'path', path: '/home/parametros', component: 'parametros', permissionKey: 'config.parametros' },
    ],
  },
  {
    label: 'Seguridad', name: 'seguridad', icon: ShieldCheck, permissionKey: 'seguridad.usuarios.ver',
    submenu: [
      { name: 'usuarios', label: 'Usuarios', action: 'path', path: '/home/usuarios', component: 'list', permissionKey: 'seguridad.usuarios.ver' },
      { name: 'roles', label: 'Roles y permisos', action: 'path', path: '/home/roles', component: 'list', permissionKey: 'seguridad.roles.ver' },
    ],
  },
]
