// Selector de sucursal de trabajo para el Header. Cambiarla recarga la app
// para que todas las pantallas consulten la sucursal nueva (header X-Sucursal-Id).
import { useContext } from 'react'
import { Store } from 'lucide-react'
import { AuthContext } from '../../context/AuthContext'
import { sesion } from '../../services/api'

export default function SelectorSucursal() {
  const { user } = useContext(AuthContext)
  const sucursales = user?.usuario?.sucursales ?? []
  const actual = sesion.sucursal()
  if (sucursales.length === 0) return null

  if (sucursales.length === 1) {
    return <span className="flex items-center gap-1 text-sm"><Store className="h-4 w-4" aria-hidden /> {sucursales[0].nombre}</span>
  }
  return (
    <label className="flex items-center gap-1 text-sm">
      <Store className="h-4 w-4" aria-hidden />
      <span className="sr-only">Sucursal de trabajo</span>
      <select
        value={actual ?? ''}
        onChange={(e) => { sesion.setSucursal(e.target.value); window.location.reload() }}
        className="rounded border bg-white px-2 py-1 text-gray-900"
      >
        {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
    </label>
  )
}
