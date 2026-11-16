// Pestañas inferiores en el celular (estilo iOS) con los destinos más usados.
import { useLocation, useNavigate } from 'react-router-dom'
import { Home, ShoppingCart, Receipt, Boxes, Menu } from 'lucide-react'
import { navigateToSubmenu } from '../../../utils/NavigationData'
import { destinos, esActual } from './navegacionData'

const FAVORITOS = [
  { path: 'pos', etiqueta: 'Vender', Icono: ShoppingCart },
  { path: 'ventas', etiqueta: 'Ventas', Icono: Receipt },
  { path: 'existencias', etiqueta: 'Existencias', Icono: Boxes },
]

export default function BarraInferior({ onMenu }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const disponibles = destinos()
  const tabs = FAVORITOS.map((f) => ({
    ...f,
    d: disponibles.find((x) => x.sub?.path === f.path),
  })).filter((f) => f.d)

  const clase = (activo) =>
    `flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] ${activo ? 'text-green-600' : 'text-gray-500'}`
  return (
    <nav
      className="material separador fixed inset-x-0 bottom-0 z-20 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Accesos rápidos"
    >
      <button
        type="button"
        className={clase(pathname === '/home')}
        onClick={() => navigate('/home')}
      >
        <Home className="h-6 w-6" />
        Inicio
      </button>
      {tabs.map(({ d, etiqueta, Icono }) => (
        <button
          key={etiqueta}
          type="button"
          className={clase(esActual(d.sub, pathname, search))}
          onClick={() => navigateToSubmenu(navigate, d.modulo, d.sub)}
        >
          <Icono className="h-6 w-6" />
          {etiqueta}
        </button>
      ))}
      <button type="button" className={clase(false)} onClick={onMenu}>
        <Menu className="h-6 w-6" />
        Menú
      </button>
    </nav>
  )
}
