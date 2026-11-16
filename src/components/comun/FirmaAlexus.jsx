// Firma del fabricante: "SPVI by ALEXUS". Discreta: la marca protagonista es la del negocio.
// En Login e Inicio es fija (siempre). En documentos, tickets y pantalla completa se quita con la licencia "sinmarca".
import { ALEXUS } from '../../hooks/useMarca'
import { useMarcaAlexus } from '../../hooks/useMarcaAlexus'

export default function FirmaAlexus({ className = '', claro = false, siempre = false }) {
  const mostrar = useMarcaAlexus()
  if (!siempre && !mostrar) return null
  return (
    <a href={ALEXUS.sitio} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs ${claro ? 'text-white/80 hover:text-white' : 'text-gray-500 hover:text-gray-800'} ${className}`}
      title="ALEXUS Soluciones informáticas">
      <img src={ALEXUS.simbolo} alt="" className="h-4 w-4" />
      <span>SPVI by <strong className="font-semibold tracking-wide">ALEXUS</strong></span>
    </a>
  )
}
