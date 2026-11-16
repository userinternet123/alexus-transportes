// ─────────────────────────────────────────────────────────────────────────────
// FICHA DEL PRODUCTO EN EL PUNTO DE VENTA: forma adicional de vender.
// Muestra todo el detalle (clasificación, marca, datos del giro, existencia,
// descuento permitido) y deja elegir cantidad y descuento antes de agregarlo.
// La venta rápida de siempre (tocar el producto) no cambia.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import api from '../../services/api'
import { cargarArbol, opcionesSubgrupo } from '../../utils/clasificacion'
import { etiquetasGiro, useCamposProducto } from '../../hooks/useCamposProducto'
import { Q } from './formato'
import Modal from '../comun/Modal'
import { UbicacionesLectura } from '../comun/UbicacionProducto'

const num = (n) => Number(n ?? 0).toLocaleString('es-GT', { maximumFractionDigits: 3 })

export default function FichaProducto({ producto: p, esCotizacion, enCarrito = 0, onCerrar, onAgregar }) {
  const campos = useCamposProducto()
  const [detalle, setDetalle] = useState(null)
  const [ruta, setRuta] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [descuento, setDescuento] = useState('0')
  const cantidadRef = useRef(null)

  useEffect(() => {
    api.get(`/productos/${p.id}`).then(({ data }) => setDetalle(data.data)).catch(() => {})
    cargarArbol().then((a) => setRuta(opcionesSubgrupo(a).find((o) => o.id === p.subgrupoId)?.ruta ?? '')).catch(() => {})
    setTimeout(() => cantidadRef.current?.select(), 50)
  }, [p.id, p.subgrupoId])

  const d = detalle ?? p
  const decimales = d.presentacion?.permiteDecimales
  const precio = Number(p.precioVenta)
  const maxDescuento = esCotizacion ? 100 : Number(p.descuentoMaximo || 0)
  const existencia = Number(p.existencia || 0)
  const controla = p.manejaInventario && !esCotizacion
  const cant = Number(cantidad)
  const desc = Number(descuento || 0)
  const subtotal = Math.round(precio * cant * (1 - desc / 100) * 100) / 100

  const problema = !(cant > 0) ? 'Indique la cantidad'
    : !decimales && !Number.isInteger(cant) ? `Se vende en unidades enteras (${d.presentacion?.nombre ?? 'unidad'})`
    : controla && cant + enCarrito > existencia ? `Solo hay ${num(existencia)} en la sucursal${enCarrito ? ` (ya lleva ${num(enCarrito)} en la venta)` : ''}`
    : desc < 0 || desc > maxDescuento ? `El descuento máximo permitido para su rol es ${num(maxDescuento)} %`
    : null
  const paso = decimales ? 0.5 : 1
  const mover = (delta) => setCantidad((c) => String(Math.max(paso, Math.round((Number(c || 0) + delta) * 1000) / 1000)))
  const giro = etiquetasGiro(d.atributos, campos, { soloPos: false })
  const foto = p.imagenId ? `${import.meta.env.VITE_API_URL}/archivos/publico/${p.imagenId}` : null

  const agregar = (e) => {
    e?.preventDefault()
    if (!problema) onAgregar(p, cant, desc)
  }

  return (
    <Modal abierto titulo="Ficha del producto" onCerrar={onCerrar} ancho="max-w-2xl"
      pie={<>
        <span className="mr-auto self-center text-sm text-gray-600">Subtotal <span className="cifra text-lg font-semibold text-gray-900">{Q(subtotal)}</span></span>
        <button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button>
        <button type="button" disabled={Boolean(problema)} onClick={agregar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">{esCotizacion ? 'Agregar a la cotización' : 'Agregar a la venta'}</button>
      </>}>
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="h-40 w-full shrink-0 overflow-hidden rounded-superficie border bg-gray-50 sm:w-40">
          {foto ? <img src={foto} alt={p.nombre} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-4xl font-semibold text-green-700">{p.nombre.split(' ').slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-lg font-semibold leading-tight">{p.nombre}</p>
            <p className="text-sm text-gray-500">{p.sku}{d.codigoBarra ? ` · ${d.codigoBarra}` : ''}</p>
            {d.descripcion && <p className="mt-1 text-sm text-gray-700">{d.descripcion}</p>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-500">Clasificación</dt><dd>{ruta || [d.subgrupo?.grupo?.categoria?.nombre, d.subgrupo?.grupo?.nombre, d.subgrupo?.nombre].filter(Boolean).join(' › ') || '—'}</dd>
            {d.marca?.nombre && <><dt className="text-gray-500">Marca</dt><dd>{d.marca.nombre}</dd></>}
            <dt className="text-gray-500">Presentación</dt><dd>{d.presentacion?.nombre ?? '—'}</dd>
            <dt className="text-gray-500">Precio</dt><dd className="cifra font-semibold">{Q(precio)}{p.exentoIva ? ' (exento de IVA)' : ''}</dd>
            {!esCotizacion && <><dt className="text-gray-500">Descuento permitido</dt><dd>{maxDescuento ? `hasta ${num(maxDescuento)} % para su rol` : 'Su rol no puede dar descuento en este producto'}</dd></>}
            {p.manejaInventario
              ? <><dt className="text-gray-500">Existencia</dt><dd className={existencia > 0 ? '' : 'font-medium text-red-600'}>{num(existencia)} en la sucursal{enCarrito ? ` · ${num(enCarrito)} ya en la venta` : ''}</dd></>
              : <><dt className="text-gray-500">Tipo</dt><dd>Servicio (sin existencia)</dd></>}
            {p.manejaInventario && <><dt className="text-gray-500">Ubicación</dt><dd><UbicacionesLectura productoId={p.id} /></dd></>}
          </dl>
          {giro.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{giro.map((e) => <span key={e} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">{e}</span>)}</div>
          )}
        </div>
      </div>

      <form onSubmit={agregar} className="mt-5 grid gap-4 rounded-superficie bg-gray-50 p-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Cantidad
          <div className="mt-1 flex items-center gap-2">
            <button type="button" onClick={() => mover(-paso)} className="flex h-11 w-11 items-center justify-center rounded-control border bg-white" aria-label="Menos"><Minus className="h-4 w-4" /></button>
            <input ref={cantidadRef} type="number" inputMode="decimal" min="0" step={decimales ? 'any' : 1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="cifra h-11 w-full min-w-0 rounded-control border bg-white px-3 text-center text-lg" aria-label="Cantidad" />
            <button type="button" onClick={() => mover(paso)} className="flex h-11 w-11 items-center justify-center rounded-control border bg-white" aria-label="Más"><Plus className="h-4 w-4" /></button>
          </div>
        </label>
        <label className="text-sm font-medium">Descuento (%)
          <input type="number" inputMode="decimal" min="0" max={maxDescuento} step="any" value={descuento} onChange={(e) => setDescuento(e.target.value)} disabled={!maxDescuento}
            className="cifra mt-1 h-11 w-full rounded-control border bg-white px-3 text-right text-lg disabled:opacity-50" aria-label="Descuento en porcentaje" />
        </label>
        {problema && <p className="text-sm font-medium text-red-600 sm:col-span-2" role="alert">{problema}</p>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}
