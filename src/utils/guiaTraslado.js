// Guía de traslado para impresora térmica (80 mm): viaja con la mercadería y
// quien recibe compara contra ella. Misma técnica de impresión que el ticket.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const num = (n) => Number(n ?? 0).toLocaleString('es-GT', { maximumFractionDigits: 3 })
const fecha = (f) => (f ? new Date(f).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Guatemala' }) : '—')

export function htmlGuia(t) {
  const filas = t.detalles.map((d) => `
    <div class="item">${esc(d.producto?.nombre)}</div>
    <div class="fila"><span>${esc(d.producto?.sku)}</span><span>Enviado: <b>${num(d.cantidad)}</b> · Recibido: ____</span></div>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guía de traslado #${t.id}</title><style>
    @page { size: 80mm auto; margin: 0; } * { box-sizing: border-box; }
    body { margin: 0; width: 72mm; padding: 3mm 2mm; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; line-height: 1.35; }
    .c { text-align: center; } .b { font-weight: bold; } .g { font-size: 15px; } .sep { border-top: 1px dashed #000; margin: 5px 0; }
    .fila { display: flex; justify-content: space-between; gap: 6px; } .item { margin-top: 4px; font-weight: bold; }
    .firma { margin-top: 26px; border-top: 1px solid #000; padding-top: 2px; text-align: center; }
  </style></head><body>
    <div class="c b g">GUÍA DE TRASLADO</div>
    <div class="c b">No. ${t.id}</div>
    <div class="sep"></div>
    <div><b>Sale de:</b> ${esc(t.sucursalOrigen?.nombre)} · ${esc(t.bodegaOrigen)}</div>
    <div><b>Va para:</b> ${esc(t.sucursalDestino?.nombre)} · ${esc(t.bodegaDestino)}</div>
    <div><b>Enviado:</b> ${fecha(t.fechaEnvio)} por ${esc(t.usuarioEnvia)}</div>
    ${t.observacion ? `<div><b>Nota:</b> ${esc(t.observacion)}</div>` : ''}
    <div class="sep"></div>
    ${filas}
    <div class="sep"></div>
    <div class="fila b"><span>${t.detalles.length} productos</span><span>${num(t.detalles.reduce((a, d) => a + Number(d.cantidad), 0))} unidades</span></div>
    <div class="firma">Entrega (nombre y firma)</div>
    <div class="firma">Recibe (nombre y firma)</div>
    <div class="c" style="margin-top:6px;font-size:9px">Al recibir, registre en SPVI la cantidad que llegó de cada producto.</div>
  </body></html>`
}

export function imprimirGuia(traslado) {
  const marco = document.createElement('iframe')
  marco.setAttribute('aria-hidden', 'true')
  Object.assign(marco.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(marco)
  const doc = marco.contentDocument
  doc.open(); doc.write(htmlGuia(traslado)); doc.close()
  marco.contentWindow.focus()
  marco.contentWindow.print()
  setTimeout(() => marco.remove(), 60_000)
}
