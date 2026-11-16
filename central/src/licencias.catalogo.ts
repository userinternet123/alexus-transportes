/**
 * Lo que se puede vender en una licencia (debe coincidir con apps/api/src/modules/licencia/modulos.ts) y los planes de inicio.
 */
export const MODULOS: Record<string, string> = {
  pos: 'Punto de venta y caja', inventario: 'Inventario y compras', reportes: 'Reportes', analitica: 'Dashboard analítico y temporadas',
  rrhh: 'Recursos humanos', multisucursal: 'Varias sucursales (traslados)', ia: 'Lectura de facturas y listas con IA', fel: 'Factura electrónica (FEL)',
  finanzas: 'Finanzas (salud financiera y gastos)', giros: 'Campos por giro', sinmarca: 'Sin marca ALEXUS (servicio mensual)',
};
export type Limites = { sucursales: number | null; bodegas: number | null; cajas: number | null; usuarios: number | null };
export const PLANES_INICIO: { clave: string; nombre: string; modulos: string[]; reportesConfigurables: boolean; limites: Limites }[] = [
  { clave: 'BASICO', nombre: 'Básico', modulos: ['pos', 'inventario'], reportesConfigurables: false, limites: { sucursales: 1, bodegas: 1, cajas: 1, usuarios: 3 } },
  { clave: 'PROFESIONAL', nombre: 'Profesional', modulos: ['pos', 'inventario', 'reportes', 'fel'], reportesConfigurables: true, limites: { sucursales: 2, bodegas: 4, cajas: 4, usuarios: 10 } },
  { clave: 'EMPRESARIAL', nombre: 'Empresarial', modulos: Object.keys(MODULOS).filter((m) => m !== 'sinmarca'), reportesConfigurables: true, limites: { sucursales: null, bodegas: null, cajas: null, usuarios: null } },
];
export const CODIGO_EQUIPO = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/;
