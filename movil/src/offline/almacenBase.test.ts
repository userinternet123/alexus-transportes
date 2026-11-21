// Pruebas del almacenamiento cifrado contra SQLite REAL (el de Node): se guarda en un archivo y se revisan sus bytes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { crearAlmacen, type BaseDatos } from './almacenBase'
import { nuevoPendiente } from './logica'

const aleatorio = (n: number) => new Uint8Array(randomBytes(n))
const carpeta = mkdtempSync(join(tmpdir(), 'piloto-almacen-'))
let n = 0
const rutaNueva = () => join(carpeta, `prueba-${++n}.db`)
function abrirBase(ruta: string): BaseDatos {
  const d = new DatabaseSync(ruta)
  return {
    execAsync: async (sql) => { d.exec(sql) },
    runAsync: async (sql, ...p) => d.prepare(sql).run(...p),
    getAllAsync: async <T,>(sql: string, ...p: (string | number | null | Uint8Array)[]) => d.prepare(sql).all(...p) as T[],
    getFirstAsync: async <T,>(sql: string, ...p: (string | number | null | Uint8Array)[]) => (d.prepare(sql).get(...p) ?? null) as T | null,
    withTransactionAsync: async (tarea) => { d.exec('BEGIN'); try { await tarea(); d.exec('COMMIT') } catch (e) { d.exec('ROLLBACK'); throw e } },
  }
}
const enDisco = (ruta: string) => Buffer.concat([ruta, `${ruta}-wal`].filter(existsSync).map((f) => readFileSync(f)))

test('la cola, «mi día» y las fotos quedan cifrados en disco y se leen de vuelta', async () => {
  const ruta = rutaNueva()
  const llave = aleatorio(32)
  const a = crearAlmacen(abrirBase(ruta), llave, aleatorio)
  const p = nuevoPendiente({ clave: 'k1', tipo: 'caso', sucursal: 1, usuario: 7, titulo: 'Manguera reventada en Tecpán', carga: { titulo: 'Manguera reventada en Tecpán' } })
  await a.cola(1, 7).guardar(p)
  await a.guardarCache('midia', { cliente: 'Cementos del Norte' })
  const foto = Buffer.from('FOTO-JPEG-PRIVADA-'.repeat(50)).toString('base64')
  await a.guardarFoto('f1', foto)
  const disco = enDisco(ruta)
  for (const texto of ['Tecpán', 'Cementos del Norte', foto.slice(0, 40)]) assert.equal(disco.includes(Buffer.from(texto)), false, `quedó en claro: ${texto}`)
  assert.equal((await a.cola(1, 7).listar())[0].titulo, 'Manguera reventada en Tecpán')
  assert.equal((await a.leerCache<{ cliente: string }>('midia'))?.valor.cliente, 'Cementos del Norte')
  assert.equal(await a.leerFoto('f1'), foto)
  assert.deepEqual(await a.cola(1, 8).listar(), []) // otro usuario no ve la cola
})

test('con otra llave no se abre nada; cerrar sesión conserva lo pendiente y borrar todo lo elimina', async () => {
  const ruta = rutaNueva()
  const a = crearAlmacen(abrirBase(ruta), aleatorio(32), aleatorio)
  await a.cola(1, 7).guardar(nuevoPendiente({ clave: 'k', tipo: 'caso', sucursal: 1, usuario: 7, titulo: 't', carga: {} }))
  await a.guardarFoto('f', 'abc')
  await a.guardarCache('midia', { x: 1 })
  const intruso = crearAlmacen(abrirBase(ruta), aleatorio(32), aleatorio)
  assert.deepEqual(await intruso.cola(1, 7).listar(), [])
  assert.equal(await intruso.leerFoto('f'), null)
  await a.borrarConsultas()
  assert.equal(await a.leerCache('midia'), null)
  assert.equal((await a.cola(1, 7).listar()).length, 1)
  assert.equal(await a.leerFoto('f'), 'abc')
  assert.deepEqual(await a.fotosHuerfanas(new Set(), Date.now() + 1), ['f'])
  await a.borrarTodo()
  assert.equal((await a.cola(1, 7).listar()).length, 0)
  assert.equal(await a.leerFoto('f'), null)
})
