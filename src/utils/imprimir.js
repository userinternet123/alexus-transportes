/** Imprime un documento HTML en un marco oculto (sin abrir pestañas). Sirve para etiquetas, guías y tickets. */
export function imprimirHtml(html) {
  const marco = document.createElement('iframe')
  marco.setAttribute('aria-hidden', 'true')
  Object.assign(marco.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(marco)
  const doc = marco.contentDocument
  doc.open(); doc.write(html); doc.close()
  // Un instante para que el navegador calcule el diseño antes de abrir la impresión
  setTimeout(() => { marco.contentWindow.focus(); marco.contentWindow.print(); setTimeout(() => marco.remove(), 60_000) }, 150)
}
