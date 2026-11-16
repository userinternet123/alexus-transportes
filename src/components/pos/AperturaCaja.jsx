import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { errorApi } from './formato'

/** Se muestra cuando el usuario no tiene caja abierta (el API exige caja para vender). */
export default function AperturaCaja({ onAbierta }) {
  const [cajas, setCajas] = useState([])
  const [cajaId, setCajaId] = useState('')
  const [fondo, setFondo] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api.get('/catalogos/cajas', { params: { limit: 0 } }).then(({ data }) => {
      setCajas(data.data)
      if (data.data.length === 1) setCajaId(String(data.data[0].id))
    })
  }, [])

  const abrir = async (e) => {
    e.preventDefault()
    setEnviando(true)
    try {
      await api.post('/caja/abrir', { cajaId: Number(cajaId), montoApertura: Number(fondo || 0) })
      showToast({ type: 'success', message: 'Caja abierta' })
      onAbierta?.()
    } catch (err) {
      showToast({ type: 'error', message: errorApi(err).mensaje })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={abrir} className="mx-auto mt-16 max-w-sm rounded-xl border bg-white p-6">
      <Wallet className="h-8 w-8 text-green-700" aria-hidden />
      <h2 className="mt-2 text-xl font-semibold">Abra su caja para vender</h2>
      <p className="mt-1 text-sm text-gray-600">Cuente el fondo inicial antes de abrir. Se usará al cuadrar al final del turno.</p>
      <label className="mt-4 block text-sm" htmlFor="caja">Caja</label>
      <select id="caja" required value={cajaId} onChange={(e) => setCajaId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2">
        <option value="">Seleccione…</option>
        {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <label className="mt-3 block text-sm" htmlFor="fondo">Fondo inicial (Q)</label>
      <input id="fondo" type="number" step="0.01" min="0" value={fondo} onChange={(e) => setFondo(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-right" placeholder="0.00" />
      <button disabled={!cajaId || enviando} className="mt-5 w-full rounded-lg bg-green-700 py-2 font-semibold text-white disabled:opacity-50">
        {enviando ? 'Abriendo…' : 'Abrir caja'}
      </button>
    </form>
  )
}
