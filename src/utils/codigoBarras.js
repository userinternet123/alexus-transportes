// ─────────────────────────────────────────────────────────────────────────────
// CÓDIGOS DE BARRAS sin librerías: EAN-13, EAN-8, UPC-A y Code 128 (B y C), en SVG y en etiquetas.
// La tabla de patrones de Code 128 proviene de JsBarcode (licencia MIT, © Johan Lindell). Todo se verificó
// contra su salida y, además, dibujando los códigos y leyéndolos con un lector (ZXing).
// ─────────────────────────────────────────────────────────────────────────────

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
// Cuáles de los 6 dígitos de la izquierda usan el juego L o G, según el primer dígito (así se "esconde" el primer dígito)
const PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
const CODE128 = ["11011001100","11001101100","11001100110","10010011000","10010001100","10001001100","10011001000","10011000100","10001100100","11001001000","11001000100","11000100100","10110011100","10011011100","10011001110","10111001100","10011101100","10011100110","11001110010","11001011100","11001001110","11011100100","11001110100","11101101110","11101001100","11100101100","11100100110","11101100100","11100110100","11100110010","11011011000","11011000110","11000110110","10100011000","10001011000","10001000110","10110001000","10001101000","10001100010","11010001000","11000101000","11000100010","10110111000","10110001110","10001101110","10111011000","10111000110","10001110110","11101110110","11010001110","11000101110","11011101000","11011100010","11011101110","11101011000","11101000110","11100010110","11101101000","11101100010","11100011010","11101111010","11001000010","11110001010","10100110000","10100001100","10010110000","10010000110","10000101100","10000100110","10110010000","10110000100","10011010000","10011000010","10000110100","10000110010","11000010010","11001010000","11110111010","11000010100","10001111010","10100111100","10010111100","10010011110","10111100100","10011110100","10011110010","11110100100","11110010100","11110010010","11011011110","11011110110","11110110110","10101111000","10100011110","10001011110","10111101000","10111100010","11110101000","11110100010","10111011110","10111101110","11101011110","11110101110","11010000100","11010010000","11010011100","1100011101011"]
const START_B = 104
const START_C = 105
const STOP = 106

/** Dígito verificador (EAN-13: 12 dígitos · EAN-8: 7 · UPC-A: 11). El último dígito del cuerpo pesa 3, y se alterna. */
export function digitoVerificador(cuerpo) {
  let suma = 0
  for (let i = 0; i < cuerpo.length; i += 1) suma += Number(cuerpo[i]) * ((cuerpo.length - 1 - i) % 2 === 0 ? 3 : 1)
  return (10 - (suma % 10)) % 10
}
export const esValido = (c) => /^(\d{8}|\d{12}|\d{13})$/.test(c) && digitoVerificador(c.slice(0, -1)) === Number(c.slice(-1))

/** Qué tipo de código se dibuja: EAN/UPC si es un número válido de 13, 12 u 8 dígitos; si no, Code 128 (sirve para cualquier texto). */
export function detectar(codigo) {
  const c = String(codigo ?? '').trim()
  if (!c) throw new Error('No hay código para imprimir')
  if (/^\d{13}$/.test(c) && esValido(c)) return { formato: 'EAN13', valor: c }
  if (/^\d{12}$/.test(c) && esValido(c)) return { formato: 'EAN13', valor: `0${c}` } // UPC-A = EAN-13 con un 0 al inicio
  if (/^\d{8}$/.test(c) && esValido(c)) return { formato: 'EAN8', valor: c }
  if (!/^[\x20-\x7e]+$/.test(c)) throw new Error('El código tiene caracteres que no se pueden imprimir como código de barras (use letras sin tilde, números y signos comunes)')
  if (c.length > 40) throw new Error('El código es demasiado largo para una etiqueta (máximo 40 caracteres)')
  return { formato: 'CODE128', valor: c }
}

function ean13(valor) {
  const par = PARIDAD[Number(valor[0])]
  let bits = '101'
  for (let i = 0; i < 6; i += 1) bits += (par[i] === 'L' ? L : G)[Number(valor[i + 1])]
  bits += '01010'
  for (let i = 7; i < 13; i += 1) bits += R[Number(valor[i])]
  return `${bits}101`
}
function ean8(valor) {
  let bits = '101'
  for (let i = 0; i < 4; i += 1) bits += L[Number(valor[i])]
  bits += '01010'
  for (let i = 4; i < 8; i += 1) bits += R[Number(valor[i])]
  return `${bits}101`
}
function code128(texto) {
  const numerico = /^\d+$/.test(texto) && texto.length % 2 === 0 && texto.length >= 4 // pares de dígitos: más compacto (juego C)
  const inicio = numerico ? START_C : START_B
  const valores = numerico
    ? Array.from({ length: texto.length / 2 }, (_, i) => Number(texto.slice(i * 2, i * 2 + 2)))
    : Array.from(texto, (ch) => ch.charCodeAt(0) - 32)
  const control = (inicio + valores.reduce((s, v, i) => s + v * (i + 1), 0)) % 103
  return [inicio, ...valores, control, STOP].map((v) => CODE128[v]).join('')
}

/** { formato, valor, texto, bits }: "bits" es la secuencia de módulos (1 = barra, 0 = espacio). */
export function codificar(codigo) {
  const { formato, valor } = detectar(codigo)
  const bits = formato === 'EAN13' ? ean13(valor) : formato === 'EAN8' ? ean8(valor) : code128(valor)
  return { formato, valor, texto: valor, bits }
}

const escXml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** SVG del código. modulo = ancho de cada módulo en unidades; la zona en blanco a los lados es de 10 módulos. */
export function svgCodigo(codigo, { modulo = 2, alto = 60, conTexto = true } = {}) {
  const { bits, texto, formato } = codificar(codigo)
  const margen = 10
  const ancho = (bits.length + margen * 2) * modulo
  const altoTexto = conTexto ? 16 : 0
  let trazo = ''
  for (let i = 0; i < bits.length;) {
    if (bits[i] === '0') { i += 1; continue }
    let j = i
    while (j < bits.length && bits[j] === '1') j += 1
    trazo += `M${(i + margen) * modulo} 0h${(j - i) * modulo}v${alto}h-${(j - i) * modulo}z`
    i = j
  }
  const corte = formato === 'EAN13' ? 7 : 4
  const leyenda = formato === 'CODE128' ? texto : `${formato === 'EAN13' ? `${texto[0]} ` : ''}${texto.slice(formato === 'EAN13' ? 1 : 0, corte)} ${texto.slice(corte)}`
  const total = alto + altoTexto
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${total}" width="${ancho}" height="${total}" shape-rendering="crispEdges" role="img" aria-label="Código de barras ${escXml(texto)}"><rect width="${ancho}" height="${total}" fill="#fff"/><path d="${trazo}" fill="#000"/>${conTexto ? `<text x="${ancho / 2}" y="${alto + 13}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="#000">${escXml(leyenda)}</text>` : ''}</svg>`
}

/** Cuántos módulos tiene el código con su zona en blanco (para saber si cabe y qué tan fino queda). */
export const modulosTotales = (codigo) => codificar(codigo).bits.length + 20

export const TAMANOS = {
  '40x25': { ancho: 40, alto: 25, nombre: '40 × 25 mm' },
  '50x30': { ancho: 50, alto: 30, nombre: '50 × 30 mm' },
  '60x40': { ancho: 60, alto: 40, nombre: '60 × 40 mm' },
}
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** Grosor aproximado de cada módulo en milímetros para ese código en esa etiqueta (menos de 0.25 mm puede no leerse bien). */
export const milimetrosPorModulo = (codigo, tamano) => ((TAMANOS[tamano] ?? TAMANOS['50x30']).ancho - 3) / modulosTotales(codigo)

/** Documento listo para imprimir: una etiqueta por página, del tamaño exacto del rollo. */
export function htmlEtiquetas({ nombre, codigo, precio, tamano = '50x30', copias = 1, conNombre = true, conPrecio = false }) {
  const t = TAMANOS[tamano] ?? TAMANOS['50x30']
  const n = Math.min(500, Math.max(1, Math.trunc(copias) || 1))
  const altoBarras = Math.round(t.alto * (conNombre || conPrecio ? 0.52 : 0.72))
  const precioHtml = conPrecio && precio != null ? `<div class="p">Q ${Number(precio).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>` : ''
  const una = `<div class="e">${conNombre ? `<div class="n">${esc(nombre)}</div>` : ''}<div class="b">${svgCodigo(codigo, { modulo: 2, alto: 60 })}</div>${precioHtml}</div>`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas</title><style>
    @page { size: ${t.ancho}mm ${t.alto}mm; margin: 0 }
    * { box-sizing: border-box } html, body { margin: 0; padding: 0 }
    .e { width: ${t.ancho}mm; height: ${t.alto}mm; padding: 1.2mm 1.5mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6mm; overflow: hidden; page-break-after: always; break-after: page; font-family: Arial, Helvetica, sans-serif; color: #000 }
    .e:last-child { page-break-after: auto; break-after: auto }
    .n { font-size: ${t.ancho >= 50 ? 8 : 7}pt; font-weight: 700; line-height: 1.1; text-align: center; max-height: 2.4em; overflow: hidden; width: 100% }
    .b { width: 100%; height: ${altoBarras}mm; display: flex; align-items: center; justify-content: center } .b svg { width: 100%; height: 100% }
    .p { font-size: 10pt; font-weight: 700 }
  </style></head><body>${Array.from({ length: n }, () => una).join('')}</body></html>`
}
