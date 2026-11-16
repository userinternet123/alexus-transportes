#!/usr/bin/env node
/**
 * RESPALDOS CIFRADOS DE SPVI
 *
 * Cifrado híbrido:
 *   - Cada respaldo se cifra con una llave AES-256-GCM nueva y aleatoria.
 *   - Esa llave se "envuelve" con la LLAVE PÚBLICA RSA-4096 (OAEP-SHA256).
 *   - El servidor solo guarda la llave pública: puede CERRAR respaldos, pero no ABRIRLOS.
 *   - La LLAVE PRIVADA (protegida con una frase) la guarda el dueño fuera del servidor.
 * GCM detecta cualquier alteración del archivo (también de su encabezado).
 *
 * Uso:
 *   node respaldo-cripto.js generar   --publica <pem> --privada <pem>        (frase en SPVI_FRASE)
 *   node respaldo-cripto.js cifrar    --publica <pem> --entrada <dump> --salida <archivo.spvi>
 *   node respaldo-cripto.js descifrar --privada <pem> --entrada <archivo.spvi> --salida <dump>   (frase en SPVI_FRASE)
 *   node respaldo-cripto.js info      --entrada <archivo.spvi>
 *   node respaldo-cripto.js huella    --publica <pem>
 * La frase se pasa por variable de entorno (no por argumento) para que no aparezca en la lista de procesos.
 */
'use strict'
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')

const MAGIA = Buffer.from('SPVIBK1\n')
const TAG = 16
const OAEP = { padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }

function fallar(mensaje) {
  process.stderr.write(`ERROR: ${mensaje}\n`)
  process.exit(1)
}
function argumentos() {
  const a = {}
  const v = process.argv.slice(3)
  for (let i = 0; i < v.length; i++) {
    if (!v[i].startsWith('--')) continue
    const k = v[i].slice(2)
    if (v[i + 1] === undefined || v[i + 1].startsWith('--')) a[k] = true
    else a[k] = v[++i]
  }
  return a
}
const requerir = (a, ...claves) => { for (const k of claves) if (!a[k] || a[k] === true) fallar(`Falta --${k}`) }
const frase = () => {
  const f = process.env.SPVI_FRASE
  if (!f) fallar('Falta la frase de la llave (variable SPVI_FRASE)')
  return f
}
/** Huella corta y legible de una llave pública: sirve para saber qué llave abre qué respaldo. */
const huellaDe = (llave) => {
  // Acepta el texto PEM de una llave pública o un objeto de llave ya creado
  const publica = llave instanceof crypto.KeyObject && llave.type === 'public' ? llave : crypto.createPublicKey(llave)
  return crypto.createHash('sha256').update(publica.export({ type: 'spki', format: 'der' }))
    .digest('hex').slice(0, 32).toUpperCase().match(/.{4}/g).join('-')
}

function leerEncabezado(archivo) {
  const fd = fs.openSync(archivo, 'r')
  try {
    const buf = Buffer.alloc(64 * 1024)
    const leidos = fs.readSync(fd, buf, 0, buf.length, 0)
    if (leidos < MAGIA.length || !buf.subarray(0, MAGIA.length).equals(MAGIA)) fallar('El archivo no es un respaldo cifrado de SPVI')
    const fin = buf.indexOf(0x0a, MAGIA.length)
    if (fin < 0) fallar('Encabezado del respaldo dañado')
    const crudo = buf.subarray(MAGIA.length, fin)
    let datos
    try { datos = JSON.parse(crudo.toString('utf8')) } catch { fallar('Encabezado del respaldo dañado') }
    return { datos, crudo, inicio: fin + 1 }
  } finally { fs.closeSync(fd) }
}

async function generar(a) {
  requerir(a, 'publica', 'privada')
  const f = frase()
  if (f.length < 12) fallar('La frase debe tener al menos 12 caracteres')
  for (const ruta of [a.publica, a.privada]) if (fs.existsSync(ruta) && !a.forzar) fallar(`Ya existe ${ruta}: no se sobrescribe`)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: f },
  })
  fs.writeFileSync(a.publica, publicKey)
  fs.writeFileSync(a.privada, privateKey, { mode: 0o600 })
  process.stdout.write(JSON.stringify({ huella: huellaDe(publicKey) }) + '\n')
}

async function cifrar(a) {
  requerir(a, 'publica', 'entrada', 'salida')
  const publica = fs.readFileSync(a.publica, 'utf8')
  const llave = crypto.randomBytes(32)
  const iv = crypto.randomBytes(12)
  const encabezado = Buffer.from(JSON.stringify({
    v: 1, alg: 'aes-256-gcm', envoltura: 'rsa-oaep-sha256', huella: huellaDe(publica),
    llave: crypto.publicEncrypt({ key: publica, ...OAEP }, llave).toString('base64'),
    iv: iv.toString('base64'),
    original: path.basename(a.entrada), bytes: fs.statSync(a.entrada).size, creado: new Date().toISOString(),
  }))
  const cifrador = crypto.createCipheriv('aes-256-gcm', llave, iv)
  cifrador.setAAD(encabezado) // el encabezado también queda protegido contra cambios
  const parcial = `${a.salida}.parcial`
  fs.writeFileSync(parcial, Buffer.concat([MAGIA, encabezado, Buffer.from('\n')]))
  try {
    await pipeline(fs.createReadStream(a.entrada), cifrador, fs.createWriteStream(parcial, { flags: 'a' }))
    fs.appendFileSync(parcial, cifrador.getAuthTag())
    fs.renameSync(parcial, a.salida) // nunca queda un archivo a medias con el nombre final
  } catch (e) {
    fs.rmSync(parcial, { force: true })
    fallar(`No se pudo cifrar: ${e.message}`)
  }
}

async function descifrar(a) {
  requerir(a, 'privada', 'entrada', 'salida')
  const { datos, crudo, inicio } = leerEncabezado(a.entrada)
  let privada
  try { privada = crypto.createPrivateKey({ key: fs.readFileSync(a.privada, 'utf8'), passphrase: frase() }) } catch { fallar('Frase incorrecta o archivo de llave dañado') }
  if (huellaDe(crypto.createPublicKey(privada)) !== datos.huella) {
    fallar(`Esta llave no abre este respaldo (el respaldo pide la llave ${datos.huella})`)
  }
  let llave
  try { llave = crypto.privateDecrypt({ key: privada, ...OAEP }, Buffer.from(datos.llave, 'base64')) } catch { fallar('No se pudo abrir la llave del respaldo') }
  const total = fs.statSync(a.entrada).size
  if (total < inicio + TAG) fallar('El respaldo está incompleto')
  const etiqueta = Buffer.alloc(TAG)
  const fd = fs.openSync(a.entrada, 'r'); fs.readSync(fd, etiqueta, 0, TAG, total - TAG); fs.closeSync(fd)
  const descifrador = crypto.createDecipheriv('aes-256-gcm', llave, Buffer.from(datos.iv, 'base64'))
  descifrador.setAAD(crudo)
  descifrador.setAuthTag(etiqueta)
  const parcial = `${a.salida}.parcial`
  try {
    const lector = total - TAG > inicio
      ? fs.createReadStream(a.entrada, { start: inicio, end: total - TAG - 1 })
      : require('stream').Readable.from([])
    await pipeline(lector, descifrador, fs.createWriteStream(parcial))
    fs.renameSync(parcial, a.salida)
  } catch {
    fs.rmSync(parcial, { force: true })
    fallar('El respaldo está dañado o fue modificado: no se puede confiar en su contenido')
  }
}

function info(a) {
  requerir(a, 'entrada')
  const { datos } = leerEncabezado(a.entrada)
  process.stdout.write(JSON.stringify({ huella: datos.huella, creado: datos.creado, original: datos.original, bytes: datos.bytes }) + '\n')
}

const comandos = { generar, cifrar, descifrar, info, huella: (a) => { requerir(a, 'publica'); process.stdout.write(huellaDe(fs.readFileSync(a.publica, 'utf8')) + '\n') } }
const cmd = comandos[process.argv[2]]
if (!cmd) fallar(`Comando desconocido. Use: ${Object.keys(comandos).join(', ')}`)
Promise.resolve(cmd(argumentos())).catch((e) => fallar(e.message))
