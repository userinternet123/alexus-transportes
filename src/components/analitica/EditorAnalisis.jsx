// Editor de un análisis guardado: nombre, período (relativo), contra qué comparar, límites y tipo de gráfica.
// Se usa al guardar lo que respondió el asistente y al editar un análisis existente.
import { useEffect, useState } from 'react'
import api from '../../services/api'
import Modal from '../comun/Modal'

const HERRAMIENTAS = { ventas_por_periodo: 'Ventas a lo largo del tiempo', ranking: 'Ranking', comparar_periodos: 'Comparación de períodos', inventario: 'Inventario', compras: 'Compras', proyectar: 'Proyección' }
const GRAFICAS = { '': 'Automático (el mejor para estos datos)', barras: 'Barras', barras_horizontales: 'Barras horizontales', lineas: 'Líneas', area: 'Área', dona: 'Dona', numero: 'Cifra', tabla: 'Tabla' }
const INVENTARIO = { bajo_minimo: 'Bajo el stock mínimo', agotados_con_ventas: 'Agotados que sí se venden', sin_ventas: 'Sin ventas en los últimos días', mayor_valor: 'Mayor valor en inventario' }
const copia = (x) => JSON.parse(JSON.stringify(x))
const rotulo = 'block text-sm'
const campo = 'mt-1 w-full rounded-control border px-3 py-2'

export default function EditorAnalisis({ titulo, inicial, fijos = [], onCerrar, onGuardar, textoGuardar = 'Guardar' }) {
  const [nombre, setNombre] = useState(inicial.nombre)
  const [descripcion, setDescripcion] = useState(inicial.descripcion ?? '')
  const [def, setDef] = useState(() => copia(inicial.definicion))
  const [periodos, setPeriodos] = useState({ periodos: [], contra: [] })
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { api.get('/analisis/periodos').then(({ data }) => setPeriodos(data.data)).catch(() => {}) }, [])

  const paso = (i, cambio) => setDef((d) => ({ ...d, pasos: d.pasos.map((p, k) => (k === i ? { ...p, entrada: { ...p.entrada, ...cambio } } : p)) }))
  const valido = nombre.trim() && def.titulo.trim()
  const guardar = async () => {
    setGuardando(true)
    const salida = { ...(def.salida ?? {}) }
    if (!salida.tipoGrafica) delete salida.tipoGrafica
    try { await onGuardar({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, definicion: { ...def, titulo: def.titulo.trim(), salida } }) } finally { setGuardando(false) }
  }

  return (
    <Modal abierto titulo={titulo} onCerrar={onCerrar} ancho="max-w-xl"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button>
        <button type="button" disabled={!valido || guardando} onClick={guardar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">{guardando ? 'Guardando…' : textoGuardar}</button></>}>
      {fijos.length > 0 && (
        <div className="mb-4 rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900" role="note">
          {fijos.map((f) => <p key={f}>{f}</p>)}
          <p className="mt-1">Elija abajo un período relativo (como "este mes") para que el análisis siempre use los datos de la fecha en que lo abra.</p>
        </div>
      )}
      <div className="space-y-3">
        <label className={rotulo}>Nombre del análisis<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} className={campo} /></label>
        <label className={rotulo}>Descripción (opcional)<input value={descripcion ?? ''} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} className={campo} /></label>
        <label className={rotulo}>Título de la gráfica<input value={def.titulo} onChange={(e) => setDef((d) => ({ ...d, titulo: e.target.value }))} maxLength={120} className={campo} /></label>

        {def.pasos.map((p, i) => {
          const e = p.entrada
          const fijo = typeof e.periodo === 'object' && e.periodo !== null
          const comparaFijo = p.herramienta === 'comparar_periodos' && !e.periodo
          return (
            <fieldset key={i} className="space-y-2 rounded-tarjeta border p-3">
              <legend className="px-1 text-xs font-semibold text-gray-500">{HERRAMIENTAS[p.herramienta]}</legend>
              {(p.herramienta === 'ventas_por_periodo' || p.herramienta === 'ranking' || p.herramienta === 'compras' || p.herramienta === 'comparar_periodos') && (
                comparaFijo ? (
                  <div className="text-sm">
                    <p className="text-gray-700">Compara fechas fijas: {e.a?.desde} a {e.a?.hasta} contra {e.b?.desde} a {e.b?.hasta}.</p>
                    <button type="button" onClick={() => paso(i, { periodo: 'este_mes', contra: 'mismo_periodo_anio_anterior', a: undefined, b: undefined })} className="mt-1 text-green-700 underline">Usar un período relativo</button>
                  </div>
                ) : (
                  <label className={rotulo}>Período
                    <select value={fijo ? '__fijo' : e.periodo} onChange={(ev) => paso(i, { periodo: ev.target.value })} className={campo}>
                      {fijo && <option value="__fijo" disabled>Fechas fijas ({e.periodo.desde} a {e.periodo.hasta})</option>}
                      {periodos.periodos.map((x) => <option key={x.token} value={x.token}>{x.etiqueta}</option>)}
                    </select>
                  </label>
                )
              )}
              {p.herramienta === 'comparar_periodos' && !comparaFijo && (
                <label className={rotulo}>Comparar
                  <select value={e.contra} onChange={(ev) => paso(i, { contra: ev.target.value })} className={campo}>{periodos.contra.map((x) => <option key={x.token} value={x.token}>{x.etiqueta}</option>)}</select>
                </label>
              )}
              {p.herramienta === 'inventario' && (
                <label className={rotulo}>Qué mostrar
                  <select value={e.consulta} onChange={(ev) => paso(i, { consulta: ev.target.value })} className={campo}>{Object.entries(INVENTARIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                {['ranking', 'comparar_periodos', 'inventario', 'compras'].includes(p.herramienta) && (
                  <label className={rotulo}>Cuántos mostrar<input type="number" min="1" max="50" inputMode="numeric" value={e.limite ?? ''} onChange={(ev) => paso(i, { limite: Number(ev.target.value) || undefined })} className={`${campo} cifra text-right`} /></label>
                )}
                {p.herramienta === 'ranking' && (
                  <label className={rotulo}>Orden
                    <select value={e.orden ?? 'mayor'} onChange={(ev) => paso(i, { orden: ev.target.value })} className={campo}><option value="mayor">Los que más</option><option value="menor">Los que menos</option></select>
                  </label>
                )}
                {p.herramienta === 'inventario' && ['sin_ventas', 'agotados_con_ventas'].includes(e.consulta) && (
                  <label className={rotulo}>Días hacia atrás<input type="number" min="1" max="730" inputMode="numeric" value={e.dias ?? 90} onChange={(ev) => paso(i, { dias: Number(ev.target.value) || 90 })} className={`${campo} cifra text-right`} /></label>
                )}
                {p.herramienta === 'proyectar' && (
                  <label className={rotulo}>Períodos a proyectar<input type="number" min="1" max="24" inputMode="numeric" value={e.periodos_futuros} onChange={(ev) => paso(i, { periodos_futuros: Number(ev.target.value) || 1 })} className={`${campo} cifra text-right`} /></label>
                )}
              </div>
            </fieldset>
          )
        })}

        <label className={rotulo}>Tipo de gráfica
          <select value={def.salida?.tipoGrafica ?? ''} onChange={(ev) => setDef((d) => ({ ...d, salida: { ...(d.salida ?? {}), tipoGrafica: ev.target.value || undefined } }))} className={campo}>
            {Object.entries(GRAFICAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
    </Modal>
  )
}
