// ─────────────────────────────────────────────────────────────────────────────
// DEPARTAMENTO + MUNICIPIO (catálogo oficial de Guatemala: 22 y 340).
// Se usa dentro de un <Grupo> de la Hoja de edición. Las listas se guardan en
// memoria durante la sesión: abrir otro cliente no vuelve a consultarlas.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import api from '../../services/api'
import { Fila } from './Hoja'

let departamentosCache = null
const municipiosCache = new Map()

const cargarDepartamentos = async () => {
  if (!departamentosCache) {
    const { data } = await api.get('/catalogos/departamentos', { params: { limit: 0 } })
    departamentosCache = data.data.filter((d) => d.activo !== false)
  }
  return departamentosCache
}
const cargarMunicipios = async (departamentoId) => {
  if (!municipiosCache.has(departamentoId)) {
    const { data } = await api.get('/catalogos/municipios', { params: { departamentoId, limit: 0 } })
    municipiosCache.set(departamentoId, data.data.filter((m) => m.activo !== false))
  }
  return municipiosCache.get(departamentoId)
}

/** Texto corto para listas: "Mixco, Guatemala". */
export const textoMunicipio = (m) => (m ? `${m.nombre}, ${m.departamento?.nombre ?? ''}`.replace(/, $/, '') : '')

/**
 * value: municipioId (o null). departamentoInicial: el departamento del municipio guardado.
 * onChange(municipioId | null).
 */
export default function SelectorMunicipio({ value, departamentoInicial, onChange, disabled }) {
  const [departamentos, setDepartamentos] = useState(departamentosCache ?? [])
  const [departamentoId, setDepartamentoId] = useState(departamentoInicial ? String(departamentoInicial) : '')
  const [municipios, setMunicipios] = useState([])

  useEffect(() => { cargarDepartamentos().then(setDepartamentos).catch(() => {}) }, [])
  useEffect(() => {
    if (!departamentoId) { setMunicipios([]); return }
    cargarMunicipios(Number(departamentoId)).then(setMunicipios).catch(() => setMunicipios([]))
  }, [departamentoId])

  const cambiarDepartamento = (e) => {
    setDepartamentoId(e.target.value)
    onChange(null) // el municipio anterior no pertenece al nuevo departamento
  }

  return (
    <>
      <Fila etiqueta="Departamento">
        <select value={departamentoId} onChange={cambiarDepartamento} disabled={disabled} aria-label="Departamento">
          <option value="">Elegir…</option>
          {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      </Fila>
      <Fila etiqueta="Municipio">
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} disabled={disabled || !departamentoId} aria-label="Municipio">
          <option value="">{departamentoId ? 'Elegir…' : 'Primero elija el departamento'}</option>
          {municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
      </Fila>
    </>
  )
}
