// ─────────────────────────────────────────────────────────────────────────────
// INGRESO DE COMPRAS (reemplaza IngresoUI)
// Factura de proveedor → líneas con costo y descuento → entra al kardex con
// costo promedio. Opcional: actualizar el precio de venta en el mismo acto.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trash2, Ban, Save, FileUp } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { Q, r2, errorApi } from '../pos/formato'
import BuscadorProducto from '../comun/BuscadorProducto'
import Modal from '../comun/Modal'
import ImportarFactura from './ImportarFactura'

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
const facturaVacia = () => ({ proveedorId: '', serieFactura: '', numeroFactura: '', fechaFactura: hoy(), observacion: '' })

export default function IngresoCompra() {
  const { puede } = usePermisos()
  const [proveedores, setProveedores] = useState([])
  const [factura, setFactura] = useState(facturaVacia)
  const [lineas, setLineas] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [recientes, setRecientes] = useState([])
  const [anulando, setAnulando] = useState(null)
  // Factura importada del XML FEL: número de autorización y lo que el sistema debe recordar
  // Desde el menú "Importar factura de compra" (?importar=1) la ventana se abre sola
  const [params, setParams] = useSearchParams()
  const [importando, setImportando] = useState(params.get('importar') === '1')
  const [importada, setImportada] = useState(null) // { uuidFel, aprendizaje }

  const cargarRecientes = () => api.get('/compras').then(({ data }) => setRecientes(data.data)).catch(() => {})
  useEffect(() => {
    api.get('/terceros/proveedores', { params: { limit: 0 } }).then(({ data }) => setProveedores(data.data))
    cargarRecientes()
  }, [])

  const agregar = (p) => {
    if (lineas.some((l) => l.productoId === p.id)) return showToast({ type: 'warning', message: `"${p.nombre}" ya está en la factura` })
    setLineas((ls) => [...ls, { productoId: p.id, nombre: p.nombre, sku: p.sku, precioActual: Number(p.precioVenta), cantidad: 1, costoUnitario: '', descuento: 0, precioVenta: '' }])
  }
  const cambiar = (id, campo, valor) => setLineas((ls) => ls.map((l) => (l.productoId === id ? { ...l, [campo]: valor } : l)))

  const calc = useMemo(() => {
    const filas = lineas.map((l) => {
      const subtotal = r2(Number(l.cantidad || 0) * Number(l.costoUnitario || 0) - Number(l.descuento || 0))
      const costoNeto = Number(l.cantidad) > 0 ? subtotal / Number(l.cantidad) : 0
      const precio = Number(l.precioVenta || l.precioActual)
      const margen = precio > 0 ? ((precio - costoNeto) / precio) * 100 : 0
      return { ...l, subtotal, costoNeto, margen }
    })
    return { filas, total: r2(filas.reduce((a, f) => a + f.subtotal, 0)) }
  }, [lineas])

  const valida = factura.proveedorId && factura.serieFactura.trim() && factura.numeroFactura.trim() && lineas.length > 0 &&
    calc.filas.every((f) => Number(f.cantidad) > 0 && f.costoUnitario !== '' && f.subtotal >= 0)

  const guardar = async () => {
    setGuardando(true)
    try {
      const { data } = await api.post('/compras', {
        ...factura,
        proveedorId: Number(factura.proveedorId),
        observacion: factura.observacion || undefined,
        lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad), costoUnitario: Number(l.costoUnitario), descuento: Number(l.descuento || 0) })),
        nuevosPrecios: lineas.filter((l) => l.precioVenta !== '' && Number(l.precioVenta) > 0).map((l) => ({ productoId: l.productoId, precioVenta: Number(l.precioVenta) })),
        uuidFel: importada?.uuidFel,
        aprendizaje: importada?.aprendizaje,
      })
      showToast({ type: 'success', message: data.message })
      setFactura(facturaVacia())
      setLineas([])
      setImportada(null)
      cargarRecientes()
    } catch (e) {
      const { codigo, mensaje } = errorApi(e)
      showToast({ type: 'error', message: codigo === 'DUPLICADO' ? 'Esa factura de ese proveedor ya fue registrada' : mensaje })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Ingreso de factura de compra</h2>
          <button type="button" onClick={() => setImportando(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">
            <FileUp className="h-4 w-4" /> Importar factura (XML, foto o PDF)
          </button>
        </div>
        {importada && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Datos tomados de la factura electrónica. Revise y registre la compra: el sistema recordará los productos para la próxima factura de este proveedor.</p>}
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <label className="text-sm md:col-span-2">Proveedor *
            <select value={factura.proveedorId} onChange={(e) => setFactura((f) => ({ ...f, proveedorId: e.target.value }))} className="mt-1 block w-full rounded border px-2 py-2">
              <option value="">Seleccione…</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razonSocial ?? p.nombres} {p.nit ? `(${p.nit})` : ''}</option>)}
            </select>
          </label>
          <label className="text-sm">Serie *<input value={factura.serieFactura} onChange={(e) => setFactura((f) => ({ ...f, serieFactura: e.target.value.toUpperCase() }))} className="mt-1 block w-full rounded border px-2 py-2" /></label>
          <label className="text-sm">Número *<input value={factura.numeroFactura} onChange={(e) => setFactura((f) => ({ ...f, numeroFactura: e.target.value }))} className="mt-1 block w-full rounded border px-2 py-2" /></label>
          <label className="text-sm">Fecha factura *<input type="date" max={hoy()} value={factura.fechaFactura} onChange={(e) => setFactura((f) => ({ ...f, fechaFactura: e.target.value }))} className="mt-1 block w-full rounded border px-2 py-2" /></label>
        </div>
        <div className="mt-4"><BuscadorProducto onSelect={agregar} autoFocus={false} /></div>

        <div className="mt-3 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-2 py-2">Producto</th><th className="px-2 text-right">Cantidad</th><th className="px-2 text-right">Costo unit.</th><th className="px-2 text-right">Descuento (Q)</th>
                <th className="px-2 text-right">Subtotal</th>{puede('productos.precios') && <th className="px-2 text-right">Nuevo precio venta</th>}{puede('finanzas.costos') && <th className="px-2 text-right">Margen</th>}<th />
              </tr>
            </thead>
            <tbody>
              {calc.filas.map((l) => (
                <tr key={l.productoId} className="border-t">
                  <td className="px-2 py-1.5"><div className="font-medium">{l.nombre}</div><div className="text-xs text-gray-500">{l.sku} · precio actual {Q(l.precioActual)}</div></td>
                  <td className="px-2 text-right"><input type="number" min="0" step="1" value={l.cantidad} onChange={(e) => cambiar(l.productoId, 'cantidad', e.target.value)} className="w-20 rounded border px-2 py-1 text-right" aria-label="Cantidad" /></td>
                  <td className="px-2 text-right"><input type="number" min="0" step="0.01" value={l.costoUnitario} onChange={(e) => cambiar(l.productoId, 'costoUnitario', e.target.value)} className="w-24 rounded border px-2 py-1 text-right" aria-label="Costo unitario" /></td>
                  <td className="px-2 text-right"><input type="number" min="0" step="0.01" value={l.descuento} onChange={(e) => cambiar(l.productoId, 'descuento', e.target.value)} className="w-24 rounded border px-2 py-1 text-right" aria-label="Descuento" /></td>
                  <td className="px-2 text-right tabular-nums">{Q(l.subtotal)}</td>
                  {puede('productos.precios') && <td className="px-2 text-right"><input type="number" min="0" step="0.01" placeholder={l.precioActual.toFixed(2)} value={l.precioVenta} onChange={(e) => cambiar(l.productoId, 'precioVenta', e.target.value)} className="w-24 rounded border px-2 py-1 text-right" aria-label="Nuevo precio de venta" /></td>}
                  {puede('finanzas.costos') && <td className={`px-2 text-right text-xs ${l.margen < 10 ? 'text-red-600' : 'text-gray-600'}`}>{l.costoUnitario !== '' ? `${l.margen.toFixed(1)}%` : '—'}</td>}
                  <td className="px-2"><button type="button" aria-label={`Quitar ${l.nombre}`} onClick={() => setLineas((ls) => ls.filter((x) => x.productoId !== l.productoId))} className="p-1 text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
              {!lineas.length && <tr><td colSpan={8} className="py-8 text-center text-gray-500">Busque y agregue los productos de la factura</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <input value={factura.observacion} onChange={(e) => setFactura((f) => ({ ...f, observacion: e.target.value }))} placeholder="Observación (opcional)" className="min-w-[240px] flex-1 rounded border px-3 py-2 text-sm" />
          <div className="flex items-center gap-4">
            <span className="text-lg">Total <strong className="tabular-nums">{Q(calc.total)}</strong></span>
            <button type="button" disabled={!valida || guardando} onClick={guardar} className="flex items-center gap-2 rounded-lg bg-green-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> {guardando ? 'Guardando…' : 'Registrar compra'}</button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h3 className="font-medium">Compras de los últimos 30 días</h3>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-gray-600"><tr><th className="py-1">Fecha</th><th>Proveedor</th><th>Factura</th><th className="text-right">Líneas</th><th className="text-right">Total</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {recientes.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-1.5">{c.fechaContable.slice(0, 10)}</td><td>{c.proveedor?.razonSocial ?? c.proveedor?.nombres}</td><td>{c.serieFactura}-{c.numeroFactura}</td>
                <td className="text-right">{c._count?.detalles}</td><td className="text-right tabular-nums">{Q(c.total)}</td><td className="text-xs">{c.estado}</td>
                <td className="text-right">{c.estado === 'CONFIRMADO' && puede('compras.anular') && <button type="button" onClick={() => setAnulando(c)} className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"><Ban className="h-3 w-3" /> Anular</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {importando && (
        <ImportarFactura
          onCerrar={() => { setImportando(false); if (params.has('importar')) setParams({}, { replace: true }) }}
          onListo={(r) => {
            setFactura({ proveedorId: String(r.proveedorId), serieFactura: r.serieFactura, numeroFactura: r.numeroFactura, fechaFactura: r.fechaFactura, observacion: `Importada de FEL ${r.uuidFel}` })
            setLineas(r.lineas)
            setImportada({ uuidFel: r.uuidFel, aprendizaje: r.aprendizaje })
            setImportando(false)
            if (params.has('importar')) setParams({}, { replace: true })
            // El proveedor pudo crearse en la importación: se recarga la lista
            api.get('/terceros/proveedores', { params: { limit: 0 } }).then(({ data }) => setProveedores(data.data))
          }}
        />
      )}
      {anulando && <AnularCompra compra={anulando} onCerrar={() => setAnulando(null)} onListo={() => { setAnulando(null); cargarRecientes() }} />}
    </div>
  )
}

function AnularCompra({ compra, onCerrar, onListo }) {
  const [motivo, setMotivo] = useState('')
  const enviar = async () => {
    try {
      const { data } = await api.post(`/compras/${compra.id}/anular`, { motivo })
      showToast({ type: 'success', message: data.message })
      onListo()
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }
  return (
    <Modal abierto titulo={`Anular factura ${compra.serieFactura}-${compra.numeroFactura}`} onCerrar={onCerrar} ancho="max-w-md"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={motivo.trim().length < 10} onClick={enviar} className="rounded-lg bg-red-600 px-3 py-2 text-white disabled:opacity-50">Anular</button></>}>
      <p className="text-sm text-gray-600">La mercadería se descarga del inventario. Si ya se vendió parte, el sistema no permitirá anular.</p>
      <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (mín. 10 caracteres)" className="mt-3 w-full rounded-lg border px-3 py-2" />
    </Modal>
  )
}
