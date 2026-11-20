import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { aBytes, aTexto, cifrar, descifrar } from './cifrado'

const aleatorio = (n: number) => new Uint8Array(randomBytes(n))
const llave = aleatorio(32)
const contiene = (pajar: Uint8Array, aguja: string) => Buffer.from(pajar).includes(Buffer.from(aguja, 'utf8'))

test('ida y vuelta, con tildes, eñes y emojis', () => {
  const texto = JSON.stringify({ cliente: 'María Núñez', nit: '1234567K', nota: 'Cotización ✔ útiles 📚' })
  assert.equal(descifrar(llave, cifrar(llave, texto, aleatorio, 'cola:k1'), 'cola:k1'), texto)
  assert.equal(descifrar(llave, cifrar(llave, '', aleatorio)), '')
})
test('lo cifrado no deja ver el contenido', () => {
  const sobre = cifrar(llave, 'María Núñez NIT 1234567K total 1500.75', aleatorio, 'x')
  for (const pista of ['María', 'Núñez', '1234567K', '1500.75', 'NIT']) assert.equal(contiene(sobre, pista), false, pista)
})
test('cifrar dos veces lo mismo da sobres distintos (no se puede saber si dos registros son iguales)', () => {
  const a = cifrar(llave, 'lo mismo', aleatorio, 'x'), b = cifrar(llave, 'lo mismo', aleatorio, 'x')
  assert.notDeepEqual(a, b); assert.equal(a.length, b.length)
})
test('con otra llave NO se abre', () => {
  assert.throws(() => descifrar(aleatorio(32), cifrar(llave, 'secreto', aleatorio, 'x'), 'x'))
})
test('si se altera UN solo bit (del contenido, del sello o del nonce) NO se abre', () => {
  const sobre = cifrar(llave, 'total 100.00', aleatorio, 'x')
  for (const pos of [1, 10, 25, 30, sobre.length - 1]) { const malo = Uint8Array.from(sobre); malo[pos] ^= 1; assert.throws(() => descifrar(llave, malo, 'x'), `posición ${pos}`) }
})
test('un registro copiado a otra fila NO se abre (el contexto va sellado)', () => {
  const sobre = cifrar(llave, '{"total":10}', aleatorio, 'cola:cotizacion-A')
  assert.throws(() => descifrar(llave, sobre, 'cola:cotizacion-B'))
  assert.throws(() => descifrar(llave, sobre, ''))
})
test('sobres truncados, vacíos o de otra versión se rechazan sin romper nada', () => {
  const sobre = cifrar(llave, 'hola', aleatorio)
  assert.throws(() => descifrar(llave, sobre.subarray(0, 20))); assert.throws(() => descifrar(llave, new Uint8Array(0)))
  const otraVersion = Uint8Array.from(sobre); otraVersion[0] = 9; assert.throws(() => descifrar(llave, otraVersion), /formato desconocido/)
})
test('llave de tamaño incorrecto o generador aleatorio defectuoso: se niega a cifrar', () => {
  assert.throws(() => cifrar(aleatorio(16), 'x', aleatorio), /32 bytes/)
  assert.throws(() => cifrar(llave, 'x', () => new Uint8Array(8)), /24 bytes/)
})
test('un catálogo grande (≈2 MB) se cifra y descifra completo', () => {
  const grande = JSON.stringify(Array.from({ length: 10000 }, (_, i) => ({ id: i, sku: `SKU-${i}`, nombre: `Cuaderno universitario cuadriculado 100 hojas modelo ${i}`, precioVenta: 12.5 + i, existencia: i % 50, marca: 'Scribe', presentacion: 'Unidad' })))
  const t0 = performance.now(); const sobre = cifrar(llave, grande, aleatorio, 'c'); const t1 = performance.now(); const vuelta = descifrar(llave, sobre, 'c'); const t2 = performance.now()
  assert.equal(vuelta, grande)
  console.log(`      ${(grande.length / 1e6).toFixed(1)} MB: cifrar ${Math.round(t1 - t0)} ms, descifrar ${Math.round(t2 - t1)} ms (en esta PC; un teléfono será más lento)`)
})

// ── Conversión de texto propia: debe dar EXACTAMENTE lo mismo que la estándar ──
const muestras = ['', 'Cotizacion simple 123', 'María Núñez — «útiles» ¿sí? ¡ya!', 'Q 1,234.50 ± 5 % → ok ✔', '📚🧮 emojis 👩‍👩‍👧‍👦 y 🇬🇹', '日本語 한국어 العربية עברית ไทย', 'salto\nde línea\ty tab \u0000 nulo', '\u007f\u0080߿ࠀ￿ límites', '𝒜𝓁𝑒𝓍𝓊𝓈 fuera del plano básico']
test('texto → bytes: idéntico al estándar (TextEncoder) en cada muestra', () => {
  for (const m of muestras) assert.deepEqual(aBytes(m), new Uint8Array(new TextEncoder().encode(m)), JSON.stringify(m))
})
test('bytes → texto: idéntico al estándar (TextDecoder), y la ida y vuelta devuelve el original', () => {
  for (const m of muestras) { const b = new TextEncoder().encode(m); assert.equal(aTexto(b), new TextDecoder().decode(b), JSON.stringify(m)); assert.equal(aTexto(aBytes(m)), m) }
})
test('un texto de 2 MB con todo tipo de caracteres: mismo resultado que el estándar y sin desbordar la pila', () => {
  const trozos: string[] = []; for (let i = 0; i < 60000; i++) trozos.push(`${i}:Cuaderno ñandú ${String.fromCodePoint(0x1f600 + (i % 60))} ${String.fromCharCode(0x4e00 + (i % 500))} Q${(i * 1.37).toFixed(2)};`)
  const grande = trozos.join('')
  assert.ok(grande.length > 1_500_000)
  const propio = aBytes(grande); const estandar = new Uint8Array(new TextEncoder().encode(grande))
  assert.equal(Buffer.compare(Buffer.from(propio), Buffer.from(estandar)), 0); assert.equal(aTexto(estandar), grande)
})
test('un sustituto suelto (texto dañado) se trata igual que el estándar', () => {
  for (const raro of ['a\ud800b', '\udc00', 'fin\ud83d']) assert.deepEqual(aBytes(raro), new Uint8Array(new TextEncoder().encode(raro)), JSON.stringify(raro))
})
test('el cifrado no usa TextEncoder ni TextDecoder: funciona aunque el motor no los tenga', () => {
  const g = globalThis as unknown as Record<string, unknown>; const E = g.TextEncoder, D = g.TextDecoder
  g.TextEncoder = undefined; g.TextDecoder = undefined
  try { const sobre = cifrar(llave, 'María Núñez 📚', aleatorio, 'cola:k'); assert.equal(descifrar(llave, sobre, 'cola:k'), 'María Núñez 📚') } finally { g.TextEncoder = E; g.TextDecoder = D }
})
