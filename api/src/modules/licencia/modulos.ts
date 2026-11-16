/**
 * MÓDULOS VENDIBLES Y PLANES
 * Cada permiso pertenece a un módulo (por prefijo). Si la licencia no incluye
 * el módulo, el permiso no existe para nadie de esa empresa (ni para el
 * superadministrador): desaparece del menú y el API lo rechaza.
 * El núcleo (seguridad, catálogos, clientes, configuración) siempre está incluido.
 */
export const MODULOS: Record<string, { nombre: string; descripcion: string }> = {
  pos: { nombre: 'Punto de venta y caja', descripcion: 'Ventas, cotizaciones, cobros, cuadre de caja, depósitos y cierre diario' },
  inventario: { nombre: 'Inventario y compras', descripcion: 'Productos con existencia, kardex, ingreso de compras y ajustes' },
  reportes: { nombre: 'Reportes', descripcion: 'Centro de reportes con exportación a Excel' },
  analitica: { nombre: 'Dashboard analítico', descripcion: 'Tendencias, temporada, reposición, baja rotación y márgenes' },
  rrhh: { nombre: 'Recursos humanos', descripcion: 'Empleados, asistencia, ausencias y planillas' },
  multisucursal: { nombre: 'Varias sucursales', descripcion: 'Traslados entre sucursales y reportes consolidados' },
  ia: { nombre: 'Lectura de facturas con IA', descripcion: 'Registrar compras desde la foto o el PDF de la factura del proveedor' },
  sinmarca: { nombre: 'Sin marca ALEXUS', descripcion: 'Quitar "SPVI by ALEXUS" de cotizaciones, facturas, tickets y de la pantalla completa del punto de venta' },
  giros: { nombre: 'Campos por giro', descripcion: 'Datos propios del tipo de negocio en cada producto (llantas, librería, ferretería…)' },
  fel: { nombre: 'Factura electrónica (FEL)', descripcion: 'Emitir facturas electrónicas certificadas ante la SAT' },
  finanzas: { nombre: 'Finanzas', descripcion: 'Salud financiera (estado de resultados, márgenes, punto de equilibrio) y gastos fuera de caja' },
};

/** Primer prefijo que coincide gana (de más específico a más general). */
const PREFIJOS: [string, string][] = [
  ['giros.', 'giros'],
  ['reportes.analitica.finanzas', 'finanzas'],
  ['gastos.', 'finanzas'],
  ['reportes.analitica', 'analitica'],
  ['reportes.', 'reportes'],
  ['rrhh.', 'rrhh'],
  ['inventario.trasladar', 'multisucursal'],
  ['sucursales.todas', 'multisucursal'],
  ['inventario.', 'inventario'],
  ['compras.', 'inventario'],
  ['ventas.', 'pos'],
  ['caja.', 'pos'],
  ['cierre.', 'pos'],
  ['descuentos.', 'pos'],
];

/** Módulo al que pertenece un permiso; null = núcleo (siempre incluido). */
export function moduloDe(permiso: string): string | null {
  return PREFIJOS.find(([p]) => permiso === p || permiso.startsWith(p))?.[1] ?? null;
}

/** Planes predefinidos (atajo para emitir licencias; una licencia puede listar módulos a medida). */
export const PLANES: Record<string, { nombre: string; modulos: string[]; reportesConfigurables: boolean }> = {
  BASICO: { nombre: 'Básico', modulos: ['pos', 'inventario'], reportesConfigurables: false },
  PROFESIONAL: { nombre: 'Profesional', modulos: ['pos', 'inventario', 'reportes', 'fel'], reportesConfigurables: true },
  // La marca blanca es un servicio aparte (licencia mensual): ningún plan la incluye
  EMPRESARIAL: { nombre: 'Empresarial', modulos: Object.keys(MODULOS).filter((m) => m !== 'sinmarca'), reportesConfigurables: true },
};
