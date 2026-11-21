// Almacenamiento local del teléfono: SQLite + cifrado (ver almacenBase.ts). Las pantallas usan estas funciones.
import * as SQLite from 'expo-sqlite'
import { aleatorio, borrarLlave, llaveDeDatos } from '../seguridad/llave'
import { crearAlmacen, type Almacen } from './almacenBase'
import type { AlmacenCola, Pendiente } from './logica'

let abierto: Promise<Almacen> | null = null
const base = () => (abierto ??= (async () => {
  const almacen = crearAlmacen(await SQLite.openDatabaseAsync('piloto.db'), await llaveDeDatos(), aleatorio)
  await almacen.preparar()
  return almacen
})().catch((e) => { abierto = null; throw e }))

export const guardarCache = async (clave: string, valor: unknown) => (await base()).guardarCache(clave, valor)
export const leerCache = async <T>(clave: string) => (await base()).leerCache<T>(clave)
export const guardarFoto = async (clave: string, base64: string) => (await base()).guardarFoto(clave, base64)
export const leerFoto = async (clave: string) => (await base()).leerFoto(clave)
export const borrarFotos = async (claves: string[]) => (await base()).borrarFotos(claves)

export function almacenCola(sucursal: number, usuario: number): AlmacenCola & { borrar(clave: string): Promise<void> } {
  return {
    listar: async () => (await base()).cola(sucursal, usuario).listar(),
    guardar: async (p: Pendiente) => (await base()).cola(sucursal, usuario).guardar(p),
    borrar: async (clave: string) => (await base()).cola(sucursal, usuario).borrar(clave),
  }
}

/**
 * Limpieza: lo enviado hace más de 7 días sale de la lista (sigue en el servidor) y se borran las fotos que ya no
 * pertenecen a ningún reporte por enviar (enviadas, o de un formulario que se canceló hace más de un día).
 */
export async function limpiar(sucursal: number, usuario: number, ahora = Date.now()) {
  const cola = almacenCola(sucursal, usuario)
  const lista = await cola.listar()
  for (const p of lista) if (p.estado === 'enviada' && ahora - p.creado > 7 * 86_400_000) await cola.borrar(p.clave)
  const usadas = new Set(lista.filter((p) => p.estado !== 'enviada').flatMap((p) => p.fotos.map((f) => f.clave)))
  const a = await base()
  await a.borrarFotos(await a.fotosHuerfanas(usadas, ahora - 86_400_000))
}

/** Al cerrar sesión: «mi día» fuera. Lo que falta por enviar se conserva cifrado. */
export const borrarConsultas = async () => (await base()).borrarConsultas()

/** Borra TODO lo guardado en el teléfono y destruye la llave (la próxima vez se crea una nueva). */
export async function borrarTodoLocal() {
  await (await base()).borrarTodo()
  await borrarLlave()
  abierto = null
}
