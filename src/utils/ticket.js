// ─────────────────────────────────────────────────────────────────────────────
// TICKET PARA IMPRESORA TÉRMICA (58 u 80 mm)
// Se imprime desde el navegador con un iframe oculto. Para imprimir sin el
// cuadro de diálogo, el acceso directo de SPVI abre Edge con --kiosk-printing
// (usa la impresora predeterminada de Windows).
// La FEL se certifica segundos después de la venta: se espera hasta 8 s.
// ─────────────────────────────────────────────────────────────────────────────
import api from '../services/api'

const BASE = import.meta.env.VITE_API_URL
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const Q = (n) => `Q${Number(n ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (n) => Number(n ?? 0).toLocaleString('es-GT', { maximumFractionDigits: 3 })
const MEDIOS = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', CHEQUE: 'Cheque', CREDITO: 'Crédito' }
// El sistema anterior guardaba "NA", "N/A", "." o "-" como nombre del consumidor final: no se imprime
const sinDato = (s) => !s || /^\s*((n\/?a|x|\.|-|cf)\s*)+$/i.test(String(s))
export const nombreCliente = (c) => [c?.razonSocial, [c?.nombres, c?.apellidos].filter((x) => !sinDato(x)).join(' ')].find((x) => x && !sinDato(x)) || 'Consumidor final'
/** Espacio en blanco al final para que el cortador automático no corte el texto (mm). */
export const AVANCE_CORTE_MM = 12
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

/** Preferencia por caja (este navegador): imprimir al cobrar. */
export const imprimirAlCobrar = {
  leer: () => localStorage.getItem('spvi_imprimir_ticket') !== '0',
  guardar: (si) => localStorage.setItem('spvi_imprimir_ticket', si ? '1' : '0'),
}

async function datosTicket(ventaId) {
  let { data } = await api.get(`/ventas/${ventaId}/ticket`)
  // Venta recién hecha: esperar la certificación FEL (hasta 8 s)
  for (let i = 0; i < 8 && data.data.venta.tipo === 'VENTA' && data.data.venta.felEstado === 'PENDIENTE'; i++) {
    await espera(1000)
    data = (await api.get(`/ventas/${ventaId}/ticket`)).data
  }
  return data.data
}

function logoMarca() {
  try {
    const m = JSON.parse(localStorage.getItem('spvi_marca') || 'null')
    return m?.logoUrl ? `${BASE}${m.logoUrl}` : null
  } catch { return null }
}

export function htmlTicket(t) {
  const v = t.venta
  const ancho = t.anchoMm === 58 ? 48 : 72 // área imprimible típica
  const esCotizacion = v.tipo === 'COTIZACION'
  const fel = v.felEstado === 'CERTIFICADO'
  const titulo = esCotizacion ? 'COTIZACIÓN' : fel ? 'FACTURA ELECTRÓNICA' : 'COMPROBANTE DE VENTA'
  const logo = logoMarca()
  const lineas = v.detalles.map((d) => `
    <div class="item">${esc(d.descripcion)}</div>
    <div class="fila"><span>${num(d.cantidad)} x ${Q(d.precioLista)}${Number(d.porcentajeDescuento) ? ` −${num(d.porcentajeDescuento)}%` : ''}</span><span>${Q(d.subtotal)}</span></div>`).join('')
  const pagos = (v.pagos ?? []).map((p) => `<div class="fila"><span>${esc(MEDIOS[p.medioPago] ?? p.medioPago)}${p.referencia ? ` (${esc(p.referencia)})` : ''}</span><span>${Q(p.monto)}</span></div>`).join('')

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${esc(v.serie)}-${v.numero}</title><style>
    @page { margin: 0; } /* el tamaño exacto (ancho × largo del ticket) se fija al imprimir: ver tamanoPagina */
    * { box-sizing: border-box; }
    body { margin: 0 auto; width: ${ancho}mm; padding: 3mm 2mm; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; line-height: 1.3; }
    .c { text-align: center; } .b { font-weight: bold; } .g { font-size: 14px; } .p { font-size: 9px; }
    .sep { border-top: 1px dashed #000; margin: 5px 0; }
    .fila { display: flex; justify-content: space-between; gap: 6px; }
    .fila span:last-child { white-space: nowrap; }
    .item { margin-top: 3px; }
    .total { font-size: 15px; font-weight: bold; }
    img { max-width: 60%; max-height: 22mm; filter: grayscale(1); }
    .uuid { word-break: break-all; font-size: 9px; }
  </style></head><body>
    ${logo ? `<div class="c"><img src="${esc(logo)}" alt=""></div>` : ''}
    <div class="c b g">${esc(t.nombreComercial)}</div>
    ${t.empresa?.nombre && t.empresa.nombre !== t.nombreComercial ? `<div class="c">${esc(t.empresa.nombre)}</div>` : ''}
    ${t.empresa?.nit ? `<div class="c">NIT: ${esc(t.empresa.nit)}</div>` : ''}
    <div class="c">${esc(t.sucursal?.nombre ?? '')}</div>
    ${t.sucursal?.direccion ? `<div class="c">${esc(t.sucursal.direccion)}</div>` : ''}
    ${t.sucursal?.telefono ? `<div class="c">Tel. ${esc(t.sucursal.telefono)}</div>` : ''}
    <div class="sep"></div>
    <div class="c b">${titulo}</div>
    ${fel ? `<div class="c">Serie ${esc(v.felSerie)} Número ${esc(v.felNumero)}</div><div class="c">Número de autorización:</div><div class="c uuid">${esc(v.felUuid)}</div>` : ''}
    ${!esCotizacion && v.felEstado === 'PENDIENTE' ? '<div class="c p">Factura electrónica en proceso de certificación. Solicite su reimpresión más tarde.</div>' : ''}
    <div class="fila"><span>Documento</span><span>${esc(v.serie)}-${v.numero}</span></div>
    <div class="fila"><span>Fecha</span><span>${new Date(v.fecha).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Guatemala' })}</span></div>
    ${v.vendedor?.nombre ? `<div class="fila"><span>Vendedor</span><span>${esc(v.vendedor.nombre)}</span></div>` : ''}
    <div class="sep"></div>
    <div>NIT: ${esc(v.cliente?.nit ?? 'CF')}</div>
    <div>Nombre: ${esc(nombreCliente(v.cliente))}</div>
    <div class="sep"></div>
    ${lineas}
    <div class="sep"></div>
    ${Number(v.descuentoTotal) ? `<div class="fila"><span>Descuentos</span><span>−${Q(v.descuentoTotal)}</span></div>` : ''}
    <div class="fila total"><span>TOTAL</span><span>${Q(v.total)}</span></div>
    ${Number(v.ivaIncluido) ? `<div class="fila p"><span>IVA incluido</span><span>${Q(v.ivaIncluido)}</span></div>` : ''}
    ${pagos ? `<div class="sep"></div>${pagos}<div class="fila b"><span>Cambio</span><span>${Q(v.cambio)}</span></div>` : ''}
    <div class="sep"></div>
    ${esCotizacion
      ? `<div class="c">Válida hasta ${v.validaHasta ? new Date(v.validaHasta).toLocaleDateString('es-GT') : '—'}</div><div class="c p">Este documento no es una factura</div>`
      : `${fel && t.frases ? `<div class="c p">${esc(t.frases)}</div>` : ''}${!fel && v.felEstado !== 'PENDIENTE' ? '<div class="c p">Documento sin validez fiscal</div>' : ''}`}
    <div class="c" style="margin-top:6px">${esc(t.pie)}</div>
    ${t.conMarca !== false ? '<div class="c p" style="margin-top:4px">SPVI by ALEXUS</div>' : ''}
  </body></html>`
}

/**
 * Página del tamaño EXACTO del ticket: ancho del papel × largo del contenido + espacio para el cortador.
 * Sin esto el navegador usa la hoja del controlador (p. ej. 297 mm): un ticket largo saldría partido en dos
 * (y con cortador automático, cortado a la mitad).
 */
export function tamanoPagina(doc, anchoMm) {
  const altoMm = Math.ceil((doc.documentElement.scrollHeight * 25.4) / 96) + AVANCE_CORTE_MM
  const estilo = doc.createElement('style')
  estilo.textContent = `@page { size: ${anchoMm}mm ${altoMm}mm; margin: 0; }`
  doc.head.appendChild(estilo)
  return altoMm
}

/** Imprime el ticket de una venta o cotización. Devuelve false si falló. */
export async function imprimirTicket(ventaId) {
  try {
    const datos = await datosTicket(ventaId)
    const html = htmlTicket(datos)
    const marco = document.createElement('iframe')
    marco.setAttribute('aria-hidden', 'true')
    Object.assign(marco.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(marco)
    const doc = marco.contentDocument
    doc.open(); doc.write(html); doc.close()
    // Esperar el logo antes de imprimir
    await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r }))))
    tamanoPagina(doc, datos.anchoMm === 58 ? 58 : 80)
    marco.contentWindow.focus()
    marco.contentWindow.print()
    setTimeout(() => marco.remove(), 60_000)
    return true
  } catch {
    return false
  }
}
