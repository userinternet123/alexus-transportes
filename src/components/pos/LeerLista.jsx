// ─────────────────────────────────────────────────────────────────────────────
// LEER LISTA (cotización): el cliente trae su lista de útiles en foto o PDF. La IA lee cada
// renglón y se propone el producto del catálogo; la persona revisa, corrige y agrega todo a la
// cotización de un solo paso. Lo confirmado se recuerda para la próxima lista.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { Camera, ClipboardCopy, FileUp, ImagePlus, Search } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { prepararArchivo } from '../../utils/imagen'
import Modal from '../comun/Modal'
import BuscadorProducto from '../comun/BuscadorProducto'
import { Q, errorApi } from './formato'

const ESTADO = {
  ENCONTRADO: ['Encontrado', 'bg-green-50 text-green-700'],
  DUDOSO: ['Revisar', 'bg-amber-50 text-amber-700'],
  NO_ENCONTRADO: ['No está en el catálogo', 'bg-gray-100 text-gray-600'],
}
const unicos = (lista) => { const vistos = new Set(); return lista.filter((p) => p && !vistos.has(p.id) && vistos.add(p.id)) }

export default function LeerLista({ onCerrar, onAgregar }) {
  const [leyendo, setLeyendo] = useState(false)
  const [res, setRes] = useState(null)
  const [filas, setFilas] = useState([])

  const leer = async (archivo) => {
    if (!archivo) return
    setLeyendo(true)
    try {
      // La foto se reduce en el teléfono: las listas son texto y bastan ~2200 px
      const { base64, mime } = await prepararArchivo(archivo, { maxLado: 2200, calidad: 0.85 })
      const { data } = await api.post('/listas/leer', { base64, mime }, { timeout: 120000 })
      setRes(data.data)
      setFilas(data.data.items.map((x) => ({
        ...x, cantidad: String(x.cantidad), producto: x.seleccionado, opciones: unicos([x.seleccionado, ...x.alternativas]),
        incluir: Boolean(x.seleccionado), buscando: false,
      })))
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setLeyendo(false) }
  }

  const cambiar = (indice, cambio) => setFilas((fs) => fs.map((f) => (f.indice === indice ? { ...f, ...cambio } : f)))
  const elegir = (indice, producto) => setFilas((fs) => fs.map((f) => (f.indice === indice
    ? { ...f, producto, incluir: Boolean(producto), buscando: false, opciones: unicos([...f.opciones, producto]) } : f)))

  /** Producto buscado a mano: el buscador general no trae el descuento máximo del rol; se pide en formato del punto de venta. */
  const elegirManual = async (indice, p) => {
    let completo = p
    try {
      const { data } = await api.get('/productos/pos/buscar', { params: { q: p.sku } })
      completo = data.data.find((x) => x.id === p.id) ?? p
    } catch { /* si falla, se usa el que ya se tiene (sin descuento) */ }
    elegir(indice, completo)
  }

  const aAgregar = useMemo(() => filas.filter((f) => f.incluir && f.producto && Number(f.cantidad) > 0), [filas])
  const faltantes = useMemo(() => filas.filter((f) => !f.producto), [filas])
  const total = aAgregar.reduce((s, f) => s + Number(f.producto.precioVenta) * Number(f.cantidad), 0)

  const confirmar = () => {
    onAgregar(aAgregar.map((f) => ({ producto: f.producto, cantidad: Number(f.cantidad) })))
    // Se recuerda qué producto corresponde a cada renglón (sin esperar: si falla, no importa)
    api.post('/listas/aprender', { asignaciones: aAgregar.map((f) => ({ texto: f.texto, productoId: f.producto.id })) }).catch(() => {})
  }
  const copiarFaltantes = async () => {
    const texto = faltantes.map((f) => `${f.cantidad} x ${f.texto}${f.nota ? ` (${f.nota})` : ''}`).join('\n')
    try { await navigator.clipboard.writeText(texto); showToast({ type: 'success', message: 'Lista de faltantes copiada' }) }
    catch { showToast({ type: 'warning', message: 'No se pudo copiar: seleccione el texto manualmente' }) }
  }

  // ── Paso 1: elegir la foto o el PDF ──
  if (!res) {
    return (
      <Modal abierto titulo="Leer lista de útiles" onCerrar={onCerrar} ancho="max-w-lg">
        <p className="text-sm text-gray-600">Tome una foto de la lista del cliente o elija el archivo (foto o PDF). El sistema reconoce cada artículo y lo busca en su catálogo; usted revisa antes de cotizar.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-tarjeta border-2 border-dashed px-4 py-8 text-center hover:border-green-600 hover:bg-green-50 ${leyendo ? 'pointer-events-none opacity-60' : ''}`}>
            <Camera className="h-8 w-8 text-green-700" aria-hidden />
            <span className="font-medium">Tomar foto</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={leyendo} onChange={(e) => { leer(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-tarjeta border-2 border-dashed px-4 py-8 text-center hover:border-green-600 hover:bg-green-50 ${leyendo ? 'pointer-events-none opacity-60' : ''}`}>
            <ImagePlus className="h-8 w-8 text-green-700" aria-hidden /><FileUp className="hidden" aria-hidden />
            <span className="font-medium">Galería o PDF</span>
            <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={leyendo} onChange={(e) => { leer(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>
        {leyendo && <p className="mt-4 text-center text-sm text-gray-600" role="status">Leyendo la lista… puede tardar hasta 30 segundos.</p>}
        <p className="mt-4 text-xs text-gray-500">La imagen se envía a un servicio de IA para leerla. Tome la foto de frente, con buena luz y sin cortar los bordes.</p>
      </Modal>
    )
  }

  // ── Paso 2: revisar ──
  const r = res.resumen
  return (
    <Modal abierto titulo={res.titulo || 'Lista leída'} onCerrar={onCerrar} ancho="max-w-3xl"
      pie={<>
        <span className="mr-auto self-center text-sm text-gray-600">{aAgregar.length} de {filas.length} · <span className="cifra text-base font-semibold text-gray-900">{Q(total)}</span></span>
        <button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button>
        <button type="button" disabled={!aAgregar.length} onClick={confirmar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Agregar a la cotización</button>
      </>}>
      <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span><b className="cifra">{r.total}</b> renglones</span>
        <span className="text-green-700"><b className="cifra">{r.encontrados}</b> encontrados</span>
        <span className="text-amber-700"><b className="cifra">{r.dudosos}</b> por revisar</span>
        <span className="text-gray-500"><b className="cifra">{r.noEncontrados}</b> no están en el catálogo</span>
      </p>
      {res.observaciones && <p className="mb-3 rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-800">{res.observaciones}</p>}
      {res.recortada && <p className="mb-3 rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-800">La lista es muy larga: se leyeron los primeros 80 renglones. Lea el resto en otra foto.</p>}

      <ul className="space-y-2">
        {filas.map((f) => {
          const [etiqueta, color] = ESTADO[f.estado]
          const sinStock = f.producto?.manejaInventario && Number(f.producto.existencia) < Number(f.cantidad)
          return (
            <li key={f.indice} className={`rounded-tarjeta border p-3 ${f.incluir ? 'bg-white' : 'bg-gray-50'}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={f.incluir} disabled={!f.producto} onChange={(e) => cambiar(f.indice, { incluir: e.target.checked })} className="mt-1 h-5 w-5 accent-green-600" aria-label={`Incluir ${f.texto}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{f.texto}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${color}`}>{etiqueta}</span>
                    {f.origen === 'memoria' && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">ya lo había resuelto antes</span>}
                    {f.unidad && <span>({f.unidad})</span>}{f.nota && <span>Nota: {f.nota}</span>}
                  </p>
                </div>
                <label className="shrink-0 text-xs text-gray-500">Cant.
                  <input type="number" min="0" step="any" inputMode="decimal" value={f.cantidad} onChange={(e) => cambiar(f.indice, { cantidad: e.target.value })} className="cifra mt-0.5 block w-16 rounded-control border px-2 py-1.5 text-right text-sm text-gray-900" aria-label={`Cantidad de ${f.texto}`} />
                </label>
              </div>

              <div className="mt-2 pl-8">
                {f.buscando ? (
                  <div><BuscadorProducto autoFocus onSelect={(p) => elegirManual(f.indice, p)} placeholder="Buscar en el catálogo" />
                    <button type="button" onClick={() => cambiar(f.indice, { buscando: false })} className="mt-1 text-xs text-gray-500 underline">Cancelar</button></div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {f.opciones.length > 0 && (
                      <select value={f.producto?.id ?? ''} onChange={(e) => elegir(f.indice, f.opciones.find((o) => String(o.id) === e.target.value) ?? null)} className="min-w-0 max-w-full flex-1 rounded-control border bg-white px-2 py-1.5 text-sm" aria-label={`Producto para ${f.texto}`}>
                        <option value="">— No agregar —</option>
                        {f.opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre} · {Q(o.precioVenta)}</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => cambiar(f.indice, { buscando: true })} className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:underline"><Search className="h-3.5 w-3.5" aria-hidden /> {f.opciones.length ? 'Buscar otro' : 'Buscar en el catálogo'}</button>
                  </div>
                )}
                {f.producto && !f.buscando && (
                  <p className="mt-1 text-xs text-gray-500">
                    <span className="cifra">{Q(f.producto.precioVenta)}</span> c/u · <span className="cifra font-medium text-gray-700">{Q(Number(f.producto.precioVenta) * Number(f.cantidad || 0))}</span>
                    {f.producto.manejaInventario && <span className={sinStock ? ' font-medium text-red-600' : ''}> · {Number(f.producto.existencia).toLocaleString('es-GT')} en existencia{sinStock ? ' (no alcanza)' : ''}</span>}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {faltantes.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-tarjeta bg-gray-50 p-3 text-sm">
          <span className="text-gray-600">{faltantes.length} sin producto asignado: no se agregarán.</span>
          <button type="button" onClick={copiarFaltantes} className="inline-flex items-center gap-1 rounded-control border bg-white px-3 py-1.5"><ClipboardCopy className="h-4 w-4" aria-hidden /> Copiar lista de faltantes</button>
        </div>
      )}
    </Modal>
  )
}
