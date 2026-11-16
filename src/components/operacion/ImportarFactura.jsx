// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAR FACTURA FEL DEL PROVEEDOR (XML)
// 1. Se sube el XML certificado que envía el proveedor.
// 2. Cada renglón llega con el producto sugerido: aprendido de compras
//    anteriores, por código de barras o por nombre parecido (a confirmar).
// 3. Lo que no existe se crea en el momento (con precio según el margen).
// 4. "Unidades por empaque": la factura dice 1 caja, el sistema vende 12.
// Al registrar la compra, el sistema recuerda cada asignación.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Camera, CheckCircle2, FileUp, Lock, Sparkles } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from '../pos/formato'
import Modal from '../comun/Modal'
import BuscadorProducto from '../comun/BuscadorProducto'
import { prepararArchivo } from '../../utils/imagen'
import { cargarArbol, opcionesSubgrupo } from '../../utils/clasificacion'

const ETIQUETA = {
  aprendido: ['Recordado', 'bg-green-50 text-green-700'],
  codigo: ['Por código de barras', 'bg-green-50 text-green-700'],
  similar: ['Nombre parecido', 'bg-amber-50 text-amber-700'],
}
const skuDesde = (texto) => {
  const base = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
    .split(' ').filter(Boolean).slice(0, 3).map((p) => p.slice(0, 4)).join('-').slice(0, 14)
  return `${base}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
}
const redondearPrecio = (n) => Math.ceil(n * 4) / 4 // al siguiente Q0.25

export default function ImportarFactura({ onCerrar, onListo }) {
  const { puede } = usePermisos()
  const [leyendo, setLeyendo] = useState(false)
  const [res, setRes] = useState(null)
  const [renglones, setRenglones] = useState([])
  const [proveedor, setProveedor] = useState(null)
  const [nuevos, setNuevos] = useState({ subgrupoId: '', presentacionId: '', margen: 30 })
  const [catalogos, setCatalogos] = useState({ subgrupos: [], presentaciones: [] })
  const [procesando, setProcesando] = useState(false)
  const [capacidades, setCapacidades] = useState({ xml: true, ia: false })
  const [leyendoIa, setLeyendoIa] = useState(false)
  const [proveedores, setProveedores] = useState([])

  useEffect(() => {
    api.get('/compras/importar/capacidades').then(({ data }) => setCapacidades(data.data)).catch(() => {})
  }, [])

  const leerArchivo = async (archivo) => {
    if (!archivo) return
    setLeyendo(true)
    try {
      const xml = await archivo.text()
      const { data } = await api.post('/compras/importar-dte', { xml })
      mostrar(data.data)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setLeyendo(false) }
  }

  /** Foto o PDF: se comprime en el teléfono/PC y la lee la IA en el servidor (10 a 30 s). */
  const leerConIa = async (archivo) => {
    if (!archivo) return
    setLeyendoIa(true)
    try {
      const { base64, mime } = await prepararArchivo(archivo, { maxLado: 2000, calidad: 0.85 })
      const { data } = await api.post('/compras/importar-documento', { base64, mime }, { timeout: 120000 })
      mostrar(data.data)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setLeyendoIa(false) }
  }

  /** Muestra la revisión (misma para XML e IA). */
  const mostrar = (r) => {
    setRes(r)
    if (!r.proveedor) api.get('/terceros/proveedores', { params: { limit: 0 } }).then(({ data }) => setProveedores(data.data)).catch(() => {})
    setProveedor(r.proveedor)
    setRenglones(r.lineas.map((l) => ({
      ...l,
      // Acción por renglón: asignado | crear | omitir
      accion: l.tipo === 'SERVICIO' ? 'omitir' : l.sugerencia ? 'asignado' : 'crear',
      producto: l.sugerencia,
      confirmado: l.sugerencia?.metodo !== 'similar', // los parecidos se confirman a mano
      factor: l.sugerencia?.factor ?? 1,
      cambiando: false,
    })))
  }

  const hayNuevos = renglones.some((r) => r.accion === 'crear')
  useEffect(() => {
    if (!hayNuevos || catalogos.subgrupos.length) return
    const lista = (ruta) => api.get(ruta, { params: { limit: 0 } }).then((x) => x.data.data).catch(() => [])
    Promise.all([cargarArbol().then(opcionesSubgrupo).catch(() => []), lista('/catalogos/presentaciones')]).then(([subgrupos, presentaciones]) => {
      setCatalogos({ subgrupos, presentaciones })
      setNuevos((n) => ({ ...n, presentacionId: n.presentacionId || String(presentaciones.find((p) => p.nombre === 'Unidad')?.id ?? '') }))
    })
  }, [hayNuevos]) // eslint-disable-line react-hooks/exhaustive-deps

  const cambiar = (i, cambio) => setRenglones((rs) => rs.map((r, j) => (j === i ? { ...r, ...cambio } : r)))
  const costoNeto = (r) => (r.cantidad * r.precioUnitario - r.descuento) / (r.cantidad * (Number(r.factor) || 1))

  const pendientes = useMemo(() => renglones.filter((r) => r.accion === 'asignado' && !r.confirmado).length, [renglones])
  const listo = proveedor && !pendientes && renglones.some((r) => r.accion !== 'omitir') &&
    (!hayNuevos || (puede('productos.crear') && nuevos.subgrupoId && nuevos.presentacionId))

  const crearProveedor = async () => {
    try {
      const { data } = await api.post('/terceros/proveedores', { tipo: 'EMPRESA', nit: res.factura.emisor.nit, razonSocial: res.factura.emisor.nombre })
      setProveedor({ id: data.data.id, nombre: res.factura.emisor.nombre })
      showToast({ type: 'success', message: 'Proveedor creado' })
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  /** Crea los productos nuevos y arma las líneas de la compra (uniendo renglones del mismo producto). */
  const pasarACompra = async () => {
    setProcesando(true)
    try {
      const finales = []
      for (const r of renglones) {
        if (r.accion === 'omitir') continue
        let producto = r.producto
        if (r.accion === 'crear') {
          const precio = redondearPrecio(costoNeto(r) * (1 + Number(nuevos.margen) / 100))
          const { data } = await api.post('/productos', {
            sku: skuDesde(r.descripcion), nombre: r.descripcion.replace(/\s+/g, ' ').trim().slice(0, 150), precioVenta: precio,
            codigoBarra: r.codigoBarra, subgrupoId: Number(nuevos.subgrupoId), presentacionId: Number(nuevos.presentacionId),
          })
          producto = { productoId: data.data.id, nombre: data.data.nombre, sku: data.data.sku, precioVenta: String(precio) }
        }
        finales.push({ r, producto })
      }
      const porProducto = new Map()
      for (const { r, producto } of finales) {
        const factor = Number(r.factor) || 1
        const cantidad = r.cantidad * factor
        const previo = porProducto.get(producto.productoId)
        const bruto = r.cantidad * r.precioUnitario // monto antes de descuento
        if (previo) {
          previo.cantidad += cantidad
          previo.bruto += bruto
          previo.descuento += r.descuento
        } else {
          porProducto.set(producto.productoId, { productoId: producto.productoId, nombre: producto.nombre, sku: producto.sku, precioActual: Number(producto.precioVenta ?? 0), cantidad, bruto, descuento: r.descuento })
        }
      }
      const lineas = [...porProducto.values()].map((l) => ({
        productoId: l.productoId, nombre: l.nombre, sku: l.sku, precioActual: l.precioActual,
        cantidad: +l.cantidad.toFixed(3), costoUnitario: (l.bruto / l.cantidad).toFixed(4), descuento: +l.descuento.toFixed(2), precioVenta: '',
      }))
      onListo({
        proveedorId: proveedor.id,
        serieFactura: res.factura.serie,
        numeroFactura: res.factura.numero,
        fechaFactura: res.factura.fecha || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date()),
        uuidFel: res.factura.uuid,
        lineas,
        aprendizaje: finales.map(({ r, producto }) => ({ descripcion: r.descripcion, productoId: producto.productoId, factor: Number(r.factor) || 1 })),
      })
    } catch (e) {
      showToast({ type: 'error', message: `No se pudo crear un producto: ${errorApi(e).mensaje}` })
    } finally { setProcesando(false) }
  }

  // ── Paso 1: elegir cómo importar ──
  if (!res) {
    const ocupado = leyendo || leyendoIa
    return (
      <Modal abierto titulo="Importar factura del proveedor" onCerrar={onCerrar} ancho="max-w-2xl">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-tarjeta border-2 border-dashed px-4 py-8 text-center hover:border-green-600 hover:bg-green-50 ${ocupado ? 'pointer-events-none opacity-60' : ''}`}>
            <FileUp className="h-8 w-8 text-green-700" aria-hidden />
            <span className="font-medium">{leyendo ? 'Leyendo la factura…' : 'Archivo XML (FEL)'}</span>
            <span className="text-xs text-gray-500">Exacto y sin costo. Es el archivo que el proveedor envía por correo junto al PDF.</span>
            <input type="file" accept=".xml,text/xml,application/xml" className="sr-only" disabled={ocupado} onChange={(e) => leerArchivo(e.target.files?.[0])} />
          </label>

          {capacidades.ia ? (
            <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-tarjeta border-2 border-dashed px-4 py-8 text-center hover:border-green-600 hover:bg-green-50 ${ocupado ? 'pointer-events-none opacity-60' : ''}`}>
              <Camera className="h-8 w-8 text-green-700" aria-hidden />
              <span className="font-medium">{leyendoIa ? 'Leyendo con IA (hasta 30 s)…' : 'Foto o PDF'}</span>
              <span className="text-xs text-gray-500">La IA lee cualquier factura. Tome la foto de frente, con buena luz y sin cortar los bordes.</span>
              <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" disabled={ocupado} onChange={(e) => leerConIa(e.target.files?.[0])} />
            </label>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-tarjeta border-2 border-dashed border-gray-200 px-4 py-8 text-center text-gray-500">
              <Lock className="h-8 w-8" aria-hidden />
              <span className="font-medium">Foto o PDF</span>
              <span className="text-xs">{capacidades.iaEnPlan ? 'Falta configurar la clave de IA en el servidor (IA_API_KEY).' : 'Disponible con el módulo "Lectura de facturas con IA".'}</span>
            </div>
          )}
        </div>
      </Modal>
    )
  }

  // ── Paso 2: revisar ──
  const f = res.factura
  return (
    <Modal abierto titulo={f.numero ? `Factura ${f.serie ? `${f.serie}-` : ''}${f.numero}${res.origen === 'ia' ? ' (leída con IA)' : ''}` : 'Factura leída con IA'} onCerrar={onCerrar} ancho="max-w-5xl"
      pie={<>
        {pendientes > 0 && <span className="mr-auto self-center text-sm text-amber-700">Confirme {pendientes} producto{pendientes > 1 ? 's' : ''} con nombre parecido</span>}
        <button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button>
        <button type="button" disabled={!listo || procesando} onClick={pasarACompra} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">
          {procesando ? 'Preparando…' : 'Pasar a la compra'}
        </button>
      </>}>
      {res.advertencias.map((a) => (
        <p key={a} className="mb-2 flex items-start gap-2 rounded-tarjeta bg-amber-50 px-3 py-2 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {a}</p>
      ))}

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-tarjeta bg-gray-50 p-3">
          <p className="text-gray-500">Proveedor</p>
          {proveedor
            ? <p className="font-medium">{proveedor.nombre}</p>
            : (
              <>
                <p className="font-medium">{f.emisor.nombre || 'Proveedor no leído'}</p>
                <p className="text-xs text-gray-500">{f.emisor.nit ? `NIT ${f.emisor.nit}: no está registrado` : 'No se leyó el NIT'}</p>
                {puede('terceros.crear') && f.emisor.nit && <button type="button" onClick={crearProveedor} className="mt-1 text-sm font-medium text-green-700 hover:underline">Crear proveedor</button>}
                <select value="" onChange={(e) => { const p = proveedores.find((x) => String(x.id) === e.target.value); if (p) setProveedor({ id: p.id, nombre: p.razonSocial ?? p.nombres }) }} className="mt-1 block w-full rounded-control border px-2 py-1 text-sm" aria-label="Elegir un proveedor existente">
                  <option value="">O elegir uno existente…</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razonSocial ?? p.nombres} {p.nit ? `(${p.nit})` : ''}</option>)}
                </select>
              </>
            )}
        </div>
        <div className="rounded-tarjeta bg-gray-50 p-3"><p className="text-gray-500">Fecha de la factura</p><p className="font-medium">{f.fecha}</p></div>
        <div className="rounded-tarjeta bg-gray-50 p-3"><p className="text-gray-500">Total de la factura</p><p className="cifra text-lg font-semibold">{Q(f.total)}</p></div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[13px] text-gray-500">
            <tr><th className="py-2">En la factura</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="pl-4">Producto en SPVI</th><th className="text-right" title="Unidades por empaque">Unid. por empaque</th><th className="text-right">Costo unitario</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {renglones.map((r, i) => (
              <tr key={r.linea} className={`align-top ${r.accion === 'omitir' ? 'opacity-50' : ''}`}>
                <td className="py-2.5 pr-2">
                  <p className="font-medium">{r.descripcion}</p>
                  {r.tipo === 'SERVICIO' && <p className="text-xs text-gray-500">Servicio: no entra al inventario</p>}
                </td>
                <td className="cifra pt-2.5 text-right">{r.cantidad} <span className="text-xs text-gray-500">{r.unidad}</span></td>
                <td className="cifra pt-2.5 text-right">{Q(r.precioUnitario)}</td>
                <td className="py-2 pl-4" style={{ minWidth: 300 }}>
                  {r.cambiando ? (
                    <div>
                      <BuscadorProducto autoFocus placeholder="Buscar el producto correcto" onSelect={(p) => cambiar(i, { producto: { productoId: p.id, nombre: p.nombre, sku: p.sku, precioVenta: p.precioVenta, metodo: 'manual' }, accion: 'asignado', confirmado: true, cambiando: false })} />
                      <button type="button" onClick={() => cambiar(i, { cambiando: false })} className="mt-1 text-xs text-gray-500 underline">Cancelar</button>
                    </div>
                  ) : r.accion === 'asignado' ? (
                    <div>
                      <p className="font-medium">{r.producto.nombre} <span className="text-xs font-normal text-gray-500">{r.producto.sku}</span></p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {ETIQUETA[r.producto.metodo] && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${ETIQUETA[r.producto.metodo][1]}`}>{r.producto.metodo === 'aprendido' ? <Sparkles className="h-3 w-3" /> : null}{ETIQUETA[r.producto.metodo][0]}{r.producto.similitud ? ` ${r.producto.similitud}%` : ''}</span>}
                        {!r.confirmado && <button type="button" onClick={() => cambiar(i, { confirmado: true })} className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-white"><CheckCircle2 className="h-3 w-3" /> Es este</button>}
                        <button type="button" onClick={() => cambiar(i, { cambiando: true })} className="text-green-700 hover:underline">Cambiar</button>
                        <button type="button" onClick={() => cambiar(i, { accion: 'crear' })} className="text-gray-600 hover:underline">Crear nuevo</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <select value={r.accion} onChange={(e) => cambiar(i, { accion: e.target.value })} className="rounded-control border px-2 py-1 text-sm" aria-label="Qué hacer con este renglón">
                        <option value="crear" disabled={!puede('productos.crear')}>Crear producto nuevo</option>
                        <option value="omitir">No ingresar</option>
                      </select>
                      <button type="button" onClick={() => cambiar(i, { cambiando: true })} className="text-green-700 hover:underline">Buscar en el catálogo</button>
                    </div>
                  )}
                </td>
                <td className="pt-2 text-right">
                  {r.accion !== 'omitir' && <input type="number" min="1" step="1" value={r.factor} onChange={(e) => cambiar(i, { factor: e.target.value })} className="cifra w-16 rounded-control border px-2 py-1 text-right" aria-label="Unidades por empaque" />}
                </td>
                <td className="cifra pt-2.5 text-right">
                  {r.accion !== 'omitir' && Q(costoNeto(r))}
                  {r.accion !== 'omitir' && Number(r.factor) > 1 && <p className="text-xs text-gray-500">{r.cantidad * Number(r.factor)} unidades</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hayNuevos && (
        <div className="mt-4 rounded-tarjeta border p-4">
          <p className="font-medium">Productos nuevos ({renglones.filter((r) => r.accion === 'crear').length})</p>
          {!puede('productos.crear')
            ? <p className="mt-1 text-sm text-red-600">No tiene permiso para crear productos: búsquelos en el catálogo o pida a un encargado que los cree.</p>
            : (
              <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
                <label>Sub-agrupación
                  <select value={nuevos.subgrupoId} onChange={(e) => setNuevos((n) => ({ ...n, subgrupoId: e.target.value }))} className="mt-1 w-full rounded-control border px-2 py-1.5">
                    <option value="">Elegir…</option>{catalogos.subgrupos.map((s) => <option key={s.id} value={s.id}>{s.ruta}</option>)}
                  </select>
                </label>
                <label>Presentación
                  <select value={nuevos.presentacionId} onChange={(e) => setNuevos((n) => ({ ...n, presentacionId: e.target.value }))} className="mt-1 w-full rounded-control border px-2 py-1.5">
                    <option value="">Elegir…</option>{catalogos.presentaciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </label>
                <label>Margen sobre el costo (%)
                  <input type="number" min="0" max="500" value={nuevos.margen} onChange={(e) => setNuevos((n) => ({ ...n, margen: e.target.value }))} className="cifra mt-1 w-full rounded-control border px-2 py-1.5 text-right" />
                </label>
                <p className="text-xs text-gray-500 sm:col-span-3">El precio de venta se calcula con el margen y se redondea a Q0.25. Podrá ajustar cada producto después en Productos.</p>
              </div>
            )}
        </div>
      )}
    </Modal>
  )
}
