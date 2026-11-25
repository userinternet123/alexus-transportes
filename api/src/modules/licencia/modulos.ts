/**
 * MÓDULOS VENDIBLES Y PLANES (ALEXUS Transportes)
 * Cada permiso pertenece a un módulo (por prefijo). Si la licencia no incluye
 * el módulo, el permiso no existe para nadie de esa empresa (ni para el
 * superadministrador): desaparece del menú y el API lo rechaza.
 * El núcleo (seguridad, catálogos, clientes, flota, configuración) siempre está incluido.
 * Debe coincidir con central/src/licencias.catalogo.ts (producto TRANSPORTES).
 */
export const MODULOS: Record<string, { nombre: string; descripcion: string }> = {
  viajes: { nombre: 'Viajes y cotizador', descripcion: 'Programación, costos, liquidación y ganancia por viaje; precio sugerido al cliente' },
  combustible: { nombre: 'Combustible', descripcion: 'Cargas, rendimiento km/gal por cabezal y piloto, alertas de consumo' },
  mantenimiento: { nombre: 'Mantenimiento y taller', descripcion: 'Planes por km o fecha, servicios mayores, reparaciones, repuestos por marca y alertas' },
  llantas: { nombre: 'Llantas', descripcion: 'Vida de cada llanta por posición, rotaciones, reencauches y costo por km por marca' },
  incidentes: { nombre: 'Incidentes y multas', descripcion: 'Multas, accidentes, robos y daños: costo, seguro, descuento al piloto y alertas de pago' },
  pilotos: { nombre: 'Pilotos', descripcion: 'Licencias de conducir con vencimiento, pago por viaje, viáticos y scorecard' },
  rrhh: { nombre: 'Recursos humanos', descripcion: 'Empleados, asistencia, horas extra, ausencias y planillas' },
  finanzas: { nombre: 'Finanzas', descripcion: 'Gastos de operación, costo por km, rentabilidad por viaje, cabezal, piloto y cliente' },
  reportes: { nombre: 'Reportes', descripcion: 'Centro de reportes con exportación a Excel' },
  tablero: { nombre: 'Tablero de gerencia', descripcion: 'Indicadores de la flota: costo e ingreso por km, utilización, km vacíos, entregas a tiempo' },
  multisede: { nombre: 'Varias sedes', descripcion: 'Operar desde varias bases con reportes consolidados' },
  sinmarca: { nombre: 'Sin marca ALEXUS', descripcion: 'Quitar "by ALEXUS" de liquidaciones, reportes y pantallas' },
};

/** Primer prefijo que coincide gana (de más específico a más general). */
const PREFIJOS: [string, string][] = [
  ['reportes.tablero', 'tablero'],
  ['reportes.', 'reportes'],
  ['rrhh.', 'rrhh'],
  ['sucursales.todas', 'multisede'],
  ['viajes.', 'viajes'],
  ['tarifas.', 'viajes'],
  ['combustible.', 'combustible'],
  ['mantenimiento.', 'mantenimiento'],
  ['llantas.', 'llantas'],
  ['pilotos.', 'pilotos'],
  ['incidentes.', 'incidentes'],
  ['gastos.', 'finanzas'],
  ['cobros.', 'finanzas'],
  ['finanzas.', 'finanzas'],
];

/** Módulo al que pertenece un permiso; null = núcleo (siempre incluido). */
export function moduloDe(permiso: string): string | null {
  return PREFIJOS.find(([p]) => permiso === p || permiso.startsWith(p))?.[1] ?? null;
}

/** Planes predefinidos (atajo para emitir licencias; una licencia puede listar módulos a medida). */
export const PLANES: Record<string, { nombre: string; modulos: string[]; reportesConfigurables: boolean }> = {
  BASICO: { nombre: 'Básico', modulos: ['viajes', 'combustible', 'pilotos'], reportesConfigurables: false },
  PROFESIONAL: { nombre: 'Profesional', modulos: ['viajes', 'combustible', 'pilotos', 'mantenimiento', 'llantas', 'incidentes', 'reportes', 'finanzas'], reportesConfigurables: true },
  // La marca blanca es un servicio aparte (licencia mensual): ningún plan la incluye
  EMPRESARIAL: { nombre: 'Empresarial', modulos: Object.keys(MODULOS).filter((m) => m !== 'sinmarca'), reportesConfigurables: true },
};
