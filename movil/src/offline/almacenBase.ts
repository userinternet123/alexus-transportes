// Almacenamiento local CIFRADO de la app del piloto. Sin dependencias de React Native: recibe la base de datos, la
// llave y el generador aleatorio, y por eso se prueba en la PC con SQLite real (`npm test`).
//
// Se guarda cifrado: «mi día» (viajes, clientes, cabezales), la cola de reportes y las FOTOS hasta que se envían.
// En claro quedan solo claves de fila, sucursal, usuario y fechas. Las fotos no pasan por la galería del teléfono.
import { cifrar, descifrar, type Aleatorio } from '../seguridad/cifrado'
import type { AlmacenCola, Pendiente } from './logica'

type Parametro = string | number | null | Uint8Array
/** Lo que se usa de la base de datos (expo-sqlite en el teléfono; SQLite de Node en las pruebas). */
export interface BaseDatos {
  execAsync(sql: string): Promise<void>
  runAsync(sql: string, ...parametros: Parametro[]): Promise<unknown>
  getAllAsync<T>(sql: string, ...parametros: Parametro[]): Promise<T[]>
  getFirstAsync<T>(sql: string, ...parametros: Parametro[]): Promise<T | null>
  withTransactionAsync(tarea: () => Promise<void>): Promise<void>
}

const VERSION_ESQUEMA = 1

export function crearAlmacen(db: BaseDatos, llave: Uint8Array, aleatorio: Aleatorio) {
  const sellar = (valor: unknown, contexto: string) => cifrar(llave, JSON.stringify(valor), aleatorio, contexto)
  /** null si no se puede abrir (otra llave, dato alterado, o texto sin cifrar que no debería estar ahí). */
  const abrir = <T>(dato: unknown, contexto: string): { valor: T } | null => {
    if (!(dato instanceof Uint8Array)) return null
    try { return { valor: JSON.parse(descifrar(llave, dato, contexto)) as T } } catch { return null }
  }
  const compactar = async () => {
    // Lo borrado no desaparece del archivo hasta compactarlo: se vacía el registro de cambios y se reescribe la base
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)')
    await db.execAsync('VACUUM')
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)')
  }

  let lista: Promise<void> | null = null
  const preparar = () => (lista ??= (async () => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS cache (clave TEXT PRIMARY KEY NOT NULL, valor BLOB NOT NULL, actualizado INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cola (clave TEXT PRIMARY KEY NOT NULL, sucursal INTEGER NOT NULL, usuario INTEGER NOT NULL, creado INTEGER NOT NULL, datos BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS fotos (clave TEXT PRIMARY KEY NOT NULL, creado INTEGER NOT NULL, datos BLOB NOT NULL);
    `)
    await db.execAsync(`PRAGMA user_version = ${VERSION_ESQUEMA}`)
  })().catch((e) => { lista = null; throw e }))

  return {
    preparar,

    async guardarCache(clave: string, valor: unknown) {
      await preparar()
      await db.runAsync('INSERT OR REPLACE INTO cache (clave, valor, actualizado) VALUES (?, ?, ?)', clave, sellar(valor, `cache:${clave}`), Date.now())
    },
    async leerCache<T>(clave: string): Promise<{ valor: T; actualizado: number } | null> {
      await preparar()
      const f = await db.getFirstAsync<{ valor: unknown; actualizado: number }>('SELECT valor, actualizado FROM cache WHERE clave = ?', clave)
      const abierto = f ? abrir<T>(f.valor, `cache:${clave}`) : null
      return abierto && f ? { valor: abierto.valor, actualizado: f.actualizado } : null
    },

    /** Foto (JPEG en base64) cifrada hasta que se envía. */
    async guardarFoto(clave: string, base64: string) {
      await preparar()
      await db.runAsync('INSERT OR REPLACE INTO fotos (clave, creado, datos) VALUES (?, ?, ?)', clave, Date.now(), cifrar(llave, base64, aleatorio, `foto:${clave}`))
    },
    async leerFoto(clave: string): Promise<string | null> {
      await preparar()
      const f = await db.getFirstAsync<{ datos: unknown }>('SELECT datos FROM fotos WHERE clave = ?', clave)
      if (!f || !(f.datos instanceof Uint8Array)) return null
      try { return descifrar(llave, f.datos, `foto:${clave}`) } catch { return null }
    },
    async borrarFotos(claves: string[]) {
      await preparar()
      for (const c of claves) await db.runAsync('DELETE FROM fotos WHERE clave = ?', c)
    },
    /** Fotos que ya no pertenecen a ningún reporte en la cola (p. ej. se tomaron y se canceló el formulario). */
    async fotosHuerfanas(usadas: Set<string>, antesDe: number): Promise<string[]> {
      await preparar()
      const filas = await db.getAllAsync<{ clave: string }>('SELECT clave FROM fotos WHERE creado < ?', antesDe)
      return filas.map((f) => f.clave).filter((c) => !usadas.has(c))
    },

    /** La cola de cada usuario en cada sede: lo capturado se envía con quien lo capturó y donde se capturó. */
    cola(sucursal: number, usuario: number): AlmacenCola & { borrar(clave: string): Promise<void> } {
      return {
        async listar() {
          await preparar()
          const filas = await db.getAllAsync<{ clave: string; datos: unknown }>('SELECT clave, datos FROM cola WHERE sucursal = ? AND usuario = ? ORDER BY creado DESC', sucursal, usuario)
          return filas.flatMap((f) => { const a = abrir<Pendiente>(f.datos, `cola:${f.clave}`); return a ? [a.valor] : [] })
        },
        async guardar(p: Pendiente) {
          await preparar()
          await db.runAsync('INSERT OR REPLACE INTO cola (clave, sucursal, usuario, creado, datos) VALUES (?, ?, ?, ?, ?)', p.clave, p.sucursal, p.usuario, p.creado, sellar(p, `cola:${p.clave}`))
        },
        async borrar(clave: string) {
          await preparar()
          await db.runAsync('DELETE FROM cola WHERE clave = ?', clave)
        },
      }
    },

    /** Al cerrar sesión: se borra lo que es solo de consulta. Lo que falta por enviar (y sus fotos) se conserva cifrado. */
    async borrarConsultas() {
      await preparar()
      await db.runAsync('DELETE FROM cache')
      await compactar()
    },
    /** «Borrar los datos de este teléfono»: todo, incluido lo que falta por enviar. */
    async borrarTodo() {
      await preparar()
      await db.withTransactionAsync(async () => { await db.runAsync('DELETE FROM cache'); await db.runAsync('DELETE FROM cola'); await db.runAsync('DELETE FROM fotos') })
      await compactar()
    },
  }
}
export type Almacen = ReturnType<typeof crearAlmacen>
