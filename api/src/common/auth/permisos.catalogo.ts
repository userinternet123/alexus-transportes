/**
 * Catálogo ÚNICO de permisos (fuente de verdad). El seed lo sincroniza con la
 * tabla `permisos`. Para agregar una pantalla/acción nueva: agregar aquí,
 * proteger el endpoint con @Permisos(...) y asignarlo a roles desde el portal.
 *
 * Convención: <modulo>.<accion>. Los CRUD genéricos usan .ver/.crear/.editar/.eliminar
 * El front usa estos mismos códigos como `permissionKey` en el menú.
 */
export const PERMISOS: Record<string, { modulo: string; descripcion: string }> = {
  // Seguridad / configuración
  'seguridad.usuarios.ver': { modulo: 'Seguridad', descripcion: 'Ver usuarios' },
  'seguridad.usuarios.gestionar': { modulo: 'Seguridad', descripcion: 'Crear/editar usuarios, resetear contraseñas' },
  'seguridad.roles.ver': { modulo: 'Seguridad', descripcion: 'Ver roles y permisos' },
  'seguridad.roles.gestionar': { modulo: 'Seguridad', descripcion: 'Crear/editar roles y asignar permisos' },
  'config.parametros': { modulo: 'Configuración', descripcion: 'Modificar parámetros del sistema' },
  'sucursales.todas': { modulo: 'Configuración', descripcion: 'Operar y consultar TODAS las sucursales (consolidado)' },
  'auditoria.ver': { modulo: 'Configuración', descripcion: 'Consultar bitácora de auditoría' },

  // Catálogos generales (geografía, marcas, presentaciones, categorías, bodegas, cajas...)
  'catalogos.ver': { modulo: 'Catálogos', descripcion: 'Ver catálogos' },
  'catalogos.crear': { modulo: 'Catálogos', descripcion: 'Crear registros de catálogos' },
  'catalogos.editar': { modulo: 'Catálogos', descripcion: 'Editar registros de catálogos' },
  'catalogos.eliminar': { modulo: 'Catálogos', descripcion: 'Desactivar registros de catálogos' },

  // Terceros
  'terceros.ver': { modulo: 'Clientes y Proveedores', descripcion: 'Ver clientes y proveedores' },
  'terceros.crear': { modulo: 'Clientes y Proveedores', descripcion: 'Crear clientes y proveedores' },
  'terceros.editar': { modulo: 'Clientes y Proveedores', descripcion: 'Editar clientes y proveedores' },
  'terceros.eliminar': { modulo: 'Clientes y Proveedores', descripcion: 'Desactivar clientes y proveedores' },

  // Productos
  'productos.ver': { modulo: 'Productos', descripcion: 'Ver productos' },
  'productos.crear': { modulo: 'Productos', descripcion: 'Crear productos' },
  'productos.editar': { modulo: 'Productos', descripcion: 'Editar productos' },
  'productos.eliminar': { modulo: 'Productos', descripcion: 'Desactivar productos' },
  'productos.precios': { modulo: 'Productos', descripcion: 'Cambiar precio de venta' },
  'descuentos.ver': { modulo: 'Productos', descripcion: 'Ver políticas de descuento' },
  'descuentos.crear': { modulo: 'Productos', descripcion: 'Crear políticas de descuento' },
  'descuentos.editar': { modulo: 'Productos', descripcion: 'Editar políticas de descuento' },
  'descuentos.eliminar': { modulo: 'Productos', descripcion: 'Desactivar políticas de descuento' },

  // Inventario
  'inventario.ver': { modulo: 'Inventario', descripcion: 'Ver existencias' },
  'inventario.kardex': { modulo: 'Inventario', descripcion: 'Ver kardex (movimientos y costos)' },
  'inventario.contar': { modulo: 'Inventario', descripcion: 'Contar mercadería en un conteo físico abierto' },
  'inventario.ubicaciones': { modulo: 'Inventario', descripcion: 'Administrar ubicaciones de bodega (pasillo, estante…) y asignarlas' },
  'inventario.cuadre': { modulo: 'Inventario', descripcion: 'Conteo físico: ver con cuánto debe cuadrar y marcar que cuadra (gerencia y dueño)' },
  'inventario.ajustar': { modulo: 'Inventario', descripcion: 'Abrir y aprobar conteos físicos, ajustes e inventario inicial' },
  'inventario.trasladar': { modulo: 'Inventario', descripcion: 'Enviar/recibir traslados entre sucursales' },

  // Compras
  'compras.ver': { modulo: 'Compras', descripcion: 'Ver compras / ingresos' },
  'compras.crear': { modulo: 'Compras', descripcion: 'Registrar compras' },
  'compras.anular': { modulo: 'Compras', descripcion: 'Anular compras' },

  // Ventas
  'ventas.ver': { modulo: 'Ventas', descripcion: 'Ver ventas y cotizaciones' },
  'ventas.crear': { modulo: 'Ventas', descripcion: 'Realizar ventas (POS)' },
  'ventas.cotizar': { modulo: 'Ventas', descripcion: 'Crear cotizaciones' },
  'ventas.anular': { modulo: 'Ventas', descripcion: 'Anular ventas del día' },
  'ventas.devolver': { modulo: 'Ventas', descripcion: 'Registrar devoluciones / notas de crédito' },
  'ventas.descuento_libre': { modulo: 'Ventas', descripcion: 'Aplicar descuentos sin tope de política' },
  'ventas.quitar_linea': { modulo: 'Ventas', descripcion: 'Quitar o reducir productos del carrito del POS sin autorización' },
  'ventas.autorizar': { modulo: 'Ventas', descripcion: 'Autorizar con sus credenciales acciones de otros (anular, devolver, quitar productos)' },

  // Caja
  'caja.operar': { modulo: 'Caja', descripcion: 'Abrir/cerrar SU caja y registrar movimientos' },
  'caja.conciliar': { modulo: 'Caja', descripcion: 'Verificar vouchers de tarjeta, transferencias y cheques' },
  'caja.supervisar': { modulo: 'Caja', descripcion: 'Ver y cerrar cajas de otros usuarios' },
  'caja.validar_deposito': { modulo: 'Caja', descripcion: 'Validar boletas de depósito bancario (encargado de tienda)' },

  // Cierre
  'cierre.ver': { modulo: 'Cierre', descripcion: 'Ver cierres diarios' },
  'cierre.ejecutar': { modulo: 'Cierre', descripcion: 'Ejecutar el cierre del día' },
  'cierre.reabrir': { modulo: 'Cierre', descripcion: 'Reabrir un día cerrado (excepcional, auditado)' },

  // Reportería
  'giros.configurar': { modulo: 'Productos', descripcion: 'Configurar los campos por giro (paquete adicional)' },
  'reportes.analitica.finanzas': { modulo: 'Reportes', descripcion: 'Salud financiera: estado de resultados, márgenes, punto de equilibrio, inventario e IVA estimado (requiere ver costos)' },
  'reportes.analitica.temporadas': { modulo: 'Reportes', descripcion: 'Temporadas de venta: definirlas, confirmar las detectadas y ver qué comprar con anticipación' },
  'documentos.configurar': { modulo: 'Configuración', descripcion: 'Diseñar el formato de las cotizaciones y facturas (logo, columnas, textos, papel)' },
  'gastos.ver': { modulo: 'Finanzas', descripcion: 'Ver los gastos pagados fuera de caja (alquiler, luz, servicios…)' },
  'gastos.registrar': { modulo: 'Finanzas', descripcion: 'Registrar gastos pagados fuera de caja' },
  'gastos.anular': { modulo: 'Finanzas', descripcion: 'Anular gastos (con motivo)' },
  'finanzas.costos': { modulo: 'Finanzas', descripcion: 'Ver costos, utilidades y márgenes (gerencia y dueño)' },
  'reportes.ventas': { modulo: 'Reportes', descripcion: 'Reportes de ventas' },
  'reportes.inventario': { modulo: 'Reportes', descripcion: 'Reportes de inventario' },
  'reportes.financieros': { modulo: 'Reportes', descripcion: 'Utilidad, márgenes y costos' },
  'reportes.caja': { modulo: 'Reportes', descripcion: 'Reportes de cuadre de caja' },
  'reportes.rrhh': { modulo: 'Reportes', descripcion: 'Reportes de RRHH y comisiones' },
  'reportes.analitica.agente': { modulo: 'Reportes', descripcion: 'Preguntar a los datos con IA: gráficas, proyecciones y explicación (envía cifras a un servicio de IA)' },
  'reportes.analitica': { modulo: 'Reportes', descripcion: 'Dashboard analítico: estacionalidad, rotación, márgenes, sugerido de compra' },

  // RRHH
  'rrhh.empleados.ver': { modulo: 'RRHH', descripcion: 'Ver empleados' },
  'rrhh.empleados.crear': { modulo: 'RRHH', descripcion: 'Crear empleados' },
  'rrhh.empleados.editar': { modulo: 'RRHH', descripcion: 'Editar empleados' },
  'rrhh.empleados.eliminar': { modulo: 'RRHH', descripcion: 'Dar de baja empleados' },
  'rrhh.asistencia': { modulo: 'RRHH', descripcion: 'Registrar asistencia' },
  'rrhh.ausencias': { modulo: 'RRHH', descripcion: 'Registrar/aprobar ausencias y vacaciones' },
  'rrhh.planilla.ver': { modulo: 'RRHH', descripcion: 'Ver planillas' },
  'rrhh.planilla.generar': { modulo: 'RRHH', descripcion: 'Generar/recalcular planillas' },
  'rrhh.planilla.aprobar': { modulo: 'RRHH', descripcion: 'Aprobar planillas' },
};

/** Roles base sugeridos (el seed los crea; luego se administran desde el portal). */
export const ROLES_BASE: Record<string, { descripcion: string; permisos: string[] }> = {
  SUPERADMIN: { descripcion: 'Acceso total', permisos: ['*'] },
  GERENTE: {
    descripcion: 'Gerencia y dueño del negocio: todo lo operativo, reportes, cierres, costos y ganancias',
    permisos: Object.keys(PERMISOS).filter((p) => !p.startsWith('seguridad.') && p !== 'config.parametros'),
  },
  SUPERVISOR: {
    descripcion: 'Supervisor de sucursal',
    permisos: [
      'catalogos.ver', 'terceros.ver', 'terceros.crear', 'terceros.editar', 'productos.ver',
      'inventario.ver', 'inventario.kardex', 'inventario.contar', 'inventario.ajustar', 'inventario.trasladar',
      'compras.ver', 'compras.crear', 'ventas.ver', 'ventas.crear', 'ventas.cotizar', 'ventas.anular',
      'ventas.devolver', 'ventas.quitar_linea', 'ventas.autorizar', 'caja.operar', 'caja.supervisar', 'caja.validar_deposito', 'caja.conciliar', 'inventario.ubicaciones', 'cierre.ver', 'cierre.ejecutar',
      'reportes.ventas', 'reportes.inventario', 'reportes.caja', 'reportes.analitica', 'rrhh.asistencia',
    ],
  },
  CAJERO: {
    descripcion: 'Vendedor / cajero',
    permisos: ['productos.ver', 'terceros.ver', 'terceros.crear', 'inventario.ver', 'ventas.ver', 'ventas.crear', 'ventas.cotizar', 'caja.operar'],
  },
  BODEGUERO: {
    descripcion: 'Bodega: compras e inventario',
    permisos: ['productos.ver', 'terceros.ver', 'inventario.ver', 'inventario.kardex', 'inventario.contar', 'inventario.trasladar', 'inventario.ubicaciones', 'compras.ver', 'compras.crear'],
  },
  RRHH: {
    descripcion: 'Recursos Humanos',
    permisos: [
      'catalogos.ver', 'rrhh.empleados.ver', 'rrhh.empleados.crear', 'rrhh.empleados.editar', 'rrhh.empleados.eliminar',
      'rrhh.asistencia', 'rrhh.ausencias', 'rrhh.planilla.ver', 'rrhh.planilla.generar', 'reportes.rrhh',
    ],
  },
};
