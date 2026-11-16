// Foto o PDF adjunto a un registro (vale de combustible, recibo de peaje, falla en inspección).
// Se sube a POST /archivos (base64, máx. 3 MB) y se guarda solo el id. Como los archivos son privados
// (requieren sesión), para verlos se descargan con el token y se abren en una pestaña nueva.
import { useState } from 'react'
import { Camera, Paperclip, X } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { errorApi } from './formato'

const leer = (archivo) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(archivo) })

export function SubirFoto({ value, onChange, etiqueta = 'Foto del comprobante' }) {
  const [subiendo, setSubiendo] = useState(false)
  const elegir = async (e) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    if (archivo.size > 3 * 1024 * 1024) { showToast({ type: 'error', message: 'La foto supera 3 MB' }); return }
    setSubiendo(true)
    try { const base64 = await leer(archivo); const { data } = await api.post('/archivos', { nombre: archivo.name, mime: archivo.type, base64 }); onChange(data.data.id) }
    catch (err) { showToast({ type: 'error', message: errorApi(err).mensaje }) } finally { setSubiendo(false) }
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      {value
        ? <><VerAdjunto id={value} /><button type="button" onClick={() => onChange(null)} aria-label="Quitar adjunto" className="rounded p-1 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button></>
        : <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:bg-gray-50"><Camera className="h-4 w-4" aria-hidden />{subiendo ? 'Subiendo…' : etiqueta}<input type="file" accept="image/*,application/pdf" capture="environment" onChange={elegir} className="hidden" /></label>}
    </div>
  )
}

export function VerAdjunto({ id, texto = 'Ver comprobante' }) {
  const [abriendo, setAbriendo] = useState(false)
  const abrir = async () => {
    setAbriendo(true)
    try { const { data } = await api.get(`/archivos/${id}`, { responseType: 'blob' }); const url = URL.createObjectURL(data); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setAbriendo(false) }
  }
  return <button type="button" onClick={abrir} className="inline-flex items-center gap-1 text-green-700 hover:underline"><Paperclip className="h-3.5 w-3.5" aria-hidden />{abriendo ? 'Abriendo…' : texto}</button>
}
