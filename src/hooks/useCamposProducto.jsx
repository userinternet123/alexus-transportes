// Campos propios del giro (llantas: medida y rin; librería: autor e ISBN…).
// Se cargan una vez por sesión y se reutilizan en el editor, el catálogo y el POS.
import { useEffect, useState } from 'react'
import api from '../services/api'

let cache = null
export const invalidarCampos = () => { cache = null }
export function cargarCampos() {
  if (!cache) cache = api.get('/campos-producto').then(({ data }) => data.data).catch((e) => { cache = null; throw e })
  return cache
}

export function useCamposProducto() {
  const [campos, setCampos] = useState([])
  useEffect(() => { cargarCampos().then(setCampos).catch(() => setCampos([])) }, [])
  return campos
}

/** Campos que aplican a una categoría (sin categorías = a todas). */
export const camposPara = (campos, categoriaId) =>
  campos.filter((c) => c.activo !== false && (!c.categoriaIds?.length || (categoriaId != null && c.categoriaIds.includes(Number(categoriaId)))))

/**
 * Datos del giro para mostrar junto al nombre: ["205/55R16", "Rin 16 pulg."].
 * soloPos: solo los marcados "mostrar en el punto de venta".
 */
export function etiquetasGiro(atributos, campos, { soloPos = true } = {}) {
  if (!atributos || !campos?.length) return []
  return campos
    .filter((c) => (!soloPos || c.mostrarEnPos) && atributos[c.clave] !== undefined && atributos[c.clave] !== '')
    .map((c) => {
      const v = atributos[c.clave]
      if (c.tipo === 'SI_NO') return v ? c.etiqueta : null
      const unidad = c.unidad ? ` ${c.unidad}` : ''
      if (c.tipo === 'NUMERO') return `${c.etiqueta} ${Number(v).toLocaleString('es-GT')}${unidad}`
      // Valores cortos ("M", "16") se leen mejor con su etiqueta: "Talla M"
      return String(v).length <= 3 ? `${c.etiqueta} ${v}${unidad}` : `${v}${unidad}`
    })
    .filter(Boolean)
}

/** Chips compactos para listas y resultados de búsqueda. */
export function ChipsGiro({ atributos, campos, className = '' }) {
  const etiquetas = etiquetasGiro(atributos, campos)
  if (!etiquetas.length) return null
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {etiquetas.map((e) => <span key={e} className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">{e}</span>)}
    </span>
  )
}
