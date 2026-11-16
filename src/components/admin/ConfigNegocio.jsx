// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DEL NEGOCIO: nombre, eslogan, logo (menú y login), fondo del
// login e imagen de la pantalla de inicio. Las imágenes se comprimen antes de subir.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { ImageUp, Save, Trash2 } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { subirArchivo } from '../../utils/imagen'
import { invalidarMarca, urlArchivo } from '../../hooks/useMarca'
import { errorApi } from '../pos/formato'
import { MODOS, TEMAS } from '../../hooks/useTema'

const IMAGENES = [
  { campo: 'logoId', url: 'logoUrl', titulo: 'Logo', ayuda: 'Menú lateral y pantalla de ingreso. PNG con fondo transparente, cuadrado o horizontal.', opciones: { maxLado: 600, conservarPng: true, calidad: 0.9 } },
  { campo: 'fondoLoginId', url: 'fondoLoginUrl', titulo: 'Fondo de la pantalla de ingreso', ayuda: 'Foto horizontal (ej. fachada de la tienda). Se adapta a la pantalla.', opciones: { maxLado: 1920, calidad: 0.8 } },
  { campo: 'imagenInicioId', url: 'imagenInicioUrl', titulo: 'Imagen de la pantalla de inicio', ayuda: 'Banner horizontal que se muestra al entrar al sistema.', opciones: { maxLado: 1920, calidad: 0.8 } },
]

export default function ConfigNegocio() {
  const [form, setForm] = useState(null)
  const [vistas, setVistas] = useState({})
  const [subiendo, setSubiendo] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    api.get('/sistema/marca').then(({ data }) => {
      const m = data.data
      setForm({ nombre: m.nombre, eslogan: m.eslogan ?? '', logoId: m.logoId, fondoLoginId: m.fondoLoginId, imagenInicioId: m.imagenInicioId, tema: m.tema ?? 'tienda', modo: m.modo ?? 'claro' })
      setVistas({ logoId: urlArchivo(m.logoUrl), fondoLoginId: urlArchivo(m.fondoLoginUrl), imagenInicioId: urlArchivo(m.imagenInicioUrl) })
    })
  }, [])

  const elegir = async (img, archivo) => {
    if (!archivo) return
    setSubiendo(img.campo)
    try {
      const id = await subirArchivo(archivo, img.opciones)
      setForm((f) => ({ ...f, [img.campo]: id }))
      setVistas((v) => ({ ...v, [img.campo]: URL.createObjectURL(archivo) }))
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setSubiendo(null) }
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const { data } = await api.put('/sistema/marca', form)
      invalidarMarca(data.data) // login, menú e inicio se actualizan al instante
      showToast({ type: 'success', message: 'Configuración del negocio guardada' })
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setGuardando(false) }
  }

  if (!form) return <p className="p-6 text-gray-500">Cargando…</p>
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Datos del negocio</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm">Nombre comercial<input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="mt-1 block w-full rounded border px-3 py-2" /></label>
          <label className="text-sm">Eslogan o descripción<input value={form.eslogan} onChange={(e) => setForm((f) => ({ ...f, eslogan: e.target.value }))} className="mt-1 block w-full rounded border px-3 py-2" /></label>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Apariencia</h2>
        <p className="text-sm text-gray-600">Color y modo predeterminados para todos. Cada usuario puede elegir otro desde el ícono de paleta en la barra superior.</p>
        <div className="mt-3 flex flex-wrap gap-3" role="radiogroup" aria-label="Color del sistema">
          {TEMAS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={form.tema === t.id} onClick={() => setForm((f) => ({ ...f, tema: t.id }))}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${form.tema === t.id ? 'border-gray-900 font-medium' : ''}`}>
              <span className="h-5 w-5 rounded-full" style={{ backgroundColor: t.muestra }} aria-hidden /> {t.nombre}
            </button>
          ))}
        </div>
        <div className="mt-3 inline-flex rounded-lg bg-gray-100 p-0.5 text-sm" role="radiogroup" aria-label="Modo">
          {MODOS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={form.modo === m.id} onClick={() => setForm((f) => ({ ...f, modo: m.id }))}
              className={`rounded-md px-4 py-1 ${form.modo === m.id ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{m.nombre}</button>
          ))}
        </div>
      </section>

      {IMAGENES.map((img) => (
        <section key={img.campo} className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{img.titulo}</h3>
              <p className="text-sm text-gray-600">{img.ayuda}</p>
            </div>
            <div className="flex gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">
                <ImageUp className="h-4 w-4" /> {subiendo === img.campo ? 'Subiendo…' : 'Elegir imagen'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={Boolean(subiendo)} onChange={(e) => elegir(img, e.target.files?.[0])} />
              </label>
              {form[img.campo] && (
                <button type="button" onClick={() => { setForm((f) => ({ ...f, [img.campo]: null })); setVistas((v) => ({ ...v, [img.campo]: null })) }} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm text-red-600">
                  <Trash2 className="h-4 w-4" /> Quitar
                </button>
              )}
            </div>
          </div>
          <div className="mt-3 flex h-40 items-center justify-center overflow-hidden rounded-lg border bg-gray-50">
            {vistas[img.campo] ? <img src={vistas[img.campo]} alt={img.titulo} className={img.campo === 'logoId' ? 'max-h-32 object-contain' : 'h-full w-full object-cover'} /> : <span className="text-sm text-gray-400">Sin imagen (se usa la predeterminada)</span>}
          </div>
        </section>
      ))}

      <div className="flex justify-end">
        <button type="button" onClick={guardar} disabled={guardando || Boolean(subiendo) || form.nombre.trim().length < 2} className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">
          <Save className="h-4 w-4" /> {guardando ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  )
}
