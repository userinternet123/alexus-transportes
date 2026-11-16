// Aviso de versión nueva (solo administradores). Las actualizaciones se
// instalan con el mismo instalador: respalda la base, migra y verifica.
import { Download, ShieldAlert, Sparkles } from 'lucide-react'

export default function AvisoActualizacion({ actualizacion, versionActual }) {
  if (!actualizacion) return null
  const critica = actualizacion.critica
  return (
    <div className={`rounded-tarjeta border p-4 ${critica ? 'border-red-300 bg-red-50' : 'border-green-200 bg-green-50'}`} role="status">
      <div className="flex items-start gap-3">
        {critica ? <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden /> : <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden />}
        <div className="flex-1">
          <p className={`font-semibold ${critica ? 'text-red-800' : 'text-green-900'}`}>
            {critica ? `Actualización de seguridad disponible: versión ${actualizacion.version}` : `Nueva versión disponible: ${actualizacion.version}`}
          </p>
          <p className="text-sm text-gray-700">Tiene instalada la versión {versionActual}. {critica ? 'Instálela lo antes posible.' : ''}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{actualizacion.notas}</p>
          <p className="mt-2 text-xs text-gray-500">Ejecute el instalador en el servidor de la tienda fuera del horario de ventas: respalda la base de datos y conserva todos los datos.</p>
          <a href={actualizacion.url} target="_blank" rel="noopener noreferrer"
            className={`mt-2 inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-sm font-medium text-white ${critica ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
            <Download className="h-4 w-4" aria-hidden /> Descargar instalador
          </a>
          <p className="mt-1 break-all text-[11px] text-gray-400">SHA-256: {actualizacion.sha256}</p>
        </div>
      </div>
    </div>
  )
}
