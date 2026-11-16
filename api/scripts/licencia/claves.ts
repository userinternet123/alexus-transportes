/**
 * PROVEEDOR: genera el par de claves Ed25519 para firmar licencias (una sola vez).
 *   npm run licencia:claves
 * - Clave PRIVADA: ~/.spvi-licencias/privada.pem  →  guárdela fuera del repositorio y respáldela.
 *   Quien la tenga puede emitir licencias.
 * - Clave PÚBLICA: se escribe en src/modules/licencia/clave-publica.ts (va dentro del sistema).
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const carpeta = process.env.SPVI_LICENCIAS_DIR ?? join(homedir(), '.spvi-licencias');
const privada = join(carpeta, 'privada.pem');
if (existsSync(privada) && !process.argv.includes('--forzar')) {
  console.error(`Ya existe ${privada}. Generar otra invalida TODAS las licencias emitidas. Use --forzar si está seguro.`);
  process.exit(1);
}
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
mkdirSync(carpeta, { recursive: true, mode: 0o700 });
writeFileSync(privada, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim();
const destino = join(__dirname, '../../src/modules/licencia/clave-publica.ts');
writeFileSync(destino, `/**
 * Clave pública Ed25519 con la que se verifican las licencias.
 * Generada con: npm run licencia:claves  (la privada NO está en el repositorio)
 */
export const CLAVE_PUBLICA_LICENCIAS = \`${pem}\`;
`);
console.log(`✔ Clave privada: ${privada}  (respáldela en un lugar seguro)`);
console.log(`✔ Clave pública escrita en src/modules/licencia/clave-publica.ts`);
console.log('  A partir de la próxima versión, el sistema exigirá licencia.');
