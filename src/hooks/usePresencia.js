// Mantiene montado un elemento mientras corre su animación de salida.
// abierto=true → monta; abierto=false → marca "saliendo" y desmonta al terminar.
// Con animaciones reducidas también hay salida, pero es un desvanecido más corto.
import { useEffect, useState } from 'react'
import { movimientoReducido } from '../utils/movimiento'

export function usePresencia(abierto, duracionSalida = 220) {
  const [montado, setMontado] = useState(abierto)
  const [saliendo, setSaliendo] = useState(false)
  useEffect(() => {
    if (abierto) { setMontado(true); setSaliendo(false); return undefined }
    if (!montado) return undefined
    setSaliendo(true)
    const t = setTimeout(() => { setMontado(false); setSaliendo(false) }, movimientoReducido() ? 130 : duracionSalida)
    return () => clearTimeout(t)
  }, [abierto]) // eslint-disable-line react-hooks/exhaustive-deps
  return { montado, saliendo }
}
