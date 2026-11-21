// La llave que cifra los datos guardados en el teléfono. Se crea al azar la primera vez y vive en el almacén seguro
// (Android Keystore): no sale del teléfono, no va en las copias de seguridad y el archivo de la base no sirve sin ella.
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js'
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { LARGO_LLAVE } from './cifrado'

const NOMBRE = 'alexus_piloto_llave'
let enMemoria: Uint8Array | null = null

export const aleatorio = (bytes: number) => Crypto.getRandomBytes(bytes)

/** Si el almacén seguro falla, se lanza el error: NUNCA se guarda nada sin cifrar ni se reemplaza la llave a ciegas. */
export async function llaveDeDatos(): Promise<Uint8Array> {
  if (enMemoria) return enMemoria
  const guardada = await SecureStore.getItemAsync(NOMBRE)
  if (guardada && /^[0-9a-f]{64}$/.test(guardada)) return (enMemoria = hexToBytes(guardada))
  const nueva = aleatorio(LARGO_LLAVE)
  await SecureStore.setItemAsync(NOMBRE, bytesToHex(nueva))
  return (enMemoria = nueva)
}
export async function borrarLlave() {
  enMemoria = null
  await SecureStore.deleteItemAsync(NOMBRE)
}
