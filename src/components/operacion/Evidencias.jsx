// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCIAS: tomar fotos (en el celular abre la cámara), subirlas comprimidas con ubicación y hora, y verlas.
// Las fotos son privadas: se piden al API con la sesión, nunca por un enlace público.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Camera, FileText, Loader2, MapPin, X } from 'lucide-react'
import api from '../../services/api'
import { subirImagen } from '../../utils/imagen'
import { showToast } from '../../utils/showToast'
import Modal from '../comun/Modal'
import { enlaceMapa, fechaHora, hay, pedirUbicacion } from './util'

/** Imagen privada: la baja con la sesión y la muestra desde memoria. */
export function FotoPrivada({ archivoId, alt, className }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let vivo = true
    let creada = null
    api.get(`/archivos/${archivoId}`, { responseType: 'blob' })
      .then(({ data }) => { if (vivo) { creada = URL.createObjectURL(data); setUrl(creada) } })
      .catch(() => {})
    return () => { vivo = false; if (creada) { URL.revokeObjectURL(creada) } }
  }, [archivoId])
  if (!url) { return <div className={`animate-pulse bg-gray-200 ${className ?? ''}`} aria-label="Cargando foto" /> }
  return <img src={url} alt={alt} className={`object-cover ${className ?? ''}`} />
}

/** Miniaturas; al tocar una se ve grande con su hora y ubicación. */
export function Galeria({ evidencias, tamano = 'h-16 w-16' }) {
  const [abierta, setAbierta] = useState(null)
  if (!evidencias?.length) { return null }
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {evidencias.map((e) => (
          <li key={e.id ?? e.archivoId}>
            <button type="button" onClick={() => setAbierta(e)} className="block overflow-hidden rounded-control border" aria-label={`Ver foto${e.descripcion ? `: ${e.descripcion}` : ''}`}>
              {e.mime === 'application/pdf' ? <span className={`flex items-center justify-center bg-gray-50 ${tamano}`}><FileText className="h-6 w-6 text-gray-400" aria-hidden /></span> : <FotoPrivada archivoId={e.archivoId} alt={e.descripcion ?? 'Evidencia'} className={tamano} />}
            </button>
          </li>
        ))}
      </ul>
      {abierta && (
        <Modal abierto titulo={abierta.descripcion || 'Evidencia'} onCerrar={() => setAbierta(null)} ancho="max-w-3xl">
          {abierta.mime === 'application/pdf'
            ? <p className="text-sm">Documento PDF. <button type="button" className="text-green-700 underline" onClick={() => api.get(`/archivos/${abierta.archivoId}`, { responseType: 'blob' }).then(({ data }) => window.open(URL.createObjectURL(data), '_blank', 'noopener'))}>Abrir</button></p>
            : <FotoPrivada archivoId={abierta.archivoId} alt={abierta.descripcion ?? 'Evidencia'} className="max-h-[70vh] w-full object-contain" />}
          <p className="mt-2 text-xs text-gray-500">{fechaHora(abierta.tomadaEn)}{enlaceMapa(abierta.latitud, abierta.longitud) && <> · <a href={enlaceMapa(abierta.latitud, abierta.longitud)} target="_blank" rel="noopener noreferrer" className="text-green-700 underline">ver en el mapa</a></>}</p>
        </Modal>
      )}
    </>
  )
}

/**
 * Toma o elige fotos, las sube comprimidas y devuelve la lista de evidencias para el API
 * ([{ archivoId, descripcion, latitud, longitud, tomadaEn }]). En el celular abre la cámara trasera.
 */
export function CapturaFotos({ valor, onCambio, max = 10, etiqueta = 'Tomar foto' }) {
  const entrada = useRef(null)
  const [subiendo, setSubiendo] = useState(0)
  const elegir = async (e) => {
    const archivos = [...e.target.files].slice(0, Math.max(0, max - valor.length))
    e.target.value = ''
    if (!archivos.length) { return }
    setSubiendo(archivos.length)
    const ubicacion = await pedirUbicacion()
    const nuevas = []
    for (const a of archivos) {
      try {
        const { id, vista } = await subirImagen(a)
        nuevas.push({ archivoId: id, vista, descripcion: '', latitud: ubicacion?.latitud ?? null, longitud: ubicacion?.longitud ?? null, tomadaEn: new Date().toISOString() })
      } catch (err) {
        showToast({ type: 'error', message: err?.response?.data?.message ?? err.message })
      }
      setSubiendo((n) => n - 1)
    }
    onCambio([...valor, ...nuevas])
  }
  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {valor.map((f) => (
          <li key={f.archivoId} className="relative">
            {f.vista?.startsWith('data:image') ? <img src={f.vista} alt="Foto adjunta" className="h-16 w-16 rounded-control border object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-control border bg-gray-50"><FileText className="h-6 w-6 text-gray-400" aria-hidden /></span>}
            {hay(f.latitud) && <MapPin className="absolute bottom-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white text-green-700" aria-label="Con ubicación" />}
            <button type="button" onClick={() => onCambio(valor.filter((x) => x.archivoId !== f.archivoId))} aria-label="Quitar foto" className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-800 p-0.5 text-white"><X className="h-3 w-3" /></button>
          </li>
        ))}
        {Array.from({ length: subiendo }).map((_, i) => <li key={`s${i}`} className="flex h-16 w-16 items-center justify-center rounded-control border bg-gray-50"><Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label="Subiendo" /></li>)}
        {valor.length + subiendo < max && (
          <li>
            <button type="button" onClick={() => entrada.current?.click()} className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-control border border-dashed text-xs text-gray-600 hover:bg-gray-50"><Camera className="h-5 w-5" aria-hidden />{etiqueta.split(' ')[0]}</button>
          </li>
        )}
      </ul>
      <input ref={entrada} type="file" accept="image/*,application/pdf" capture="environment" multiple onChange={elegir} className="hidden" aria-label={etiqueta} />
    </div>
  )
}
