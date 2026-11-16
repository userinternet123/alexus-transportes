/**
 * CÓDIGO DEL EQUIPO: identifica el servidor de la tienda para atarle la licencia (una licencia copiada a otra PC no sirve).
 * Sale del identificador que el sistema operativo asigna a la instalación (Windows: MachineGuid; Linux: machine-id), que no
 * cambia al cambiar disco, memoria o tarjeta de red; solo al reinstalar el sistema (ahí se transfiere desde SPVI Central).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';

const BASE32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para dictarlo sin errores
let cache: string | null = null;

function identificador(): string {
  if (process.env.SPVI_EQUIPO_ID) return `env:${process.env.SPVI_EQUIPO_ID}`; // pruebas y contenedores
  if (process.platform === 'win32') {
    try {
      const salida = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(salida);
      if (m) return `win:${m[1].toLowerCase()}`;
    } catch { /* sigue con lo siguiente */ }
  }
  for (const ruta of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try { const id = readFileSync(ruta, 'utf8').trim(); if (id) return `linux:${id}`; } catch { /* siguiente */ }
  }
  return `host:${hostname()}`;
}

/** "K7QM-2XPA-…" (16 caracteres): lo que la tienda le dicta a ALEXUS para emitir una licencia por archivo. */
export function codigoDeEquipo(id = identificador()): string {
  const h = createHash('sha256').update(`spvi-equipo:${id}`).digest();
  let bits = 0; let valor = 0; let salida = '';
  for (const byte of h) {
    valor = (valor << 8) | byte; bits += 8;
    while (bits >= 5 && salida.length < 16) { salida += BASE32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
    if (salida.length >= 16) break;
  }
  return salida.match(/.{4}/g)!.join('-');
}

export function huellaEquipo(): string {
  if (!cache) cache = codigoDeEquipo();
  return cache;
}
