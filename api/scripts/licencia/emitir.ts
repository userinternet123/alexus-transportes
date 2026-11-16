/**
 * PROVEEDOR: emite la licencia de una empresa.
 *   npm run licencia:emitir -- --empresa "Abarrotería Denisse" --nit 1234567K --plan PROFESIONAL --vence 2027-12-31
 * Opcionales:
 *   --modulos pos,inventario,reportes        (a la medida; reemplaza los del plan)
 *   --agregar giros,ia                       (paquetes adicionales sobre los del plan)
 *   --reportes ventas-por-dia,cuadre-cajas   (solo esos reportes; por defecto todos los del plan)
 *   --usuarios 10 --sucursales 1
 * Escribe <nit>-<plan>.lic: el cliente lo pega en Administración › Licencia y módulos.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const PLANES: Record<string, { modulos: string[]; reportesConfigurables: boolean; usuarios: number; sucursales: number }> = {
  BASICO: { modulos: ['pos', 'inventario'], reportesConfigurables: false, usuarios: 3, sucursales: 1 },
  PROFESIONAL: { modulos: ['pos', 'inventario', 'reportes'], reportesConfigurables: true, usuarios: 10, sucursales: 1 },
  EMPRESARIAL: { modulos: ['pos', 'inventario', 'reportes', 'analitica', 'rrhh', 'multisucursal', 'ia', 'giros'], reportesConfigurables: true, usuarios: 50, sucursales: 10 },
};
const MODULOS = new Set([...PLANES.EMPRESARIAL.modulos, 'sinmarca']); // sinmarca solo se agrega a medida: --agregar sinmarca

const { values: a } = parseArgs({
  options: {
    empresa: { type: 'string' }, nit: { type: 'string' }, plan: { type: 'string' }, vence: { type: 'string' },
    modulos: { type: 'string' }, agregar: { type: 'string' }, reportes: { type: 'string' }, usuarios: { type: 'string' }, sucursales: { type: 'string' },
    clave: { type: 'string' },
  },
});
const plan = (a.plan ?? '').toUpperCase();
if (!a.empresa || !a.nit || !PLANES[plan] || !/^\d{4}-\d{2}-\d{2}$/.test(a.vence ?? '')) {
  console.error('Uso: --empresa "Nombre" --nit 1234567K --plan BASICO|PROFESIONAL|EMPRESARIAL --vence AAAA-MM-DD [--modulos a,b] [--agregar giros,sinmarca] [--reportes x,y] [--usuarios N] [--sucursales N]');
  process.exit(1);
}
const base = a.modulos ? a.modulos.split(',').map((m) => m.trim()) : PLANES[plan].modulos;
// Paquetes adicionales (por ejemplo: --agregar giros) sobre los módulos del plan
const modulos = [...new Set([...base, ...(a.agregar ? a.agregar.split(',').map((m) => m.trim()) : [])])];
const desconocidos = modulos.filter((m) => !MODULOS.has(m));
if (desconocidos.length) { console.error(`Módulos desconocidos: ${desconocidos.join(', ')}`); process.exit(1); }

const licencia = {
  v: 1,
  empresa: a.empresa,
  nit: a.nit.toUpperCase(),
  plan,
  modulos,
  reportes: a.reportes ? a.reportes.split(',').map((r) => r.trim()) : '*',
  reportesConfigurables: PLANES[plan].reportesConfigurables,
  maxSucursales: Number(a.sucursales ?? PLANES[plan].sucursales),
  maxUsuarios: Number(a.usuarios ?? PLANES[plan].usuarios),
  emitida: new Date().toISOString().slice(0, 10),
  vence: a.vence,
};
const clave = createPrivateKey(readFileSync(a.clave ?? join(process.env.SPVI_LICENCIAS_DIR ?? join(homedir(), '.spvi-licencias'), 'privada.pem')));
const datos = Buffer.from(JSON.stringify(licencia)).toString('base64url');
const token = `${datos}.${sign(null, Buffer.from(datos), clave).toString('base64url')}`;
const archivo = `${licencia.nit}-${plan}.lic`;
writeFileSync(archivo, token + '\n');
console.log(JSON.stringify(licencia, null, 2));
console.log(`\n✔ Licencia escrita en ${archivo}`);
