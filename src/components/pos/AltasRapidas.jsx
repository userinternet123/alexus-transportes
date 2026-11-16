// Altas rápidas desde el POS: cliente nuevo cuando el NIT no existe y
// producto nuevo (o corrección) cuando el código de barras no existe.
import { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import Modal from '../comun/Modal'
import Campo from '../comun/Campo'
import ResumenErrores from '../forms/ResumenErrores'
import { useValidacion } from '../../hooks/useValidacion'
import { errorApi } from './formato'

/** Datos que se piden al crear un cliente desde el punto de venta (el NIT siempre; CF si no tiene). */
const camposClienteRapido = (tipo) => [
  { name: 'nit', label: 'NIT', type: 'text', required: true },
  tipo === 'PERSONA' ? { name: 'nombres', label: 'Nombres', type: 'text', required: true, minLength: 2 } : { name: 'razonSocial', label: 'Razón social', type: 'text', required: true, minLength: 3 },
  { name: 'telefono', label: 'Teléfono', type: 'text' },
  { name: 'email', label: 'Correo', type: 'text' },
]

export function ClienteRapido({ inicial, onCreado, onCerrar }) {
  const esNit = /^[0-9]+K?$/i.test(inicial.trim())
  const [f, setF] = useState({ tipo: 'PERSONA', nit: esNit ? inicial.trim().toUpperCase() : 'CF', nombres: esNit ? '' : inicial.trim(), apellidos: '', razonSocial: '', telefono: '', email: '', direccion: '' })
  const [enviando, setEnviando] = useState(false)
  const campos = useMemo(() => camposClienteRapido(f.tipo), [f.tipo])
  const v = useValidacion(campos)
  const set = (k) => (e) => { v.alCambiar(k); setF((x) => ({ ...x, [k]: e.target.value })) }

  const guardar = async () => {
    const r = v.validar(f) // lo que falta queda marcado en su campo y el cursor va al primero
    if (!r.ok) return
    setEnviando(true)
    try {
      const datos = Object.fromEntries(Object.entries(r.valores).filter(([, val]) => val !== ''))
      const { data } = await api.post('/terceros/clientes', datos)
      showToast({ type: 'success', message: 'Cliente creado' })
      onCreado(data.data)
    } catch (e) {
      v.delServidor(e)
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setEnviando(false) }
  }

  return (
    <Modal abierto titulo="Nuevo cliente" onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={enviando} onClick={guardar} className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50">{enviando ? 'Guardando…' : 'Crear y usar'}</button></>}>
      <ResumenErrores lista={v.lista} />
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <label className="md:col-span-2 flex gap-4">
          {['PERSONA', 'EMPRESA'].map((t) => <span key={t} className="flex items-center gap-1"><input type="radio" name="tipo" checked={f.tipo === t} onChange={() => setF((x) => ({ ...x, tipo: t }))} /> {t === 'PERSONA' ? 'Persona' : 'Empresa'}</span>)}
        </label>
        <Campo etiqueta="NIT" id="nit" requerido error={v.error('nit')}><input autoFocus value={f.nit} onChange={set('nit')} onBlur={() => v.alSalir('nit', f)} className="mt-1 w-full rounded border px-3 py-2 uppercase" placeholder="1234567K o CF" /></Campo>
        <Campo etiqueta="Teléfono" id="telefono" error={v.error('telefono')}><input value={f.telefono} onChange={set('telefono')} onBlur={() => v.alSalir('telefono', f)} className="mt-1 w-full rounded border px-3 py-2" /></Campo>
        {f.tipo === 'PERSONA' ? (
          <>
            <Campo etiqueta="Nombres" id="nombres" requerido error={v.error('nombres')}><input value={f.nombres} onChange={set('nombres')} onBlur={() => v.alSalir('nombres', f)} className="mt-1 w-full rounded border px-3 py-2" /></Campo>
            <Campo etiqueta="Apellidos" id="apellidos"><input value={f.apellidos} onChange={set('apellidos')} className="mt-1 w-full rounded border px-3 py-2" /></Campo>
          </>
        ) : (
          <Campo etiqueta="Razón social" id="razonSocial" requerido className="md:col-span-2" error={v.error('razonSocial')}><input value={f.razonSocial} onChange={set('razonSocial')} onBlur={() => v.alSalir('razonSocial', f)} className="mt-1 w-full rounded border px-3 py-2" /></Campo>
        )}
        <Campo etiqueta="Correo (para la factura)" id="email" error={v.error('email')}><input type="email" value={f.email} onChange={set('email')} onBlur={() => v.alSalir('email', f)} className="mt-1 w-full rounded border px-3 py-2" /></Campo>
        <Campo etiqueta="Dirección" id="direccion"><input value={f.direccion} onChange={set('direccion')} className="mt-1 w-full rounded border px-3 py-2" /></Campo>
      </div>
    </Modal>
  )
}

/** Código no encontrado: corregirlo o crear el producto (si tiene permiso). */
/** Datos que se piden al crear un producto desde el punto de venta. */
const CAMPOS_PRODUCTO_RAPIDO = [
  { name: 'sku', label: 'SKU', type: 'text', required: true },
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, minLength: 2 },
  { name: 'precioVenta', label: 'Precio de venta', type: 'number', required: true, min: 0.01 },
  { name: 'presentacionId', label: 'Presentación', type: 'select', required: true },
  { name: 'subgrupoId', label: 'Sub-agrupación', type: 'select', required: true },
]

export function ProductoNoEncontrado({ codigo, puedeCrear, onCreado, onCorregir }) {
  const [creando, setCreando] = useState(false)
  const [catalogos, setCatalogos] = useState({ subgrupos: [], presentaciones: [] })
  const soloDigitos = /^\d{6,}$/.test(codigo)
  const [f, setF] = useState({ sku: codigo.toUpperCase().slice(0, 40), codigoBarra: soloDigitos ? codigo : '', nombre: soloDigitos ? '' : codigo, precioVenta: '', subgrupoId: '', presentacionId: '' })
  const v = useValidacion(CAMPOS_PRODUCTO_RAPIDO)
  const set = (k) => (e) => { v.alCambiar(k); setF((x) => ({ ...x, [k]: e.target.value })) }

  useEffect(() => {
    if (!creando) return
    Promise.all([api.get('/catalogos/subgrupos', { params: { limit: 0 } }), api.get('/catalogos/presentaciones', { params: { limit: 0 } })])
      .then(([s, p]) => {
        setCatalogos({ subgrupos: s.data.data, presentaciones: p.data.data })
        setF((x) => ({ ...x, presentacionId: x.presentacionId || String(p.data.data.find((y) => y.nombre === 'Unidad')?.id ?? '') }))
      })
      .catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))
  }, [creando])

  const guardar = async () => {
    const r = v.validar(f) // lo que falta queda marcado en su campo y el cursor va al primero
    if (!r.ok) return
    try {
      const { data } = await api.post('/productos', {
        sku: r.valores.sku, codigoBarra: r.valores.codigoBarra || null, nombre: r.valores.nombre, precioVenta: Number(f.precioVenta),
        subgrupoId: Number(f.subgrupoId), presentacionId: Number(f.presentacionId),
      })
      onCreado(data.data)
    } catch (e) {
      v.delServidor(e)
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  if (!creando) {
    return (
      <Modal abierto titulo="Producto no encontrado" onCerrar={onCorregir} ancho="max-w-md"
        pie={<>
          <button type="button" autoFocus onClick={onCorregir} className="rounded-lg border px-3 py-2">Corregir el código</button>
          {puedeCrear && <button type="button" onClick={() => setCreando(true)} className="rounded-lg bg-green-700 px-3 py-2 text-white">Crear producto</button>}
        </>}>
        <p className="text-sm">No existe un producto activo con el código <code className="rounded bg-gray-100 px-1.5">{codigo}</code>.</p>
        {!puedeCrear && <p className="mt-2 text-sm text-gray-600">Para darlo de alta, pida a un encargado que lo cree en Productos.</p>}
      </Modal>
    )
  }
  return (
    <Modal abierto titulo="Crear producto" onCerrar={onCorregir} ancho="max-w-lg"
      pie={<><button type="button" onClick={onCorregir} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" onClick={guardar} className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50">Crear</button></>}>
      <ResumenErrores lista={v.lista} />
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <Campo etiqueta="SKU" id="sku" requerido error={v.error('sku')}><input value={f.sku} onChange={set('sku')} className="mt-1 w-full rounded border px-3 py-2 uppercase" /></Campo>
        <Campo etiqueta="Código de barras" id="codigoBarra"><input value={f.codigoBarra} onChange={set('codigoBarra')} className="mt-1 w-full rounded border px-3 py-2" /></Campo>
        <Campo etiqueta="Nombre" id="nombre" requerido className="md:col-span-2" error={v.error('nombre')}><input autoFocus value={f.nombre} onChange={set('nombre')} className="mt-1 w-full rounded border px-3 py-2" /></Campo>
        <Campo etiqueta="Precio de venta (Q)" id="precioVenta" requerido error={v.error('precioVenta')}><input type="number" min="0" step="0.01" value={f.precioVenta} onChange={set('precioVenta')} className="mt-1 w-full rounded border px-3 py-2 text-right" /></Campo>
        <Campo etiqueta="Presentación" id="presentacionId" requerido error={v.error('presentacionId')}>
          <select value={f.presentacionId} onChange={set('presentacionId')} className="mt-1 w-full rounded border px-3 py-2">
            <option value="">Seleccione…</option>{catalogos.presentaciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Sub-agrupación" id="subgrupoId" requerido className="md:col-span-2" error={v.error('subgrupoId')}>
          <select value={f.subgrupoId} onChange={set('subgrupoId')} className="mt-1 w-full rounded border px-3 py-2">
            <option value="">Seleccione…</option>{catalogos.subgrupos.map((s) => <option key={s.id} value={s.id}>{s.grupo?.categoria?.nombre} › {s.grupo?.nombre} › {s.nombre}</option>)}
          </select>
        </Campo>
      </div>
      <p className="mt-3 text-xs text-gray-500">El producto se crea sin existencia: para venderlo, registre su ingreso en Compras.</p>
    </Modal>
  )
}
