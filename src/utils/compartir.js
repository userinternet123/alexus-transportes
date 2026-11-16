// Compartir un documento por WhatsApp o correo, sin servidor de correo: se descarga el archivo y se abre
// WhatsApp o el programa de correo con el mensaje listo. En el teléfono, si el navegador lo permite
// (requiere HTTPS), se comparte el archivo directamente con la aplicación que la persona elija.

/** "5555-1234" → "50255551234" (formato de wa.me). null si no parece un teléfono. */
export function telefonoWhatsApp(tel) {
  let d = String(tel ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 8) return `502${d}`
  if (d.length === 11 && d.startsWith('502')) return d
  if (d.length >= 10 && d.length <= 15) return d // número internacional con código de país
  return null
}
export const correoValido = (c) => {
  const t = String(c ?? '').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) && t.length <= 120 ? t : null
}

const enc = encodeURIComponent
/** WhatsApp con el mensaje escrito; sin número, WhatsApp deja elegir el contacto. */
export const enlaceWhatsApp = (telefono, texto) => `https://wa.me/${telefono ?? ''}?text=${enc(texto)}`
/** Programa de correo del equipo (Outlook de Windows, Mail…). Los saltos de línea del correo son CRLF. */
export const enlaceCorreo = (correo, asunto, cuerpo) => `mailto:${correo ?? ''}?subject=${enc(asunto)}&body=${enc(String(cuerpo ?? '').replace(/\r?\n/g, '\r\n'))}`
export const enlaceGmail = (correo, asunto, cuerpo) => `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(correo ?? '')}&su=${enc(asunto)}&body=${enc(cuerpo)}`
export const enlaceOutlookWeb = (correo, asunto, cuerpo) => `https://outlook.office.com/mail/deeplink/compose?to=${enc(correo ?? '')}&subject=${enc(asunto)}&body=${enc(cuerpo)}`

/** ¿Este navegador puede compartir un archivo directamente con otra aplicación? (teléfonos, y solo con HTTPS) */
export function puedeCompartirArchivos() {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      && window.isSecureContext && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })
  } catch { return false }
}
export const archivoDesdeBlob = (blob, nombre, mime) => new File([blob], nombre, { type: mime })
export function descargar(archivo) {
  const url = URL.createObjectURL(archivo)
  const a = document.createElement('a')
  a.href = url; a.download = archivo.name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
