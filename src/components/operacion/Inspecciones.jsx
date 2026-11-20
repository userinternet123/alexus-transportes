// ─────────────────────────────────────────────────────────────────────────────
// INSPECCIÓN PRE VIAJE: lista de revisión del cabezal (y remolque). Cada falla y cada hallazgo adicional abre un caso
// con su prioridad; una falla crítica deja la unidad fuera de servicio hasta que otra inspección la apruebe.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { ClipboardCheck, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { usePermisos } from '../../hooks/usePermisos'
import Campo from '../comun/Campo'
import Modal from '../comun/Modal'
import { Boton, BotonPrimario, Etiqueta } from './comun'
import { ent, enviar, fechaHora, haceDias, hoy, nombrePiloto, num, PRIORIDAD, TIPO_CASO, useCatalogos, useConsulta } from './util'

const RESULTADO = { APROBADA: { texto: 'Aprobada', color: 'verde' }, CON_OBSERVACIONES: { texto: 'Con observaciones', color: 'ambar' }, RECHAZADA: { texto: 'Fuera de servicio', color: 'rojo' } }
const ESTADOS = [['OK', 'Bien', 'bg-green-600 text-white'], ['FALLA', 'Falla', 'bg-red-600 text-white'], ['NO_APLICA', 'N/A', 'bg-gray-500 text-white']]

function NuevaInspeccion({ onListo, onCerrar }) {
  const { cabezales, remolques, pilotos } = useCatalogos()
  const [f, setF] = useState({ cabezalId: '', remolqueId: '', pilotoId: '', viajeId: '', odometro: '', observaciones: '' })
  const [resp, setResp] = useState({}) // codigo → { estado, nota, prioridad }
  const [hallazgos, setHallazgos] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const { datos: puntos } = useConsulta('/inspecciones/puntos', { remolque: f.remolqueId ? 'true' : 'false' })
  const { datos: viajes } = useConsulta(f.cabezalId ? '/viajes' : null, { cabezalId: f.cabezalId, estado: 'PROGRAMADO' })
  const elegirCabezal = (e) => { const c = cabezales.find((x) => String(x.id) === e.target.value); setF((x) => ({ ...x, cabezalId: e.target.value, viajeId: '', pilotoId: c?.pilotoAsignadoId ? String(c.pilotoAsignadoId) : x.pilotoId })) }
  // Al elegir el viaje se toma su remolque
  const elegirViaje = (e) => {
    const v = viajes?.viajes.find((x) => String(x.id) === e.target.value)
    const r = v?.remolque ? remolques.find((x) => x.codigo === v.remolque) : null
    setF((x) => ({ ...x, viajeId: e.target.value, ...(r ? { remolqueId: String(r.id) } : {}) }))
  }
  const grupos = useMemo(() => { const m = new Map(); for (const p of puntos ?? []) {m.set(p.grupo, [...(m.get(p.grupo) ?? []), p])} return [...m] }, [puntos])
  const marcar = (p, estado) => setResp((r) => ({ ...r, [p.codigo]: { ...r[p.codigo], estado, prioridad: r[p.codigo]?.prioridad ?? p.prioridadSugerida } }))
  const todoBien = () => setResp(Object.fromEntries((puntos ?? []).map((p) => [p.codigo, { estado: 'OK' }])))
  const faltan = (puntos ?? []).filter((p) => !resp[p.codigo]).length
  const fallasSinNota = (puntos ?? []).filter((p) => resp[p.codigo]?.estado === 'FALLA' && !resp[p.codigo]?.nota?.trim()).length
  const hallazgosIncompletos = hallazgos.some((h) => h.titulo.trim().length < 5)
  const guardar = async () => {
    setEnviando(true)
    const r = await enviar('post', '/inspecciones', {
      cabezalId: f.cabezalId, remolqueId: f.remolqueId || null, pilotoId: f.pilotoId || null, viajeId: f.viajeId || null, odometro: f.odometro || null, observaciones: f.observaciones,
      puntos: (puntos ?? []).map((p) => ({ codigo: p.codigo, estado: resp[p.codigo].estado, nota: resp[p.codigo].nota || null, prioridad: resp[p.codigo].estado === 'FALLA' ? resp[p.codigo].prioridad : null })),
      hallazgos,
    })
    setEnviando(false)
    if (r) {setResultado(r.data)}
  }
  if (resultado) {
    return (
      <Modal abierto titulo="Resultado de la inspección" onCerrar={onListo} ancho="max-w-md" pie={<BotonPrimario onClick={onListo}>Listo</BotonPrimario>}>
        <div className="space-y-3 text-sm">
          <Etiqueta color={RESULTADO[resultado.resultado].color}>{RESULTADO[resultado.resultado].texto}</Etiqueta>
          <p>{resultado.resultado === 'RECHAZADA' ? 'La unidad NO puede salir hasta que el taller repare las fallas críticas y una nueva inspección la apruebe.' : resultado.resultado === 'CON_OBSERVACIONES' ? 'Puede salir. Las fallas quedaron reportadas.' : 'Todo en orden: puede salir.'}</p>
          {resultado.casos.length > 0 && <ul className="divide-y rounded-control border">{resultado.casos.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2"><span><b>{c.numero}</b> · {c.titulo}</span><Etiqueta color={PRIORIDAD[c.prioridad].color}>{PRIORIDAD[c.prioridad].texto}</Etiqueta></li>)}</ul>}
          {resultado.ordenTrabajo && <p>Orden de taller: <b>{resultado.ordenTrabajo}</b></p>}
          {resultado.resueltos?.length > 0 && <p className="text-green-700">Quedaron resueltos: {resultado.resueltos.join(', ')}</p>}
        </div>
      </Modal>
    )
  }
  return (
    <Modal abierto titulo="Inspección pre viaje" onCerrar={onCerrar} ancho="max-w-3xl"
      pie={<><span className="mr-auto self-center text-xs text-gray-500">{faltan ? `Faltan ${faltan} puntos` : fallasSinNota ? 'Describa cada falla' : 'Lista completa'}</span><Boton onClick={onCerrar}>Cancelar</Boton><button type="button" disabled={enviando || !f.cabezalId || faltan > 0 || fallasSinNota > 0 || hallazgosIncompletos} onClick={guardar} className="rounded-control bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50">{enviando ? 'Guardando…' : 'Registrar inspección'}</button></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <Campo etiqueta="Cabezal" id="cabezalId" requerido><select value={f.cabezalId} onChange={elegirCabezal} className={ent}><option value="">Elija…</option>{cabezales.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.placa}</option>)}</select></Campo>
        <Campo etiqueta="Remolque" id="remolqueId"><select value={f.remolqueId} onChange={set('remolqueId')} className={ent}><option value="">Sin remolque</option>{remolques.map((r) => <option key={r.id} value={r.id}>{r.codigo}</option>)}</select></Campo>
        <Campo etiqueta="Piloto" id="pilotoId"><select value={f.pilotoId} onChange={set('pilotoId')} className={ent}><option value="">—</option>{pilotos.map((p) => <option key={p.id} value={p.id}>{nombrePiloto(p)}</option>)}</select></Campo>
        <Campo etiqueta="Odómetro (km)" id="odometro"><input type="number" min="0" step="0.1" value={f.odometro} onChange={set('odometro')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Viaje que va a salir" id="viajeId" className="sm:col-span-4"><select value={f.viajeId} onChange={elegirViaje} disabled={!f.cabezalId} className={ent}><option value="">Sin viaje (revisión diaria)</option>{viajes?.viajes.map((v) => <option key={v.id} value={v.id}>{v.numero} · {v.cliente} · {v.destino}</option>)}</select></Campo>
      </div>

      <div className="mt-4 flex items-center justify-between"><h3 className="font-semibold">Lista de revisión</h3><Boton onClick={todoBien}>Marcar todo bien</Boton></div>
      <p className="text-xs text-gray-500">Los puntos con <ShieldAlert className="inline h-3.5 w-3.5 text-red-600" aria-label="crítico" /> son críticos: si fallan, la unidad no puede salir.</p>
      <div className="mt-2 space-y-4">
        {grupos.map(([grupo, lista]) => (
          <fieldset key={grupo}>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{grupo}</legend>
            <ul className="divide-y rounded-control border">
              {lista.map((p) => {
                const r = resp[p.codigo]
                return (
                  <li key={p.codigo} className={`px-3 py-2 text-sm ${r?.estado === 'FALLA' ? 'bg-red-50' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1">{p.critico && <ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-red-600" aria-label="crítico" />}{p.nombre}</span>
                      <div role="radiogroup" aria-label={p.nombre} className="flex gap-1">
                        {ESTADOS.filter(([e]) => !(e === 'NO_APLICA' && p.critico && p.aplicaA === 'CABEZAL')).map(([e, t, activo]) => (
                          <button key={e} type="button" role="radio" aria-checked={r?.estado === e} onClick={() => marcar(p, e)} className={`rounded-md border px-2.5 py-1 text-xs ${r?.estado === e ? activo : 'bg-white hover:bg-gray-50'}`}>{t}</button>
                        ))}
                      </div>
                    </div>
                    {r?.estado === 'FALLA' && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_10rem]">
                        <input value={r.nota ?? ''} onChange={(e) => setResp((x) => ({ ...x, [p.codigo]: { ...x[p.codigo], nota: e.target.value } }))} maxLength={200} placeholder="Describa la falla (obligatorio)" aria-label={`Descripción de la falla en ${p.nombre}`} className="rounded-control border px-2 py-1.5" />
                        <select value={r.prioridad} onChange={(e) => setResp((x) => ({ ...x, [p.codigo]: { ...x[p.codigo], prioridad: e.target.value } }))} aria-label="Prioridad" className="rounded-control border px-2 py-1.5">{Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </fieldset>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between"><h3 className="font-semibold">Otros hallazgos</h3><Boton onClick={() => setHallazgos((h) => [...h, { titulo: '', descripcion: '', tipo: 'MECANICO', prioridad: 'MODERADA', impideSalir: false }])}><Plus className="h-4 w-4" aria-hidden /> Reportar algo más</Boton></div>
      <p className="text-xs text-gray-500">Cualquier cosa fuera de la lista (un ruido, un golpe, un faltante): cada hallazgo abre un caso con su prioridad.</p>
      <ul className="mt-2 space-y-2">
        {hallazgos.map((h, i) => {
          const cambiar = (k, v) => setHallazgos((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
          return (
            <li key={i} className="grid gap-2 rounded-control border p-3 text-sm sm:grid-cols-[1fr_9rem_9rem_auto]">
              <input value={h.titulo} onChange={(e) => cambiar('titulo', e.target.value)} maxLength={150} placeholder="Qué encontró (al menos 5 letras)" aria-label="Hallazgo" className="rounded-control border px-2 py-1.5" />
              <select value={h.tipo} onChange={(e) => cambiar('tipo', e.target.value)} aria-label="Tipo" className="rounded-control border px-2 py-1.5">{Object.entries(TIPO_CASO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
              <select value={h.prioridad} onChange={(e) => cambiar('prioridad', e.target.value)} aria-label="Prioridad" className="rounded-control border px-2 py-1.5">{Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select>
              <button type="button" onClick={() => setHallazgos((l) => l.filter((_, j) => j !== i))} aria-label="Quitar hallazgo" className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
              <input value={h.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)} maxLength={1000} placeholder="Detalle (opcional)" aria-label="Detalle del hallazgo" className="rounded-control border px-2 py-1.5 sm:col-span-3" />
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={h.impideSalir} onChange={(e) => cambiar('impideSalir', e.target.checked)} className="accent-red-600" /> Impide salir</label>
            </li>
          )
        })}
      </ul>
      <Campo etiqueta="Observaciones generales" id="obs" className="mt-4 text-sm"><textarea rows={2} value={f.observaciones} onChange={set('observaciones')} maxLength={500} className={ent} /></Campo>
    </Modal>
  )
}

export default function Inspecciones() {
  const { puede } = usePermisos()
  const [desde, setDesde] = useState(haceDias(7))
  const [resultado, setResultado] = useState('')
  const [nueva, setNueva] = useState(false)
  const { datos, recargar } = useConsulta('/inspecciones', { desde, resultado: resultado || undefined })
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Desde<input type="date" value={desde} max={hoy()} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        <label>Resultado<select value={resultado} onChange={(e) => setResultado(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5"><option value="">Todos</option>{Object.entries(RESULTADO).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select></label>
        {puede('inspecciones.registrar') && <BotonPrimario className="ml-auto" onClick={() => setNueva(true)}><ClipboardCheck className="h-4 w-4" aria-hidden /> Nueva inspección</BotonPrimario>}
      </div>
      {datos?.fueraDeServicio?.length > 0 && <p className="rounded-control bg-red-50 px-4 py-2.5 text-sm text-red-800"><ShieldAlert className="mr-1 inline h-4 w-4" aria-hidden /> Fuera de servicio: {datos.fueraDeServicio.map((x) => `${x.cabezal} (desde ${fechaHora(x.desde)})`).join(', ')}</p>}
      <div className="overflow-x-auto rounded-superficie border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2">Piloto</th><th className="px-3 py-2">Viaje</th><th className="px-3 py-2 text-right">Odómetro</th><th className="px-3 py-2">Resultado</th><th className="px-3 py-2">Orden</th></tr></thead>
          <tbody className="divide-y">
            {datos?.inspecciones.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2">{fechaHora(i.fecha)}</td><td className="px-3 py-2 font-medium">{i.cabezal}{i.remolque ? ` + ${i.remolque}` : ''}</td><td className="px-3 py-2">{i.piloto ?? '—'}</td><td className="px-3 py-2">{i.viaje ?? '—'}</td>
                <td className="cifra px-3 py-2 text-right">{num(i.odometro)}</td>
                <td className="px-3 py-2"><Etiqueta color={RESULTADO[i.resultado].color}>{RESULTADO[i.resultado].texto}</Etiqueta>{i.fallas > 0 && <span className="ml-2 text-xs text-gray-500">{i.fallas} hallazgo(s)</span>}</td>
                <td className="px-3 py-2">{i.ordenTrabajo ? `${i.ordenTrabajo} · ${i.estadoOrden?.toLowerCase().replace('_', ' ')}` : '—'}</td>
              </tr>
            ))}
            {datos && !datos.inspecciones.length && <tr><td colSpan={7} className="px-3 py-10 text-center text-gray-500">Sin inspecciones en el período.</td></tr>}
          </tbody>
        </table>
      </div>
      {nueva && <NuevaInspeccion onCerrar={() => setNueva(false)} onListo={() => { setNueva(false); recargar() }} />}
    </div>
  )
}
