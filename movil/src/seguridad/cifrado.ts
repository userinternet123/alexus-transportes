// Cifrado de lo que la app guarda en el teléfono. SIN dependencias de React Native: se prueba en la PC (`npm test`).
//
// XChaCha20-Poly1305 (cifrado autenticado): además de ocultar el contenido, detecta cualquier alteración.
//  · Cada registro lleva un "nonce" aleatorio de 24 bytes: cifrar dos veces lo mismo da resultados distintos.
//  · El "contexto" (a qué fila pertenece) se autentica: un registro copiado a otra fila NO se puede abrir.
//  · Formato del sobre: [versión: 1 byte][nonce: 24 bytes][contenido cifrado + sello de 16 bytes]
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'

// Texto ⇄ bytes (UTF-8) hecho aquí, SIN TextEncoder/TextDecoder: no todos los motores de JavaScript de los teléfonos
// traen ambos, y de esta conversión depende poder leer todo lo guardado.
export function aBytes(texto: string): Uint8Array {
  const salida = new Uint8Array(texto.length * 3) // un carácter de JavaScript ocupa como máximo 3 bytes en UTF-8
  let n = 0
  for (let i = 0; i < texto.length; i++) {
    let c = texto.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < texto.length) { // par sustituto (emojis, etc.): se unen en un solo punto
      const bajo = texto.charCodeAt(i + 1)
      if (bajo >= 0xdc00 && bajo <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (bajo - 0xdc00); i++ }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd // sustituto suelto: igual que el estándar, se reemplaza
    if (c < 0x80) salida[n++] = c
    else if (c < 0x800) { salida[n++] = 0xc0 | (c >> 6); salida[n++] = 0x80 | (c & 0x3f) }
    else if (c < 0x10000) { salida[n++] = 0xe0 | (c >> 12); salida[n++] = 0x80 | ((c >> 6) & 0x3f); salida[n++] = 0x80 | (c & 0x3f) }
    else { salida[n++] = 0xf0 | (c >> 18); salida[n++] = 0x80 | ((c >> 12) & 0x3f); salida[n++] = 0x80 | ((c >> 6) & 0x3f); salida[n++] = 0x80 | (c & 0x3f) }
  }
  return salida.slice(0, n)
}
export function aTexto(bytes: Uint8Array): string {
  const partes: string[] = []
  let unidades: number[] = []
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++]
    let c = b
    if (b >= 0xf0) c = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)
    else if (b >= 0xe0) c = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)
    else if (b >= 0xc0) c = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f)
    if (c >= 0x10000) { c -= 0x10000; unidades.push(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff)) } else unidades.push(c)
    if (unidades.length >= 8192) { partes.push(String.fromCharCode.apply(null, unidades)); unidades = [] } // por trozos: no desborda la pila
  }
  partes.push(String.fromCharCode.apply(null, unidades))
  return partes.join('')
}

const VERSION = 1
const NONCE = 24
export const LARGO_LLAVE = 32
export type Aleatorio = (bytes: number) => Uint8Array

export function cifrar(llave: Uint8Array, texto: string, aleatorio: Aleatorio, contexto = ''): Uint8Array {
  if (llave.length !== LARGO_LLAVE) throw new Error('La llave de cifrado debe tener 32 bytes')
  const nonce = aleatorio(NONCE)
  if (nonce.length !== NONCE) throw new Error('El generador aleatorio no entregó 24 bytes')
  const cifrado = xchacha20poly1305(llave, nonce, aBytes(contexto)).encrypt(aBytes(texto))
  const sobre = new Uint8Array(1 + NONCE + cifrado.length)
  sobre[0] = VERSION
  sobre.set(nonce, 1)
  sobre.set(cifrado, 1 + NONCE)
  return sobre
}

/** Lanza un error si la llave no es la correcta, si el sobre fue alterado o si pertenece a otro contexto. */
export function descifrar(llave: Uint8Array, sobre: Uint8Array, contexto = ''): string {
  if (sobre.length < 1 + NONCE + 16 || sobre[0] !== VERSION) throw new Error('Dato cifrado con un formato desconocido')
  const nonce = sobre.subarray(1, 1 + NONCE)
  return aTexto(xchacha20poly1305(llave, nonce, aBytes(contexto)).decrypt(sobre.subarray(1 + NONCE)))
}
