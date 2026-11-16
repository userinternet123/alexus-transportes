/**
 * SOBRE CIFRADO (instalación → ALEXUS Central). Lo cierra la tienda con la llave PÚBLICA de Central y solo lo abre Central con
 * su llave privada: ni Cloudflare ni nadie en el camino puede leerlo ni alterarlo (AES-256-GCM autentica).
 * Esquema: gzip → AES-256-GCM con una llave al azar por envío → esa llave cifrada con RSA-4096 OAEP-SHA256.
 */
import { constants, createCipheriv, createDecipheriv, createHash, createPublicKey, privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

export interface Sobre { v: 1; alg: 'RSA-OAEP-256+A256GCM'; comp: 'gzip'; huella: string; llave: string; iv: string; tag: string; datos: string }
const B = (x: Buffer) => x.toString('base64');

/** Huella corta de una llave pública (para fijarla y detectar si alguien la cambia). */
export const huellaDe = (publicaPem: string) => createHash('sha256').update(createPublicKey(publicaPem).export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 32);

export function cerrarSobre(contenido: unknown, publicaPem: string): Sobre {
  const clave = randomBytes(32); const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave, iv);
  const datos = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(contenido), 'utf8'))), c.final()]);
  const llave = publicEncrypt({ key: publicaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, clave);
  return { v: 1, alg: 'RSA-OAEP-256+A256GCM', comp: 'gzip', huella: huellaDe(publicaPem), llave: B(llave), iv: B(iv), tag: B(c.getAuthTag()), datos: B(datos) };
}

export function abrirSobre<T = unknown>(s: Sobre, privadaPem: string, maxBytes = 5_000_000): T {
  if (s?.v !== 1 || s.alg !== 'RSA-OAEP-256+A256GCM') throw new Error('Sobre de una versión desconocida');
  const clave = privateDecrypt({ key: privadaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(s.llave, 'base64'));
  const d = createDecipheriv('aes-256-gcm', clave, Buffer.from(s.iv, 'base64'));
  d.setAuthTag(Buffer.from(s.tag, 'base64'));
  const plano = gunzipSync(Buffer.concat([d.update(Buffer.from(s.datos, 'base64')), d.final()]), { maxOutputLength: maxBytes });
  return JSON.parse(plano.toString('utf8')) as T;
}
