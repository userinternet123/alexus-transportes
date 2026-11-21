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
  'sucursales.todas': { modulo: 'Configuración', descripcion: 'Operar y consultar TODAS las sedes (consolidado)' },
  'auditoria.ver': { modulo: 'Configuración', descripcion: 'Consultar bitácora de auditoría' },
  'operacion.autorizar': { modulo: 'Configuración', descripcion: 'Autorizar con sus credenciales acciones de otros (anular, reabrir)' },

  // Catálogos generales (geografía, marcas, sedes, rutas, planes de mantenimiento, repuestos...)
  'catalogos.ver': { modulo: 'Catálogos', descripcion: 'Ver catálogos' },
  'catalogos.crear': { modulo: 'Catálogos', descripcion: 'Crear registros de catálogos' },
  'catalogos.editar': { modulo: 'Catálogos', descripcion: 'Editar registros de catálogos' },
  'catalogos.eliminar': { modulo: 'Catálogos', descripcion: 'Desactivar registros de catálogos' },

  // Terceros: clientes (empresas que nos contratan), proveedores y talleres
  'terceros.ver': { modulo: 'Clientes y proveedores', descripcion: 'Ver clientes, proveedores y talleres' },
  'terceros.crear': { modulo: 'Clientes y proveedores', descripcion: 'Crear clientes, proveedores y talleres' },
  'terceros.editar': { modulo: 'Clientes y proveedores', descripcion: 'Editar clientes, proveedores y talleres' },
  'terceros.eliminar': { modulo: 'Clientes y proveedores', descripcion: 'Desactivar clientes, proveedores y talleres' },
  'tarifas.ver': { modulo: 'Clientes y proveedores', descripcion: 'Ver tarifas por cliente y ruta' },
  'tarifas.crear': { modulo: 'Clientes y proveedores', descripcion: 'Crear tarifas' },
  'tarifas.editar': { modulo: 'Clientes y proveedores', descripcion: 'Editar tarifas' },
  'tarifas.eliminar': { modulo: 'Clientes y proveedores', descripcion: 'Desactivar tarifas' },

  // Flota
  'flota.ver': { modulo: 'Flota', descripcion: 'Ver cabezales, remolques y sus documentos' },
  'flota.crear': { modulo: 'Flota', descripcion: 'Registrar cabezales, remolques y documentos' },
  'flota.editar': { modulo: 'Flota', descripcion: 'Editar cabezales, remolques y documentos' },
  'flota.eliminar': { modulo: 'Flota', descripcion: 'Dar de baja cabezales, remolques y documentos' },

  // Pilotos
  'pilotos.ver': { modulo: 'Pilotos', descripcion: 'Ver pilotos y sus licencias' },
  'pilotos.crear': { modulo: 'Pilotos', descripcion: 'Registrar pilotos' },
  'pilotos.editar': { modulo: 'Pilotos', descripcion: 'Editar pilotos, licencias y pago por viaje' },
  'pilotos.eliminar': { modulo: 'Pilotos', descripcion: 'Dar de baja pilotos' },

  // Viajes
  'viajes.ver': { modulo: 'Viajes', descripcion: 'Ver viajes' },
  'viajes.crear': { modulo: 'Viajes', descripcion: 'Programar e iniciar viajes' },
  'viajes.editar': { modulo: 'Viajes', descripcion: 'Editar viajes programados (cliente, cabezal, piloto, tarifa)' },
  'viajes.costos': { modulo: 'Viajes', descripcion: 'Registrar costos del viaje (peajes, viáticos, combustible) con su recibo' },
  'viajes.anticipos': { modulo: 'Viajes', descripcion: 'Entregar anticipos de efectivo al piloto' },
  'viajes.reportar': { modulo: 'Viajes', descripcion: 'Reportar en vivo desde el camino (estado, ubicación, fotos, incidentes)' },
  'viajes.cerrar': { modulo: 'Viajes', descripcion: 'Finalizar viajes (km de llegada)' },
  'viajes.liquidar': { modulo: 'Viajes', descripcion: 'Liquidar viajes: anticipos, costos y pago al piloto' },
  'viajes.anular': { modulo: 'Viajes', descripcion: 'Cancelar viajes' },
  'viajes.cotizar': { modulo: 'Viajes', descripcion: 'Usar el cotizador de viajes' },

  // Inspección pre viaje (núcleo: todos los planes)
  'inspecciones.ver': { modulo: 'Flota', descripcion: 'Ver inspecciones pre viaje' },
  'inspecciones.registrar': { modulo: 'Flota', descripcion: 'Registrar la inspección pre viaje del cabezal' },

  // Casos y requerimientos (núcleo)
  'casos.ver': { modulo: 'Casos', descripcion: 'Ver casos y requerimientos' },
  'casos.crear': { modulo: 'Casos', descripcion: 'Reportar casos (fallas, pendientes, requerimientos)' },
  'casos.gestionar': { modulo: 'Casos', descripcion: 'Asignar, cambiar prioridad y resolver casos' },

  // Combustible
  'combustible.ver': { modulo: 'Combustible', descripcion: 'Ver cargas y rendimiento' },
  'combustible.registrar': { modulo: 'Combustible', descripcion: 'Registrar cargas de combustible' },
  'combustible.anular': { modulo: 'Combustible', descripcion: 'Anular cargas de combustible' },

  // Llantas
  'llantas.ver': { modulo: 'Llantas', descripcion: 'Ver llantas, montajes y vida útil' },
  'llantas.crear': { modulo: 'Llantas', descripcion: 'Registrar llantas' },
  'llantas.editar': { modulo: 'Llantas', descripcion: 'Montar, rotar, retirar y reencauchar llantas' },
  'llantas.eliminar': { modulo: 'Llantas', descripcion: 'Desechar llantas' },

  // Mantenimiento
  'mantenimiento.ver': { modulo: 'Mantenimiento', descripcion: 'Ver órdenes de trabajo y alertas' },
  'mantenimiento.crear': { modulo: 'Mantenimiento', descripcion: 'Abrir órdenes de trabajo' },
  'mantenimiento.editar': { modulo: 'Mantenimiento', descripcion: 'Registrar mano de obra y repuestos' },
  'mantenimiento.cerrar': { modulo: 'Mantenimiento', descripcion: 'Cerrar órdenes de trabajo' },
  'mantenimiento.anular': { modulo: 'Mantenimiento', descripcion: 'Anular órdenes de trabajo' },

  // Finanzas y gastos
  'gastos.ver': { modulo: 'Finanzas', descripcion: 'Ver los gastos de operación (alquiler, seguros, servicios…)' },
  'gastos.registrar': { modulo: 'Finanzas', descripcion: 'Registrar gastos de operación' },
  'gastos.anular': { modulo: 'Finanzas', descripcion: 'Anular gastos (con motivo)' },
  'finanzas.costos': { modulo: 'Finanzas', descripcion: 'Ver costos, utilidades y márgenes (gerencia y dueño)' },
  'finanzas.depreciacion.ver': { modulo: 'Finanzas', descripcion: 'Ver las reglas de depreciación' },
  'finanzas.depreciacion.crear': { modulo: 'Finanzas', descripcion: 'Crear reglas de depreciación' },
  'finanzas.depreciacion.editar': { modulo: 'Finanzas', descripcion: 'Editar reglas de depreciación' },
  'finanzas.depreciacion.eliminar': { modulo: 'Finanzas', descripcion: 'Desactivar reglas de depreciación' },

  // Reportería
  'reportes.viajes': { modulo: 'Reportes', descripcion: 'Reportes de viajes e ingresos' },
  'reportes.flota': { modulo: 'Reportes', descripcion: 'Reportes de flota, combustible y llantas' },
  'reportes.mantenimiento': { modulo: 'Reportes', descripcion: 'Reportes de mantenimiento y repuestos' },
  'reportes.financieros': { modulo: 'Reportes', descripcion: 'Utilidad, costo por km y márgenes' },
  'reportes.rrhh': { modulo: 'Reportes', descripcion: 'Reportes de RRHH y pago a pilotos' },
  'reportes.tablero': { modulo: 'Reportes', descripcion: 'Tablero de gerencia: indicadores de la flota' },

  // RRHH
  'rrhh.empleados.ver': { modulo: 'RRHH', descripcion: 'Ver empleados' },
  'rrhh.empleados.crear': { modulo: 'RRHH', descripcion: 'Crear empleados' },
  'rrhh.empleados.editar': { modulo: 'RRHH', descripcion: 'Editar empleados' },
  'rrhh.empleados.eliminar': { modulo: 'RRHH', descripcion: 'Dar de baja empleados' },
  'rrhh.asistencia': { modulo: 'RRHH', descripcion: 'Registrar asistencia y horas extra' },
  'rrhh.ausencias': { modulo: 'RRHH', descripcion: 'Registrar/aprobar ausencias y vacaciones' },
  'rrhh.planilla.ver': { modulo: 'RRHH', descripcion: 'Ver planillas' },
  'rrhh.planilla.generar': { modulo: 'RRHH', descripcion: 'Generar/recalcular planillas' },
  'rrhh.planilla.aprobar': { modulo: 'RRHH', descripcion: 'Aprobar planillas' },
};

/** Roles base sugeridos (el seed los crea; luego se administran desde el portal). */
export const ROLES_BASE: Record<string, { descripcion: string; permisos: string[] }> = {
  SUPERADMIN: { descripcion: 'Acceso total', permisos: ['*'] },
  GERENTE: {
    descripcion: 'Gerencia y dueño: toda la operación, reportes, costos y ganancias',
    permisos: Object.keys(PERMISOS).filter((p) => !p.startsWith('seguridad.') && p !== 'config.parametros'),
  },
  DESPACHADOR: {
    descripcion: 'Despacho: programa viajes, asigna cabezal y piloto, registra costos y combustible',
    permisos: [
      'catalogos.ver', 'terceros.ver', 'terceros.crear', 'terceros.editar', 'tarifas.ver', 'flota.ver', 'pilotos.ver',
      'viajes.ver', 'viajes.crear', 'viajes.editar', 'viajes.costos', 'viajes.anticipos', 'viajes.reportar', 'viajes.cerrar', 'viajes.cotizar',
      'inspecciones.ver', 'inspecciones.registrar', 'casos.ver', 'casos.crear', 'combustible.ver', 'combustible.registrar', 'mantenimiento.ver', 'reportes.viajes', 'reportes.flota',
    ],
  },
  PILOTO: {
    descripcion: 'Piloto: ve sus viajes, registra combustible y gastos del viaje desde el celular',
    permisos: ['viajes.ver', 'viajes.costos', 'viajes.reportar', 'combustible.registrar', 'inspecciones.ver', 'inspecciones.registrar', 'casos.crear', 'flota.ver'],
  },
  TALLER: {
    descripcion: 'Taller: órdenes de trabajo, repuestos y llantas',
    permisos: ['catalogos.ver', 'flota.ver', 'flota.editar', 'inspecciones.ver', 'casos.ver', 'casos.crear', 'casos.gestionar', 'llantas.ver', 'llantas.crear', 'llantas.editar', 'llantas.eliminar', 'mantenimiento.ver', 'mantenimiento.crear', 'mantenimiento.editar', 'mantenimiento.cerrar', 'reportes.mantenimiento'],
  },
  CONTADOR: {
    descripcion: 'Contabilidad: gastos, liquidaciones, planilla y reportes financieros',
    permisos: [
      'catalogos.ver', 'terceros.ver', 'viajes.ver', 'viajes.costos', 'viajes.anticipos', 'viajes.liquidar', 'gastos.ver', 'gastos.registrar', 'gastos.anular', 'finanzas.costos',
      'finanzas.depreciacion.ver', 'finanzas.depreciacion.crear', 'finanzas.depreciacion.editar', 'finanzas.depreciacion.eliminar',
      'reportes.viajes', 'reportes.flota', 'reportes.mantenimiento', 'reportes.financieros', 'reportes.rrhh', 'reportes.tablero',
      'rrhh.empleados.ver', 'rrhh.asistencia', 'rrhh.ausencias', 'rrhh.planilla.ver', 'rrhh.planilla.generar',
    ],
  },
  RRHH: {
    descripcion: 'Recursos Humanos',
    permisos: [
      'catalogos.ver', 'rrhh.empleados.ver', 'rrhh.empleados.crear', 'rrhh.empleados.editar', 'rrhh.empleados.eliminar',
      'pilotos.ver', 'pilotos.crear', 'pilotos.editar', 'pilotos.eliminar',
      'rrhh.asistencia', 'rrhh.ausencias', 'rrhh.planilla.ver', 'rrhh.planilla.generar', 'reportes.rrhh',
    ],
  },
};
