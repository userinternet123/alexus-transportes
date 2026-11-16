// ─────────────────────────────────────────────────────────────────────────────
// EXISTENCIAS Y KARDEX (reemplaza rptInventarioUI / ValidacionesUI)
// Inventario valorizado de la sucursal, alerta de bajo mínimo y kardex por producto.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, History, RefreshCw } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from '../pos/formato'
import Modal from '../comun/Modal'
import BotonPantallaCompleta from '../comun/BotonPantallaCompleta'

const TIPO = {
  INVENTARIO_INICIAL: 'Inventario inicial', ENTRADA_COMPRA: 'Compra', SALIDA_VENTA: 'Venta', ANULACION_VENTA: 'Anulación de venta',
  DEVOLUCION_CLIENTE: 'Devolución', ANULACION_COMPRA: 'Anulación de compra', AJUSTE_POSITIVO: 'Ajuste (+)', AJUSTE_NEGATIVO: 'Ajuste (−)',
  TRASLADO_SALIDA: 'Traslado enviado', TRASLADO_ENTRADA: 'Traslado recibido',
}
const POR_PAGINA = 100

export default function Existencias() {
  const { puede } = usePermisos()
  const veCostos = puede('finanzas.costos') // costos solo para gerencia
  const [filas, setFilas] = useState([])
  const [q, setQ] = useState('')
  const [bajoMinimo, setBajoMinimo] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [kardex, setKardex] = useState(null)

  const cargar = async () => {
    setCargando(true)
    try {
      const { data } = await api.get('/inventario/existencias', { params: { q: q || undefined, bajoMinimo } })
      setFilas(data.data)
      setPagina(1)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [bajoMinimo]) // eslint-disable-line react-hooks/exhaustive-deps

  const totales = useMemo(() => ({
    costo: filas.reduce((a, f) => a + Number(f.valorCosto), 0),
    venta: filas.reduce((a, f) => a + Number(f.cantidad) * Number(f.precioVenta), 0),
    bajo: filas.filter((f) => f.bajoMinimo).length,
    negativos: filas.filter((f) => Number(f.cantidad) < 0).length,
  }), [filas])

  const verKardex = async (f) => {
    try {
      const { data } = await api.get(`/inventario/kardex/${f.productoId}`, { params: { bodegaId: f.bodegaId } })
      setKardex({ producto: f, movimientos: data.data })
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  const visibles = filas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA))

  return (
    <div className="p-4">
      <div className="grid gap-3 md:grid-cols-4">
        {[['Productos', filas.length.toLocaleString('es-GT')], ...(veCostos ? [['Valor a costo', Q(totales.costo)]] : []), ['Valor a precio de venta', Q(totales.venta)], ['Bajo mínimo / negativos', `${totales.bajo} / ${totales.negativos}`]].map(([t, v]) => (
          <div key={t} className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">{t}</p><p className="text-xl font-semibold tabular-nums">{v}</p></div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && cargar()} placeholder="Nombre, SKU o código de barras" className="min-w-[240px] flex-1 rounded border px-3 py-2" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bajoMinimo} onChange={(e) => setBajoMinimo(e.target.checked)} /> Solo bajo mínimo</label>
        <BotonPantallaCompleta vista="existencias" />
        <button type="button" onClick={cargar} disabled={cargando} className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50"><RefreshCw className="h-4 w-4" /> {cargando ? 'Cargando…' : 'Buscar'}</button>
      </div>

      <div className="mt-3 overflow-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-3 py-2">SKU</th><th className="px-3">Producto</th><th className="px-3">Marca</th><th className="px-3">Bodega</th><th className="px-3 text-right">Existencia</th><th className="px-3 text-right">Mínimo</th>{veCostos && <><th className="px-3 text-right">Costo prom.</th><th className="px-3 text-right">Valor costo</th></>}<th className="px-3 text-right">Precio</th><th /></tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={`${f.productoId}-${f.bodegaId}`} className="border-t">
                <td className="px-3 py-1.5 text-gray-600">{f.sku}</td>
                <td className="px-3">{f.producto}</td><td className="px-3 text-gray-600">{f.marca}</td><td className="px-3 text-gray-600">{f.bodega}</td>
                <td className={`px-3 text-right tabular-nums ${Number(f.cantidad) < 0 ? 'font-semibold text-red-600' : f.bajoMinimo ? 'text-amber-600' : ''}`}>
                  {f.bajoMinimo && <AlertTriangle className="mr-1 inline h-3 w-3" aria-label="Bajo mínimo" />}{Number(f.cantidad)}
                </td>
                <td className="px-3 text-right text-gray-500">{Number(f.stockMinimo)}</td>
                {veCostos && <><td className="px-3 text-right tabular-nums">{Q(f.costoPromedio)}</td><td className="px-3 text-right tabular-nums">{Q(f.valorCosto)}</td></>}<td className="px-3 text-right tabular-nums">{Q(f.precioVenta)}</td>
                <td className="px-3 text-right">{puede('inventario.kardex') && <button type="button" onClick={() => verKardex(f)} className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline"><History className="h-3 w-3" /> Kardex</button>}</td>
              </tr>
            ))}
            {!filas.length && !cargando && <tr><td colSpan={veCostos ? 10 : 8} className="py-10 text-center text-gray-500">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Anterior</button>
          <span>Página {pagina} de {paginas}</span>
          <button type="button" disabled={pagina === paginas} onClick={() => setPagina((p) => p + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Siguiente</button>
        </div>
      )}

      <Modal abierto={Boolean(kardex)} titulo={kardex ? `Kardex — ${kardex.producto.producto} (${kardex.producto.bodega})` : ''} onCerrar={() => setKardex(null)} ancho="max-w-4xl">
        {kardex && (
          <table className="w-full text-sm">
            <thead className="text-left text-gray-600"><tr><th className="py-1">Fecha</th><th>Movimiento</th><th>Documento</th><th className="text-right">Cantidad</th>{veCostos && <th className="text-right">Costo unit.</th>}<th className="text-right">Saldo</th>{veCostos && <th className="text-right">Costo prom.</th>}</tr></thead>
            <tbody>
              {kardex.movimientos.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-1.5">{new Date(m.fecha).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{TIPO[m.tipo] ?? m.tipo}</td><td className="text-gray-500">{m.documentoTipo} #{m.documentoId}</td>
                  <td className={`text-right tabular-nums ${Number(m.cantidad) < 0 ? 'text-red-600' : 'text-green-700'}`}>{Number(m.cantidad) > 0 ? '+' : ''}{Number(m.cantidad)}</td>
                  {veCostos && <td className="text-right tabular-nums">{Q(m.costoUnitario)}</td>}<td className="text-right font-medium tabular-nums">{Number(m.saldoCantidad)}</td>{veCostos && <td className="text-right tabular-nums">{Q(m.saldoCostoPromedio)}</td>}
                </tr>
              ))}
              {!kardex.movimientos.length && <tr><td colSpan={7} className="py-6 text-center text-gray-500">Sin movimientos</td></tr>}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  )
}
