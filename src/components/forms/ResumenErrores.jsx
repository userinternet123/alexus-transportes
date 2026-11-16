// Resumen de lo que falta o está mal al intentar guardar: cada renglón lleva el cursor a su campo.
import { AlertCircle } from 'lucide-react'
import { enfocarCampo } from '../../utils/validacion'

export default function ResumenErrores({ lista = [], titulo }) {
  if (!lista.length) return null
  return (
    <div role="alert" className="mb-4 rounded-tarjeta border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {titulo ?? (lista.length === 1 ? 'Falta corregir 1 dato' : `Faltan o hay que corregir ${lista.length} datos`)}</p>
      <ul className="mt-1.5 space-y-0.5">
        {lista.map((e) => (
          <li key={e.name}><button type="button" onClick={() => enfocarCampo(e.name)} className="text-left underline decoration-red-300 underline-offset-2 hover:decoration-red-700"><b>{e.label}:</b> {e.mensaje}</button></li>
        ))}
      </ul>
    </div>
  )
}
