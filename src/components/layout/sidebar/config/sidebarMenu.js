// ─────────────────────────────────────────────────────────────────────────────
// MENÚ ALEXUS Transportes — organizado por área de trabajo.
// `tag` = código de permiso del API (ver Administración › Roles y permisos).
// Los catálogos toman sus botones de src/data/transporte/_indice.json (generado
// con scripts/generar-configs.mjs).
// ─────────────────────────────────────────────────────────────────────────────
import {
  Home, Route, Truck, Fuel, Wrench, CircleDot, Users, Building2, TrendingUp, UserCog, Settings, LogOut, LifeBuoy,
} from 'lucide-react'
import indice from '../../../../data/transporte/_indice.json'

/** Opción de catálogo (lista + formulario JSON) */
const catalogo = (clave, label, tag) => ({
  name: clave, label, component: 'list', action: 'path', path: clave, module: label, title: '',
  tag, button: indice[clave]?.botones ?? [],
})
/** Opción de pantalla dedicada */
const pantalla = (name, label, path, tag) => ({ name, label, component: name, action: 'path', path, tag, button: [] })

export const MENU_ITEMS = {
  nombreEmpresa: 'ALEXUS Transportes',
  nombreSistema: 'Control de flota y viajes',
  menu: [
    { label: 'Inicio', name: 'inicio', icon: Home, tag: 777, action: 'path', path: '/home' },

    {
      label: 'Viajes', name: 'mod-viajes', icon: Route, tag: 'viajes.ver',
      submenu: [
        pantalla('viajes', 'Viajes', 'viajes', 'viajes.ver'),
        pantalla('cotizador', 'Cotizador y cotizaciones', 'cotizador', 'viajes.cotizar'),
        catalogo('rutas', 'Rutas y sus condiciones', 'catalogos.ver'),
        catalogo('tarifas', 'Tarifas por cliente', 'tarifas.ver'),
      ],
    },
    {
      label: 'Flota', name: 'mod-flota', icon: Truck, tag: 'flota.ver',
      submenu: [
        catalogo('cabezales', 'Cabezales', 'flota.ver'),
        catalogo('remolques', 'Remolques', 'flota.ver'),
        catalogo('documentos-vehiculo', 'Documentos y seguros', 'flota.ver'),
        pantalla('inspecciones', 'Inspección pre viaje', 'inspecciones', 'inspecciones.ver'),
      ],
    },
    {
      label: 'Casos', name: 'mod-casos', icon: LifeBuoy, tag: 'casos.crear',
      submenu: [
        pantalla('casos', 'Casos y requerimientos', 'casos', 'casos.crear'),
      ],
    },
    {
      label: 'Combustible', name: 'mod-combustible', icon: Fuel, tag: 'combustible.ver',
      submenu: [
        pantalla('combustible', 'Cargas y rendimiento', 'combustible', 'combustible.ver'),
      ],
    },
    {
      label: 'Taller', name: 'mod-taller', icon: Wrench, tag: 'mantenimiento.ver',
      submenu: [
        // Fase 2: órdenes de trabajo y alertas de mantenimiento
        catalogo('planes-mantenimiento', 'Planes de mantenimiento', 'catalogos.ver'),
        catalogo('repuestos', 'Repuestos', 'catalogos.ver'),
        catalogo('marcas', 'Marcas', 'catalogos.ver'),
        catalogo('talleres', 'Talleres', 'terceros.ver'),
      ],
    },
    {
      label: 'Llantas', name: 'mod-llantas', icon: CircleDot, tag: 'llantas.ver',
      submenu: [
        catalogo('llantas', 'Llantas', 'llantas.ver'),
        // Fase 3: montajes, rotaciones y costo por km
      ],
    },
    {
      label: 'Pilotos', name: 'mod-pilotos', icon: Users, tag: 'pilotos.ver',
      submenu: [
        catalogo('pilotos', 'Pilotos y licencias', 'pilotos.ver'),
      ],
    },
    {
      label: 'Clientes y proveedores', name: 'mod-terceros', icon: Building2, tag: 'terceros.ver',
      submenu: [
        catalogo('clientes', 'Clientes', 'terceros.ver'),
        catalogo('proveedores', 'Proveedores', 'terceros.ver'),
      ],
    },
    {
      label: 'Finanzas y reportes', name: 'mod-reportes', icon: TrendingUp, tag: 'reportes.viajes',
      submenu: [
        pantalla('rentabilidad', 'Rentabilidad de viajes', 'rentabilidad', 'finanzas.costos'),
        pantalla('gastos', 'Gastos de operación', 'gastos', 'gastos.ver'),
        pantalla('reportes', 'Centro de reportes', 'reportes', 'reportes.viajes'),
      ],
    },
    {
      label: 'Recursos humanos', name: 'mod-rrhh', icon: UserCog, tag: 'rrhh.empleados.ver',
      submenu: [
        catalogo('empleados', 'Empleados', 'rrhh.empleados.ver'),
        catalogo('departamentos', 'Áreas de la empresa', 'catalogos.ver'),
        catalogo('puestos', 'Puestos', 'catalogos.ver'),
      ],
    },
    {
      label: 'Administración', name: 'mod-admin', icon: Settings, tag: 'catalogos.ver',
      submenu: [
        pantalla('usuarios', 'Usuarios', 'usuarios', 'seguridad.usuarios.ver'),
        pantalla('roles', 'Roles y permisos', 'roles', 'seguridad.roles.ver'),
        pantalla('negocio', 'Configuración de la empresa', 'negocio', 'config.parametros'),
        pantalla('licencia', 'Licencia y módulos', 'licencia', 'config.parametros'),
        pantalla('parametros', 'Parámetros del sistema', 'parametros', 'config.parametros'),
        catalogo('sucursales', 'Sedes', 'catalogos.ver'),
      ],
    },

    {
      label: 'Cerrar sesión', name: 'salir', icon: LogOut, action: 'logout', tag: 777,
      className: 'menu-item font-medium menu-toggle-option-danger',
    },
  ],
}
