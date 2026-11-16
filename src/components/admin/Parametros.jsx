// Parámetros del sistema (IVA, tasas de planilla, tolerancia de caja…) editables sin programar.
import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { errorApi } from '../pos/formato'

export default function Parametros() {
  const [lista, setLista] = useState([])
  const [editados, setEditados] = useState({})
  const cargar = () => api.get('/config/parametros').then(({ data }) => setLista(data.data))
  useEffect(() => { cargar() }, [])

  const guardar = async (clave) => {
    try {
      await api.put(`/config/parametros/${clave}`, { valor: String(editados[clave]) })
      showToast({ type: 'success', message: 'Parámetro actualizado' })
      setEditados(({ [clave]: _, ...resto }) => resto)
      cargar()
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  const porModulo = lista.reduce((acc, p) => ({ ...acc, [p.modulo]: [...(acc[p.modulo] ?? []), p] }), {})
  return (
    <div className="space-y-4 p-4">
      {Object.entries(porModulo).map(([modulo, items]) => (
        <section key={modulo} className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">{modulo}</h3>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {items.map((p) => {
                const valor = editados[p.clave] ?? p.valor
                return (
                  <tr key={p.clave} className="border-t">
                    <td className="py-2 pr-3"><div>{p.descripcion}</div><code className="text-xs text-gray-500">{p.clave}</code></td>
                    <td className="w-48">
                      {p.tipo === 'boolean' ? (
                        <select value={valor} onChange={(e) => setEditados((x) => ({ ...x, [p.clave]: e.target.value }))} className="w-full rounded border px-2 py-1"><option value="true">Sí</option><option value="false">No</option></select>
                      ) : (
                        <input value={valor} onChange={(e) => setEditados((x) => ({ ...x, [p.clave]: e.target.value }))} className="w-full rounded border px-2 py-1 text-right" />
                      )}
                    </td>
                    <td className="w-24 text-right">
                      {p.clave in editados && <button type="button" onClick={() => guardar(p.clave)} className="inline-flex items-center gap-1 rounded bg-green-700 px-2 py-1 text-xs text-white"><Save className="h-3 w-3" /> Guardar</button>}
                      {!(p.clave in editados) && p.personalizado && <span className="text-xs text-gray-400">personalizado</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
