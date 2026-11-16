// Código de este equipo: se le dicta a ALEXUS para una licencia por archivo (tienda sin internet) o una transferencia.
import { useState } from 'react'
import { Copy, Monitor } from 'lucide-react'

export default function CodigoEquipo({ codigo }) {
  const [copiado, setCopiado] = useState(false)
  if (!codigo) return null
  const copiar = async () => { try { await navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sin portapapeles */ } }
  return (
    <div className="rounded-control border border-dashed bg-gray-50 px-4 py-3 text-sm">
      <p className="flex items-center gap-1.5 text-gray-600"><Monitor className="h-4 w-4" aria-hidden /> Código de este equipo</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className="text-lg font-semibold tracking-widest" aria-label="Código de este equipo">{codigo}</code>
        <button type="button" onClick={copiar} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><Copy className="h-3.5 w-3.5" aria-hidden /> {copiado ? 'Copiado' : 'Copiar'}</button>
      </div>
      <p className="mt-1 text-xs text-gray-500">Si esta tienda no tiene internet, díctele este código a ALEXUS para recibir su licencia en un archivo.</p>
    </div>
  )
}
