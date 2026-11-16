// Producto que el cliente pide y el negocio no tiene: se agrega a la cotización como "por conseguir" (nombre y precio
// estimado). Se puede cotizar, aparece en "Qué comprar" y se podrá vender cuando llegue su compra.
import { useState } from 'react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { useValidacion } from '../../hooks/useValidacion'
import { errorApi } from './formato'
import Campo from '../comun/Campo'
import Modal from '../comun/Modal'
import ResumenErrores from '../forms/ResumenErrores'

const CAMPOS = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, minLength: 3 },
  { name: 'precioVenta', label: 'Precio estimado', type: 'number', required: true, min: 0.01 },
]

export default function PorConseguir({ onCreado, onCerrar }) {
  const [f, setF] = useState({ nombre: '', precioVenta: '' })
  const [enviando, setEnviando] = useState(false)
  const v = useValidacion(CAMPOS)
  const set = (k) => (e) => { v.alCambiar(k); setF((x) => ({ ...x, [k]: e.target.value })) }
  const guardar = async () => {
    const r = v.validar(f)
    if (!r.ok) return
    setEnviando(true)
    try {
      const { data } = await api.post('/pedidos/por-conseguir', { nombre: r.valores.nombre, precioVenta: Number(f.precioVenta) })
      showToast({ type: 'success', message: data.message })
      onCreado(data.data)
    } catch (e) { v.delServidor(e); showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  const ent = 'mt-1 w-full rounded border px-3 py-2'
  return (
    <Modal abierto titulo="Producto que no tenemos" onCerrar={onCerrar} ancho="max-w-md"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={enviando} onClick={guardar} className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50">Agregar a la cotización</button></>}>
      <p className="mb-3 text-sm text-gray-600">Se agrega como <b>por conseguir</b>: se puede cotizar, aparece en «Qué comprar» y se podrá vender cuando llegue su compra.</p>
      <ResumenErrores lista={v.lista} />
      <div className="space-y-3 text-sm">
        <Campo etiqueta="Nombre" id="nombre" requerido error={v.error('nombre')}><input autoFocus value={f.nombre} onChange={set('nombre')} placeholder="Ej. Calculadora científica Casio fx-82" className={ent} /></Campo>
        <Campo etiqueta="Precio estimado (Q)" id="precioVenta" requerido error={v.error('precioVenta')}><input type="number" min="0" step="0.01" value={f.precioVenta} onChange={set('precioVenta')} className={`${ent} text-right`} /></Campo>
      </div>
    </Modal>
  )
}
