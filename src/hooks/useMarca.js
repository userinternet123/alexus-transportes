// Marca del negocio (nombre, logo, fondo del login, imagen de inicio).
// Se obtiene del API sin sesión (/sistema/marca) y se guarda en caché local
// para que el login y el menú la muestren al instante.
// Lo que el negocio no haya configurado se completa con la marca de ALEXUS
// (fabricante de ALEXUS Transportes): la marca del cliente siempre manda.
import { useEffect, useState } from 'react'
import axios from 'axios'
import simboloAlexus from '../assets/logo-cuadrado.svg'
import fondoAlexus from '../assets/fondo-ingreso.svg'
import inicioAlexus from '../assets/imagen-inicio.svg'

/** Marca del fabricante (firma y valores por defecto). */
export const ALEXUS = {
  nombre: 'ALEXUS',
  lema: 'Soluciones informáticas',
  simbolo: simboloAlexus,
  sitio: 'https://alexus.com.gt',
}

const CACHE = 'transportes_marca'
const BASE = import.meta.env.VITE_API_URL
const PREDETERMINADA = { nombre: 'ALEXUS Transportes', eslogan: 'Tu flota, bajo control.', logoUrl: null, fondoLoginUrl: null, imagenInicioUrl: null }

/** Convierte la ruta relativa del API en URL absoluta. */
export const urlArchivo = (ruta) => (ruta ? `${BASE}${ruta}` : null)

/** Completa con los valores por defecto; descarta lo que no sea un objeto. */
const normalizar = (m) => (m && typeof m === 'object' && !Array.isArray(m) ? { ...PREDETERMINADA, ...m } : null)

const leerCache = () => {
  try { return normalizar(JSON.parse(localStorage.getItem(CACHE) || 'null')) } catch { return null }
}

export function invalidarMarca(nueva) {
  if (normalizar(nueva)) localStorage.setItem(CACHE, JSON.stringify(nueva))
  else localStorage.removeItem(CACHE)
  window.dispatchEvent(new Event('spvi-marca'))
}

export function useMarca() {
  const [marca, setMarca] = useState(() => leerCache() ?? PREDETERMINADA)
  useEffect(() => {
    let vivo = true
    const cargar = () =>
      axios.get(`${BASE}/sistema/marca`).then(({ data }) => {
        const nueva = normalizar(data?.data)
        if (!vivo || !nueva) return
        localStorage.setItem(CACHE, JSON.stringify(data.data))
        setMarca(nueva)
      }).catch(() => {})
    const alCambiar = () => setMarca(leerCache() ?? PREDETERMINADA)
    cargar()
    window.addEventListener('spvi-marca', alCambiar)
    return () => { vivo = false; window.removeEventListener('spvi-marca', alCambiar) }
  }, [])
  return {
    ...marca,
    logo: urlArchivo(marca.logoUrl) ?? simboloAlexus,
    fondoLogin: urlArchivo(marca.fondoLoginUrl) ?? fondoAlexus,
    imagenInicio: urlArchivo(marca.imagenInicioUrl) ?? inicioAlexus,
    // true = el negocio aún no subió esa imagen (se muestra la de ALEXUS)
    predeterminada: { logo: !marca.logoUrl, fondoLogin: !marca.fondoLoginUrl, imagenInicio: !marca.imagenInicioUrl },
  }
}
