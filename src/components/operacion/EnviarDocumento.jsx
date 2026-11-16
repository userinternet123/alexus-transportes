// ─────────────────────────────────────────────────────────────────────────────
// ENVIAR UN DOCUMENTO: descargar el PDF o el Word, o compartirlo por WhatsApp o correo.
// Sin servidor de correo: se abre WhatsApp o el programa de correo con el mensaje listo y la persona escribe
// o elige el destinatario. Un enlace de correo no puede adjuntar archivos, así que el archivo se descarga
// y se adjunta arrastrándolo; en el teléfono (con HTTPS) se comparte el archivo directamente.
// El archivo se prepara ANTES del clic para que el navegador no bloquee las ventanas emergentes.
// ─────────────────────────────────────────────────────────────────────────────
import { registrarUso } from '../../utils/uso'
import { useEffect, useMemo, useState } from 'react'
import { Download, Mail, MessageCircle, Share2 } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { archivoDesdeBlob, correoValido, descargar, enlaceCorreo, enlaceGmail, enlaceOutlookWeb, enlaceWhatsApp, puedeCompartirArchivos, telefonoWhatsApp } from '../../utils/compartir'
import { errorApi } from '../pos/formato'
import Modal from '../comun/Modal'

const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
const campo = 'mt-1 w-full rounded-control border px-3 py-2'

export default function EnviarDocumento({ venta, onCerrar }) {
  const [info, setInfo] = useState(null)
  const [formato, setFormato] = useState('pdf')
  const [archivos, setArchivos] = useState({})
  const [error, setError] = useState(null)
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const compartible = useMemo(() => puedeCompartirArchivos(), [])

  useEffect(() => {
    api.get(`/documentos/venta/${venta.id}/envio`).then(({ data }) => {
      const d = data.data
      setInfo(d); setTelefono(d.telefono ?? ''); setCorreo(d.correo ?? ''); setMensaje(d.mensajeWhatsApp); setAsunto(d.asuntoCorreo); setCuerpo(d.cuerpoCorreo)
    }).catch((e) => setError(errorApi(e).mensaje))
  }, [venta.id])

  // Se prepara el archivo del formato elegido en cuanto se sabe cómo se llama
  useEffect(() => {
    if (!info || archivos[formato]) return
    let vivo = true
    api.get(`/documentos/venta/${venta.id}/${formato}`, { responseType: 'blob', timeout: 60000 })
      .then(({ data }) => { if (vivo) setArchivos((a) => ({ ...a, [formato]: archivoDesdeBlob(data, formato === 'pdf' ? info.nombrePdf : info.nombreWord, MIME[formato]) })) })
      .catch((e) => vivo && setError(errorApi(e).mensaje))
    return () => { vivo = false }
  }, [info, formato, archivos, venta.id])

  const archivo = archivos[formato]
  const listo = Boolean(archivo)
  const titulo = `${venta.tipo === 'VENTA' ? 'Venta' : 'Cotización'} ${venta.serie}-${venta.numero}`

  const telefonoOk = () => {
    if (!telefono.trim()) return { ok: true, tel: null } // sin número: WhatsApp deja elegir el contacto
    const tel = telefonoWhatsApp(telefono)
    if (!tel) { showToast({ type: 'warning', message: 'Revise el teléfono: debe tener 8 dígitos (o incluir el código de país).' }); return { ok: false } }
    return { ok: true, tel }
  }
  const correoOk = () => {
    if (!correo.trim()) return { ok: true, dir: null } // sin destinatario: se escribe en el programa de correo
    const dir = correoValido(correo)
    if (!dir) { showToast({ type: 'warning', message: 'Revise el correo del destinatario.' }); return { ok: false } }
    return { ok: true, dir }
  }

  /** En el teléfono: el sistema muestra sus aplicaciones (WhatsApp, Gmail…) con el archivo adjunto. */
  const compartir = async () => {
    registrarUso(`documento.compartir.${formato}`)
    try { await navigator.share({ files: [archivo], title: asunto || titulo, text: mensaje }) } catch (e) { if (e?.name !== 'AbortError') showToast({ type: 'error', message: 'No se pudo compartir. Use "Descargar" y adjunte el archivo.' }) }
  }
  const whatsapp = () => {
    registrarUso(`documento.whatsapp.${formato}`)
    const t = telefonoOk(); if (!t.ok) return
    descargar(archivo)
    window.open(enlaceWhatsApp(t.tel, mensaje), '_blank')
    showToast({ type: 'success', message: 'Se descargó el archivo. En WhatsApp, adjúntelo con el clip (📎).' })
  }
  const porCorreo = (via) => {
    registrarUso(`documento.correo.${formato}`)
    const c = correoOk(); if (!c.ok) return
    descargar(archivo)
    if (via === 'programa') window.location.href = enlaceCorreo(c.dir, asunto, cuerpo)
    else window.open(via === 'gmail' ? enlaceGmail(c.dir, asunto, cuerpo) : enlaceOutlookWeb(c.dir, asunto, cuerpo), '_blank')
    showToast({ type: 'success', message: 'Se descargó el archivo. Adjúntelo al correo arrastrándolo desde Descargas.' })
  }

  return (
    <Modal abierto titulo={`Compartir ${titulo}`} onCerrar={onCerrar} ancho="max-w-lg"
      pie={<button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cerrar</button>}>
      {error && <p className="mb-3 rounded-control bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      {!info && !error && <p className="text-sm text-gray-500" role="status">Preparando…</p>}
      {info && <div className="space-y-4">
        <div role="radiogroup" aria-label="Formato" className="flex rounded-control bg-gray-200 p-0.5 text-sm">
          {[['pdf', 'PDF'], ['docx', 'Word (editable)']].map(([k, t]) => (
            <button key={k} type="button" role="radio" aria-checked={formato === k} onClick={() => { setError(null); setFormato(k) }} className={`flex-1 rounded-[6px] py-1.5 ${formato === k ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Teléfono (WhatsApp)<input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="5555-1234" className={`${campo} cifra`} /></label>
          <label className="block text-sm">Correo del destinatario<input value={correo} onChange={(e) => setCorreo(e.target.value)} type="email" inputMode="email" placeholder="cliente@correo.com" className={campo} /></label>
        </div>
        <label className="block text-sm">Mensaje
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={3} maxLength={500} className={campo} />
        </label>

        <div className="space-y-2">
          {compartible && (
            <button type="button" disabled={!listo} onClick={compartir} className="flex w-full items-center justify-center gap-2 rounded-control bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"><Share2 className="h-5 w-5" aria-hidden /> Compartir (WhatsApp, correo…)</button>
          )}
          {!compartible && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={!listo} onClick={whatsapp} className="flex items-center justify-center gap-2 rounded-control bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"><MessageCircle className="h-5 w-5" aria-hidden /> WhatsApp</button>
              <button type="button" disabled={!listo} onClick={() => porCorreo('programa')} className="flex items-center justify-center gap-2 rounded-control border px-4 py-3 font-medium disabled:opacity-50"><Mail className="h-5 w-5" aria-hidden /> Correo (mi programa)</button>
            </div>
          )}
          <button type="button" disabled={!listo} onClick={() => descargar(archivo)} className="flex w-full items-center justify-center gap-2 rounded-control border px-4 py-2.5 disabled:opacity-50"><Download className="h-4 w-4" aria-hidden /> {listo ? 'Descargar' : 'Preparando el archivo…'}</button>
          {!compartible && <p className="text-center text-xs text-gray-500">Correo en el navegador: <button type="button" disabled={!listo} onClick={() => porCorreo('gmail')} className="underline disabled:opacity-50">Gmail</button> · <button type="button" disabled={!listo} onClick={() => porCorreo('outlook')} className="underline disabled:opacity-50">Outlook</button></p>}
        </div>

        <details className="text-sm"><summary className="cursor-pointer select-none text-gray-600">Editar el texto del correo</summary>
          <label className="mt-2 block">Asunto<input value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={120} className={campo} /></label>
          <label className="mt-2 block">Mensaje<textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={5} maxLength={800} className={campo} /></label>
        </details>
        {!compartible && <p className="text-xs text-gray-500">WhatsApp y el correo se abren con el mensaje listo, pero <b>no pueden adjuntar el archivo solos</b>: se descarga y se adjunta con el clip o arrastrándolo. En el teléfono, con conexión segura (HTTPS), se comparte el archivo directamente.</p>}
      </div>}
    </Modal>
  )
}
