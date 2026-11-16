// Aplica el tema: el negocio define el predeterminado (Configuración del negocio)
// y cada usuario puede elegir otro en su menú (se guarda en este navegador).
import { useEffect, useState } from 'react'
import { useMarca } from './useMarca'

export const TEMAS = [
  { id: 'tienda', nombre: 'Tienda', muestra: '#1E7B4F' },
  { id: 'oceano', nombre: 'Océano', muestra: '#0071E3' },
  { id: 'mandarina', nombre: 'Mandarina', muestra: '#C9540C' },
  { id: 'uva', nombre: 'Uva', muestra: '#753EBD' },
  { id: 'grafito', nombre: 'Grafito', muestra: '#3A3A3C' },
]
export const MODOS = [
  { id: 'claro', nombre: 'Claro' },
  { id: 'oscuro', nombre: 'Oscuro' },
  { id: 'automatico', nombre: 'Automático' },
]

const CLAVE = 'spvi_tema_usuario'
const leerUsuario = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') } catch { return {} } }

export function guardarTemaUsuario(prefs) {
  localStorage.setItem(CLAVE, JSON.stringify(prefs))
  window.dispatchEvent(new Event('spvi-tema'))
}

/** Montar una sola vez (main.jsx). */
export function AplicarTema() {
  const marca = useMarca()
  const [usuario, setUsuario] = useState(leerUsuario)
  const [oscuroSistema, setOscuroSistema] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)

  useEffect(() => {
    const alCambiar = () => setUsuario(leerUsuario())
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const alSistema = (e) => setOscuroSistema(e.matches)
    window.addEventListener('spvi-tema', alCambiar)
    mq?.addEventListener?.('change', alSistema)
    return () => { window.removeEventListener('spvi-tema', alCambiar); mq?.removeEventListener?.('change', alSistema) }
  }, [])

  const tema = usuario.tema || marca.tema || 'tienda'
  const modo = usuario.modo || marca.modo || 'claro'
  useEffect(() => {
    const raiz = document.documentElement
    raiz.dataset.tema = tema
    raiz.dataset.modo = modo === 'automatico' ? (oscuroSistema ? 'oscuro' : 'claro') : modo
  }, [tema, modo, oscuroSistema])
  return null
}

export function useTemaUsuario() {
  const [prefs, setPrefs] = useState(leerUsuario)
  const cambiar = (cambio) => { const n = { ...prefs, ...cambio }; setPrefs(n); guardarTemaUsuario(n) }
  return { prefs, cambiar }
}
