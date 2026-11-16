// Prepara archivos para subir al API (máx. 3 MB): las fotos se reducen y
// comprimen en el navegador (una foto de celular de 4 MB queda en ~150-300 KB).
// Pensado para teléfonos con poca memoria: no convierte la foto original a texto,
// la decodifica ya reducida cuando el navegador lo permite y libera todo al terminar.
import api from '../services/api'

const leerComoDataUrl = (archivo) => new Promise((ok, falla) => {
  const r = new FileReader()
  r.onload = () => ok(r.result)
  r.onerror = () => falla(new Error('No se pudo leer el archivo'))
  r.readAsDataURL(archivo)
})

/** Carga la imagen desde una URL temporal (solo lee sus medidas; se decodifica al dibujar). */
const cargarImagen = (url) => new Promise((ok, falla) => {
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => ok(img)
  img.onerror = () => falla(new Error('No se pudo abrir la imagen. Si es una foto HEIC de iPhone, compártala como JPG o tómela desde aquí.'))
  img.src = url
})

/** Decodifica la foto ya reducida (mucha menos memoria). Si el navegador no puede, devuelve null. */
async function decodificarReducida(archivo, ancho, alto) {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bmp = await createImageBitmap(archivo, { resizeWidth: ancho, resizeHeight: alto, resizeQuality: 'high', imageOrientation: 'from-image' })
    // Si la rotación de la foto no coincide (algunos navegadores), se descarta para no deformarla
    if (Math.abs(bmp.width / bmp.height - ancho / alto) > 0.02) { bmp.close(); return null }
    return bmp
  } catch {
    return null
  }
}

/**
 * @param {File} archivo
 * @param {{ maxLado?: number, calidad?: number, conservarPng?: boolean }} op
 * @returns {Promise<{ nombre: string, mime: string, base64: string }>}
 */
export async function prepararArchivo(archivo, { maxLado = 1600, calidad = 0.75, conservarPng = false } = {}) {
  if (archivo.type === 'application/pdf') {
    if (archivo.size > 3 * 1024 * 1024) throw new Error('El PDF supera 3 MB')
    return { nombre: archivo.name, mime: archivo.type, base64: await leerComoDataUrl(archivo) }
  }
  if (archivo.type && !archivo.type.startsWith('image/')) throw new Error('Seleccione una imagen (JPG, PNG, WEBP) o un PDF')

  if (/hei[cf]/i.test(archivo.type) || /\.(heic|heif)$/i.test(archivo.name || '')) {
    throw new Error('Esta foto está en formato HEIC (el "ahorro de espacio" de la cámara del teléfono) y el navegador no puede abrirla. Cambie la cámara a JPG o elija otra foto.')
  }
  const url = URL.createObjectURL(archivo)
  let mapa = null
  const canvas = document.createElement('canvas')
  try {
    const img = await cargarImagen(url).catch(() => { throw new Error('No se pudo abrir la imagen. Use una foto JPG, PNG o WEBP.') })
    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight))
    const ancho = Math.max(1, Math.round(img.naturalWidth * escala))
    const alto = Math.max(1, Math.round(img.naturalHeight * escala))
    mapa = escala < 1 ? await decodificarReducida(archivo, ancho, alto) : null

    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext('2d')
    const png = conservarPng && archivo.type === 'image/png' // logos con transparencia
    if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ancho, alto) }
    ctx.drawImage(mapa ?? img, 0, 0, ancho, alto)
    img.src = '' // la foto original ya no se necesita

    const mime = png ? 'image/png' : 'image/jpeg'
    const blob = await new Promise((ok) => canvas.toBlob(ok, mime, calidad))
    if (!blob) throw new Error('El teléfono no tiene memoria suficiente para procesar la foto. Cierre otras aplicaciones o elija la foto desde la galería.')
    const nombre = (archivo.name || 'foto').replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg')
    return { nombre, mime, base64: await leerComoDataUrl(blob) }
  } finally {
    mapa?.close?.()
    canvas.width = 0 // libera la memoria del lienzo
    canvas.height = 0
    URL.revokeObjectURL(url)
  }
}

/** Comprime y sube. Devuelve el id del archivo en el API. */
export async function subirArchivo(archivo, opciones) {
  const datos = await prepararArchivo(archivo, opciones)
  const { data } = await api.post('/archivos', datos)
  return data.data.id
}

/** Comprime, sube y devuelve también la vista previa reducida (no la foto original). */
export async function subirImagen(archivo, opciones) {
  const datos = await prepararArchivo(archivo, opciones)
  const { data } = await api.post('/archivos', datos)
  return { id: data.data.id, vista: datos.base64 }
}

/** Abre un archivo privado (comprobante) en una pestaña nueva. */
export async function verArchivo(id) {
  const res = await api.get(`/archivos/${id}`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
