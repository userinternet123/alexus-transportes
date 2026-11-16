// ─────────────────────────────────────────────────────────────────────────────
// MENÚ SPVI 2.0 — organizado por área de trabajo.
// `tag` = código de permiso del API (ver Administración › Roles y permisos).
// Los catálogos toman sus botones de src/data/spvi/_indice.json (generado).
// ─────────────────────────────────────────────────────────────────────────────
import {
  Home, ShoppingCart, Wallet, Boxes, Tags, Users, TrendingUp, UserCog, Settings, LogOut,
} from 'lucide-react'
import indice from '../../../../data/spvi/_indice.json'

/** Opción de catálogo (lista + formulario JSON) */
const catalogo = (clave, label, tag) => ({
  name: clave, label, component: 'list', action: 'path', path: clave, module: label, title: '',
  tag, button: indice[clave]?.botones ?? [],
})
/** Opción de pantalla dedicada */
const pantalla = (name, label, path, tag) => ({ name, label, component: name, action: 'path', path, tag, button: [] })

export const MENU_ITEMS = {
  nombreEmpresa: 'SPVI 2.0',
  nombreSistema: 'Punto de venta e inventario',
  menu: [
    { label: 'Inicio', name: 'inicio', icon: Home, tag: 777, action: 'path', path: '/home' },

    {
      label: 'Punto de venta', name: 'mod-ventas', icon: ShoppingCart, tag: 'ventas.ver',
      submenu: [
        pantalla('pos', 'Vender', 'pos', 'ventas.crear'),
        pantalla('cotizar', 'Cotizar', 'pos?modo=cotizacion', 'ventas.cotizar'),
        pantalla('ventas', 'Ventas y cotizaciones', 'ventas', 'ventas.ver'),
      ],
    },
    {
      label: 'Caja', name: 'mod-caja', icon: Wallet, tag: 'caja.operar',
      submenu: [
        pantalla('caja', 'Apertura y cuadre de caja', 'caja', 'caja.operar'),
        pantalla('cobros', 'Vouchers, transferencias y cheques', 'cobros', 'caja.conciliar'),
        pantalla('gastos', 'Gastos (fuera de caja)', 'gastos', 'gastos.ver'),
        pantalla('cierre', 'Cierre del día', 'cierre', 'cierre.ver'),
      ],
    },
    {
      label: 'Inventario', name: 'mod-inventario', icon: Boxes, tag: 'inventario.ver',
      submenu: [
        pantalla('existencias', 'Existencias y kardex', 'existencias', 'inventario.ver'),
        pantalla('ubicaciones', 'Ubicaciones de bodega', 'ubicaciones', 'inventario.ver'),
        pantalla('traslados', 'Traslados', 'traslados', 'inventario.trasladar'),
        pantalla('conteos', 'Conteo físico', 'conteos', 'inventario.contar'),
        pantalla('compras-importar', 'Importar factura de compra', 'compras?importar=1', 'compras.crear'),
        pantalla('que-comprar', 'Qué comprar y pedidos', 'que-comprar', 'compras.ver'),
        pantalla('compras', 'Ingreso de compras', 'compras', 'compras.crear'),
      ],
    },
    {
      label: 'Productos', name: 'mod-productos', icon: Tags, tag: 'productos.ver',
      submenu: [
        pantalla('productos', 'Productos', 'productos', 'productos.ver'),
        pantalla('clasificacion', 'Clasificación de productos', 'clasificacion', 'productos.ver'),
        pantalla('campos-producto', 'Campos por giro', 'campos-producto', 'giros.configurar'),
        catalogo('categorias', 'Categorías', 'catalogos.ver'),
        catalogo('grupos', 'Grupos', 'catalogos.ver'),
        catalogo('subgrupos', 'Sub-agrupaciones', 'catalogos.ver'),
        catalogo('marcas', 'Marcas', 'catalogos.ver'),
        catalogo('presentaciones', 'Presentaciones', 'catalogos.ver'),
        catalogo('politicas-descuento', 'Políticas de descuento', 'descuentos.ver'),
      ],
    },
    {
      label: 'Clientes y proveedores', name: 'mod-terceros', icon: Users, tag: 'terceros.ver',
      submenu: [
        pantalla('clientes', 'Clientes', 'clientes', 'terceros.ver'),
        catalogo('proveedores', 'Proveedores', 'terceros.ver'),
      ],
    },
    {
      label: 'Reportes y análisis', name: 'mod-reportes', icon: TrendingUp, tag: 'reportes.ventas',
      submenu: [
        pantalla('dashboard', 'Dashboard analítico', 'dashboard', 'reportes.analitica'),
        pantalla('asistente-datos', 'Pregunta a tus datos', 'asistente-datos', 'reportes.analitica.agente'),
        pantalla('analisis', 'Mis análisis y tableros', 'analisis', 'reportes.analitica'),
        pantalla('temporadas', 'Temporadas', 'temporadas', 'reportes.analitica.temporadas'),
        pantalla('salud-financiera', 'Salud financiera', 'salud-financiera', 'reportes.analitica.finanzas'),
        pantalla('reportes', 'Centro de reportes', 'reportes', 'reportes.ventas'),
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
        pantalla('negocio', 'Configuración del negocio', 'negocio', 'config.parametros'),
        pantalla('formato-documentos', 'Formato de documentos', 'formato-documentos', 'documentos.configurar'),
        pantalla('licencia', 'Licencia y módulos', 'licencia', 'config.parametros'),
        pantalla('parametros', 'Parámetros del sistema', 'parametros', 'config.parametros'),
        catalogo('sucursales', 'Sucursales', 'catalogos.ver'),
        catalogo('bodegas', 'Bodegas', 'catalogos.ver'),
        catalogo('cajas', 'Cajas', 'catalogos.ver'),
      ],
    },

    {
      label: 'Cerrar sesión', name: 'salir', icon: LogOut, action: 'logout', tag: 777,
      className: 'menu-item font-medium menu-toggle-option-danger',
    },
  ],
}
