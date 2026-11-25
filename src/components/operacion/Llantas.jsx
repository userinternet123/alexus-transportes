// ─────────────────────────────────────────────────────────────────────────────
// CONTROL DE LLANTAS: qué llanta va en cada posición, montar, rotar, retirar, medir el labrado, reencauchar y desechar;
// km y costo por km de cada llanta y de cada marca; alertas de labrado bajo o sin medir.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CircleDot } from 'lucide-react'
import { usePermisos } from '../../hooks/usePermisos'
import { useEstadoOpciones } from '../../hooks/useOpcionesRemotas'
import { Q } from '../comun/formato'
import Campo from '../comun/Campo'
import Hoja from '../comun/Hoja'
import { Boton, BotonPrimario, Cifra, Etiqueta, Pestanas } from './comun'
import { ent, enviar, fecha, hay, hoy, nombreTercero, num, useCatalogos, useConsulta } from './util'

const VISTAS = [['UNIDAD', 'Por unidad'], ['ALERTAS', 'Alertas'], ['TODAS', 'Inventario'], ['MARCAS', 'Rendimiento por marca']]
const ALERTA = { CAMBIAR: ['Cambiar ya', 'rojo'], PRONTO: ['Cerca del mínimo', 'ambar'], KM_EXCEDIDO: ['Pasó los km esperados', 'ambar'], SIN_MEDIR: ['Sin medir', 'gris'], BIEN: ['Bien', 'verde'] }
const SITUACION = { MONTADA: ['Montada', 'azul'], EN_BODEGA: ['En bodega', 'verde'], EN_REENCAUCHE: ['En reencauche', 'morado'], DESECHADA: ['Desechada', 'gris'] }
const cpk = (v) => (hay(v) ? `Q${Number(v).toFixed(3)}/km` : '—')

export default function Llantas() {
  const [params, setParams] = useSearchParams()
  const vista = VISTAS.some(([k]) => k === params.get('vista')) ? params.get('vista') : 'UNIDAD'
  const setVista = (v) => setParams((p) => { p.set('vista', v); return p }, { replace: true })
  const [abierta, setAbierta] = useState(null)
  const [version, setVersion] = useState(0)
  const cambio = () => setVersion((v) => v + 1)
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3"><Pestanas opciones={VISTAS} valor={vista} onCambio={setVista} /><span className="ml-auto text-xs text-gray-500">Registre llantas nuevas en Llantas › Llantas (registro)</span></div>
      {vista === 'UNIDAD' && <PorUnidad key={version} onAbrir={setAbierta} onCambio={cambio} />}
      {(vista === 'ALERTAS' || vista === 'TODAS') && <Inventario key={`${vista}-${version}`} alertas={vista === 'ALERTAS'} onAbrir={setAbierta} />}
      {vista === 'MARCAS' && <Marcas />}
      <Detalle id={abierta} onCerrar={() => setAbierta(null)} onCambio={cambio} />
    </div>
  )
}

function Resumen({ r }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Cifra titulo="Montadas" valor={r.MONTADA} detalle={`${r.EN_BODEGA} en bodega · ${r.EN_REENCAUCHE} en reencauche`} />
      <Cifra titulo="Cambiar ya" valor={r.CAMBIAR} tono={r.CAMBIAR ? 'malo' : null} detalle="en el labrado mínimo" />
      <Cifra titulo="Cerca del mínimo" valor={r.PRONTO + r.KM_EXCEDIDO} detalle={r.KM_EXCEDIDO ? `${r.KM_EXCEDIDO} pasaron los km esperados` : 'compre o reencauche a tiempo'} />
      <Cifra titulo="Sin medir" valor={r.SIN_MEDIR} detalle="mídalas en la próxima inspección" />
    </section>
  )
}

/** Diagrama de la unidad: cada eje con sus posiciones; tocar una abre la llanta o permite montar una. */
function PorUnidad({ onAbrir, onCambio }) {
  const { puede } = usePermisos()
  const { cabezales, remolques } = useCatalogos()
  const [unidad, setUnidad] = useState('')
  const sel = unidad || (cabezales[0] ? `C:${cabezales[0].id}` : '')
  const [t, i] = sel.split(':')
  const { datos: d, recargar } = useConsulta(sel ? '/llantas-control/unidad' : null, t === 'C' ? { cabezalId: i } : { remolqueId: i })
  const { datos: bodega } = useConsulta('/llantas-control/tablero', { estado: 'EN_BODEGA' })
  const { datos: tab } = useConsulta('/llantas-control/tablero', { estado: 'ACTIVAS' })
  const [montar, setMontar] = useState(null) // posición
  const [f, setF] = useState({ llantaId: '', fecha: hoy(), km: '' })
  const [enviando, setEnviando] = useState(false)
  const ejes = {}
  for (const p of d?.posiciones ?? []) { const e = p.posicion.startsWith('REP') ? 'REP' : p.posicion.split('-')[0]; (ejes[e] ??= []).push(p) }
  const ir = async () => {
    setEnviando(true)
    const r = await enviar('post', `/llantas-control/${f.llantaId}/montar`, { cabezalId: t === 'C' ? Number(i) : null, remolqueId: t === 'R' ? Number(i) : null, posicion: montar, fecha: f.fecha, km: f.km || null })
    setEnviando(false)
    if (r) { setMontar(null); setF({ llantaId: '', fecha: hoy(), km: '' }); recargar(); onCambio() }
  }
  return (
    <>
      {tab && <Resumen r={tab.resumen} />}
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Unidad<select value={sel} onChange={(e) => { setUnidad(e.target.value); setMontar(null) }} className="mt-1 block rounded-control border px-2 py-1.5"><optgroup label="Cabezales">{cabezales.map((c) => <option key={c.id} value={`C:${c.id}`}>{c.codigo} · {c.placa}</option>)}</optgroup><optgroup label="Remolques">{remolques.map((r) => <option key={r.id} value={`R:${r.id}`}>{r.codigo} · {r.placa}</option>)}</optgroup></select></label>
        {d?.unidad && <span className="text-xs text-gray-500">{d.unidad.ejes} ejes{hay(d.unidad.odometro) ? ` · ${num(d.unidad.odometro)} km` : ''} · {d.posiciones.filter((p) => p.llanta).length} de {d.posiciones.length} posiciones con llanta</span>}
      </div>
      {!d ? <p className="text-sm text-gray-500">Cargando…</p> : (
        <section className="rounded-superficie border bg-white p-4">
          <div className="mx-auto max-w-2xl space-y-3">
            {Object.entries(ejes).map(([e, ps]) => (
              <div key={e} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-gray-500">{e === 'REP' ? 'Repuesto' : `Eje ${e.slice(1)}${e === 'E1' && d.unidad.tipo === 'CABEZAL' ? ' (dirección)' : ''}`}</span>
                <div className={`grid flex-1 gap-2 ${ps.length === 4 ? 'grid-cols-4' : ps.length === 2 ? 'grid-cols-2 px-[12.5%]' : 'grid-cols-1 max-w-[25%]'}`}>
                  {ps.map((p) => {
                    const l = p.llanta
                    const [et, color] = l ? ALERTA[l.alerta] : []
                    return (
                      <button key={p.posicion} type="button" title={p.nombre}
                        onClick={() => (l ? onAbrir(l.id) : puede('llantas.editar') && setMontar(p.posicion))}
                        className={`min-h-[4.5rem] rounded-control border-2 px-2 py-1.5 text-left text-xs ${l ? { rojo: 'border-red-400 bg-red-50', ambar: 'border-amber-400 bg-amber-50', gris: 'border-gray-300 bg-gray-50', verde: 'border-green-500 bg-green-50' }[color] : 'border-dashed border-gray-300 text-gray-400 hover:border-green-500 hover:text-green-700'} ${montar === p.posicion ? 'ring-2 ring-green-600' : ''}`}>
                        <span className="block font-medium text-gray-600">{p.posicion}</span>
                        {l ? <><span className="block truncate font-semibold text-gray-900">{l.codigo}</span><span className="block truncate text-gray-600">{l.marca} · {hay(l.ultimaMm) ? `${num(l.ultimaMm, 1)} mm` : 'sin medir'}</span><span className="sr-only">{et}</span></> : <span className="block">{puede('llantas.editar') ? '+ Montar' : 'Vacía'}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {montar && (
            <div className="mx-auto mt-4 grid max-w-2xl gap-2 rounded-control border-2 border-green-600 p-3 text-sm sm:grid-cols-[2fr_1fr_1fr_auto]">
              <p className="font-medium sm:col-span-4">Montar en {d.unidad.codigo} · {d.posiciones.find((p) => p.posicion === montar)?.nombre.toLowerCase()}</p>
              <select value={f.llantaId} onChange={(e) => setF((x) => ({ ...x, llantaId: e.target.value }))} aria-label="Llanta de bodega" className={ent}><option value="">Llanta en bodega…</option>{(bodega?.filas ?? []).map((l) => <option key={l.id} value={l.id}>{l.codigo} · {l.marca} {l.medida}{l.reencauches ? ` · ${l.reencauches} reenc.` : ''}</option>)}</select>
              <input type="date" value={f.fecha} max={hoy()} onChange={(e) => setF((x) => ({ ...x, fecha: e.target.value }))} aria-label="Fecha" className={ent} />
              {t === 'C' ? <input inputMode="numeric" value={f.km} onChange={(e) => setF((x) => ({ ...x, km: e.target.value }))} placeholder={`km: ${num(d.unidad.odometro)}`} aria-label="Odómetro" className={`${ent} text-right`} /> : <span />}
              <div className="flex gap-2"><Boton onClick={() => setMontar(null)}>Cancelar</Boton><BotonPrimario disabled={enviando || !f.llantaId} onClick={ir}>Montar</BotonPrimario></div>
              {bodega && !bodega.filas.length && <p className="text-xs text-gray-500 sm:col-span-4">No hay llantas en bodega: regístrelas en Llantas › Llantas (registro).</p>}
            </div>
          )}
        </section>
      )}
    </>
  )
}

function Inventario({ alertas, onAbrir }) {
  const [estado, setEstado] = useState(alertas ? 'ALERTAS' : 'ACTIVAS')
  const [q, setQ] = useState('')
  const { datos } = useConsulta('/llantas-control/tablero', { estado: alertas ? 'ALERTAS' : estado, q: q.trim() || undefined })
  return (
    <>
      {datos && <Resumen r={datos.resumen} />}
      <div className="flex flex-wrap items-end gap-3 text-sm">
        {!alertas && <label>Situación<select value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5"><option value="ACTIVAS">En uso (no desechadas)</option><option value="MONTADA">Montadas</option><option value="EN_BODEGA">En bodega</option><option value="EN_REENCAUCHE">En reencauche</option><option value="DESECHADA">Desechadas</option><option value="TODAS">Todas</option></select></label>}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serie, medida o modelo" aria-label="Buscar llanta" className="min-w-0 flex-1 rounded-control border px-3 py-2 sm:max-w-xs" />
        {datos && <span className="text-xs text-gray-500">Mínimo {datos.umbrales.minimoMm} mm · aviso {datos.umbrales.avisoMm} mm · medir cada {datos.umbrales.diasSinMedir} días</span>}
      </div>
      <div className="overflow-x-auto rounded-superficie border bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Llanta</th><th className="py-2">Dónde</th><th className="py-2 text-right">Labrado</th><th className="py-2 text-right">Km</th><th className="py-2 text-right">Le quedan</th><th className="py-2 text-right">Costo por km</th><th className="px-4 py-2">Situación</th></tr></thead>
          <tbody className="divide-y">{datos?.filas.map((l) => {
            const [et, color] = ALERTA[l.alerta]
            const [st, cs] = SITUACION[l.estado]
            return (
              <tr key={l.id} className="cursor-pointer hover:bg-gray-50" onClick={() => onAbrir(l.id)}>
                <td className="px-4 py-2"><span className="font-medium">{l.codigo}</span><span className="block text-xs text-gray-500">{l.marca}{l.modelo ? ` ${l.modelo}` : ''} · {l.medida}{l.reencauches ? ` · ${l.reencauches} reenc.` : ''}</span></td>
                <td className="py-2">{l.montaje ? <>{l.montaje.unidad} · {l.montaje.posicion}<span className="block text-xs text-gray-500">desde {fecha(l.montaje.desde)}</span></> : <Etiqueta color={cs}>{st}</Etiqueta>}</td>
                <td className="cifra py-2 text-right">{hay(l.ultimaMm) ? `${num(l.ultimaMm, 1)} mm` : '—'}<span className="block text-xs text-gray-500">{l.ultimaMedicion ? fecha(l.ultimaMedicion) : 'sin medir'}</span></td>
                <td className="cifra py-2 text-right">{num(l.kmTotales)}<span className="block text-xs text-gray-500">de {num(l.kmEsperados)} esperados</span></td>
                <td className="cifra py-2 text-right">{hay(l.kmRestantes) ? `${num(l.kmRestantes)} km` : '—'}</td>
                <td className="cifra py-2 text-right">{cpk(l.costoKm)}<span className="block text-xs text-gray-500">{Q(l.costo)}</span></td>
                <td className="px-4 py-2">{l.estado === 'DESECHADA' ? <Etiqueta color={cs}>{st}</Etiqueta> : <Etiqueta color={color}>{et}</Etiqueta>}</td>
              </tr>
            )
          })}{datos && !datos.filas.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{alertas ? 'Ninguna llanta con alerta.' : 'Sin llantas en esta vista.'}</td></tr>}
          {!datos && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Cargando…</td></tr>}</tbody>
        </table>
      </div>
    </>
  )
}

function Marcas() {
  const { datos } = useConsulta('/llantas-control/por-marca')
  if (!datos) { return <p className="text-sm text-gray-500">Cargando…</p> }
  const mejor = datos.find((x) => hay(x.costoKm))
  return (
    <section className="rounded-superficie border bg-white">
      <p className="border-b px-4 py-3 text-sm text-gray-600">Qué marca rinde más por quetzal: costo de compra más reencauches entre los km recorridos. La vida promedio sale de las llantas ya desechadas; el desgaste, de las mediciones de labrado.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Marca</th><th className="py-2 text-right">Llantas</th><th className="py-2 text-right">Km recorridos</th><th className="py-2 text-right">Vida promedio</th><th className="py-2 text-right">Desgaste</th><th className="py-2 text-right">Reencauches</th><th className="px-4 py-2 text-right">Costo por km</th></tr></thead>
          <tbody className="divide-y">{datos.map((x) => (
            <tr key={`${x.marca}-${x.modelo ?? ''}`} className={x === mejor ? 'bg-green-50' : ''}>
              <td className="px-4 py-2 font-medium">{x.marca}{x.modelo ? ` ${x.modelo}` : ''}{x === mejor && <span className="ml-2"><Etiqueta color="verde">Mejor costo/km</Etiqueta></span>}</td>
              <td className="cifra py-2 text-right">{x.llantas}<span className="block text-xs text-gray-500">{x.terminadas} desechadas</span></td>
              <td className="cifra py-2 text-right">{num(x.kmRecorridos)}</td>
              <td className="cifra py-2 text-right">{hay(x.kmPromedioVida) ? `${num(x.kmPromedioVida)} km` : '—'}</td>
              <td className="cifra py-2 text-right">{hay(x.desgaste1000) ? `${num(x.desgaste1000, 2)} mm/1,000 km` : '—'}</td>
              <td className="cifra py-2 text-right">{x.reencauches}</td>
              <td className="cifra px-4 py-2 text-right font-semibold">{cpk(x.costoKm)}</td>
            </tr>
          ))}{!datos.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Aún no hay llantas con km.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  )
}

function Detalle({ id, onCerrar, onCambio }) {
  const { puede } = usePermisos()
  const { cabezales, remolques } = useCatalogos()
  const proveedores = useEstadoOpciones(id ? '/terceros/proveedores' : null).opciones
  const { datos: l, recargar } = useConsulta(id ? `/llantas-control/${id}/historial` : null)
  const [modo, setModo] = useState(null) // MEDIR | ROTAR | RETIRAR | REENCAUCHE | DESECHAR
  const [f, setF] = useState({})
  const [enviando, setEnviando] = useState(false)
  if (!id) { return null }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const abrir = (m) => { setModo(m); setF({ fecha: hoy(), destino: 'EN_BODEGA', unidad: l.montaje ? `${l.montaje.tipo === 'CABEZAL' ? 'C' : 'R'}:${l.montaje.unidadId}` : '' }) }
  const n = (v) => (v === '' || v === undefined ? null : Number(v))
  const ir = async () => {
    setEnviando(true)
    const [tu, iu] = (f.unidad ?? '').split(':')
    const llamadas = {
      MEDIR: ['medicion', { fecha: f.fecha, profundidadMm: n(f.mm), presionPsi: n(f.psi), observacion: f.obs || null }],
      ROTAR: ['rotar', { cabezalId: tu === 'C' ? Number(iu) : null, remolqueId: tu === 'R' ? Number(iu) : null, posicion: f.posicion, fecha: f.fecha, profundidadMm: n(f.mm) }],
      RETIRAR: ['retirar', { fecha: f.fecha, km: n(f.km), profundidadMm: n(f.mm), motivo: f.motivo, destino: f.destino }],
      REENCAUCHE: ['reencauche', { fecha: f.fecha, costo: n(f.costo), proveedorId: n(f.proveedorId), documento: f.documento || null, profundidadMm: n(f.mm) }],
      DESECHAR: ['desechar', { motivo: f.motivo }],
    }
    const [ruta, cuerpo] = llamadas[modo]
    const r = await enviar('post', `/llantas-control/${id}/${ruta}`, cuerpo)
    setEnviando(false)
    if (r) { setModo(null); recargar(); onCambio() }
  }
  const listo = { MEDIR: n(f.mm) !== null, ROTAR: f.unidad && f.posicion, RETIRAR: (f.motivo ?? '').trim().length >= 3, REENCAUCHE: n(f.costo) > 0, DESECHAR: (f.motivo ?? '').trim().length >= 3 }[modo]
  const edita = puede('llantas.editar') && l && l.estado !== 'DESECHADA'
  return (
    <Hoja abierta titulo={l ? `Llanta ${l.codigo}` : 'Llanta'} onCerrar={() => { setModo(null); onCerrar() }}
      pie={edita && !modo && (
        <div className="flex w-full flex-wrap justify-end gap-2">
          {l.estado !== 'MONTADA' && puede('llantas.eliminar') && <Boton peligro onClick={() => abrir('DESECHAR')}>Desechar</Boton>}
          {l.estado !== 'MONTADA' && <Boton onClick={() => abrir('REENCAUCHE')}>{l.estado === 'EN_REENCAUCHE' ? 'Volvió del reencauche' : 'Registrar reencauche'}</Boton>}
          {l.estado === 'MONTADA' && <><Boton onClick={() => abrir('RETIRAR')}>Retirar</Boton><Boton onClick={() => abrir('ROTAR')}>Rotar</Boton></>}
          <BotonPrimario onClick={() => abrir('MEDIR')}>Medir labrado</BotonPrimario>
        </div>
      )}>
      {!l ? <p className="text-sm text-gray-500">Cargando…</p> : (
        <div className="space-y-4 text-sm">
          <section className="rounded-tarjeta bg-white p-4">
            <div className="flex flex-wrap gap-2"><Etiqueta color={SITUACION[l.estado][1]}>{SITUACION[l.estado][0]}</Etiqueta>{l.estado !== 'DESECHADA' && <Etiqueta color={ALERTA[l.alerta][1]}>{ALERTA[l.alerta][0]}</Etiqueta>}{l.reencauches > 0 && <Etiqueta color="morado">{l.reencauches} reencauche(s)</Etiqueta>}</div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-gray-500">Marca y medida</dt><dd>{l.marca}{l.modelo ? ` ${l.modelo}` : ''} · {l.medida}</dd>
              {l.montaje && <><dt className="text-gray-500">Montada en</dt><dd>{l.montaje.unidad} · {l.montaje.nombrePosicion.toLowerCase()} (desde {fecha(l.montaje.desde)})</dd></>}
              <dt className="text-gray-500">Labrado</dt><dd>{hay(l.ultimaMm) ? `${num(l.ultimaMm, 1)} mm` : 'sin medir'}{hay(l.profundidadInicialMm) ? ` de ${num(l.profundidadInicialMm, 1)} mm` : ''}{hay(l.presionPsi) ? ` · ${num(l.presionPsi)} psi` : ''}</dd>
              <dt className="text-gray-500">Km recorridos</dt><dd>{num(l.kmTotales)} km{l.reencauches ? ` (${num(l.kmVidaActual)} desde el último reencauche)` : ''}</dd>
              {hay(l.desgaste1000) && <><dt className="text-gray-500">Desgaste</dt><dd>{num(l.desgaste1000, 2)} mm por cada 1,000 km · le quedan unos {num(l.kmRestantes)} km</dd></>}
              <dt className="text-gray-500">Costo</dt><dd>{Q(l.costo)} · {cpk(l.costoKm)}</dd>
              {l.motivoBaja && <><dt className="text-gray-500">Desechada</dt><dd>{l.motivoBaja}</dd></>}
            </dl>
          </section>

          {modo && (
            <section className={`space-y-2 rounded-tarjeta border-2 bg-white p-4 ${modo === 'DESECHAR' ? 'border-red-300' : 'border-green-600'}`}>
              <h3 className="font-semibold">{{ MEDIR: 'Medir labrado y presión', ROTAR: 'Rotar a otra posición', RETIRAR: 'Retirar de la unidad', REENCAUCHE: 'Reencauche', DESECHAR: 'Desechar la llanta' }[modo]}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {modo !== 'DESECHAR' && <Campo etiqueta="Fecha" id="ll-fecha"><input type="date" value={f.fecha} max={hoy()} onChange={set('fecha')} className={ent} /></Campo>}
                {['MEDIR', 'ROTAR', 'RETIRAR', 'REENCAUCHE'].includes(modo) && <Campo etiqueta={modo === 'REENCAUCHE' ? 'Labrado nuevo (mm)' : 'Labrado (mm)'} id="ll-mm" requerido={modo === 'MEDIR'}><input inputMode="decimal" value={f.mm ?? ''} onChange={set('mm')} className={`${ent} text-right`} /></Campo>}
                {modo === 'MEDIR' && <>
                  <Campo etiqueta="Presión (psi)" id="ll-psi"><input inputMode="decimal" value={f.psi ?? ''} onChange={set('psi')} className={`${ent} text-right`} /></Campo>
                  <Campo etiqueta="Observación" id="ll-obs"><input value={f.obs ?? ''} onChange={set('obs')} maxLength={300} placeholder="desgaste disparejo, corte…" className={ent} /></Campo>
                </>}
                {modo === 'ROTAR' && <>
                  <Campo etiqueta="A la unidad" id="ll-unidad"><select value={f.unidad} onChange={set('unidad')} className={ent}><optgroup label="Cabezales">{cabezales.map((c) => <option key={c.id} value={`C:${c.id}`}>{c.codigo}</option>)}</optgroup><optgroup label="Remolques">{remolques.map((r) => <option key={r.id} value={`R:${r.id}`}>{r.codigo}</option>)}</optgroup></select></Campo>
                  <Campo etiqueta="Posición" id="ll-pos" requerido><input value={f.posicion ?? ''} onChange={(e) => setF((x) => ({ ...x, posicion: e.target.value.toUpperCase() }))} placeholder="E2-DE" list="ll-posiciones" className={ent} /><datalist id="ll-posiciones">{['E1-I', 'E1-D', 'E2-IE', 'E2-II', 'E2-DI', 'E2-DE', 'E3-IE', 'E3-II', 'E3-DI', 'E3-DE', 'REP'].map((p) => <option key={p} value={p} />)}</datalist></Campo>
                </>}
                {modo === 'RETIRAR' && <>
                  {l.montaje?.tipo === 'CABEZAL' && <Campo etiqueta="Odómetro (km)" id="ll-km"><input inputMode="numeric" value={f.km ?? ''} onChange={set('km')} placeholder="el actual del cabezal" className={`${ent} text-right`} /></Campo>}
                  <Campo etiqueta="Va a" id="ll-destino"><select value={f.destino} onChange={set('destino')} className={ent}><option value="EN_BODEGA">Bodega</option><option value="EN_REENCAUCHE">Reencauche</option><option value="DESECHADA">Desecho</option></select></Campo>
                </>}
                {(modo === 'RETIRAR' || modo === 'DESECHAR') && <Campo etiqueta="Motivo" id="ll-motivo" requerido className="sm:col-span-2"><input value={f.motivo ?? ''} onChange={set('motivo')} maxLength={200} placeholder="desgaste, ponchadura, corte lateral…" className={ent} /></Campo>}
                {modo === 'REENCAUCHE' && <>
                  <Campo etiqueta="Costo (Q)" id="ll-costo" requerido><input inputMode="decimal" value={f.costo ?? ''} onChange={set('costo')} className={`${ent} text-right`} /></Campo>
                  <Campo etiqueta="Proveedor" id="ll-prov"><select value={f.proveedorId ?? ''} onChange={set('proveedorId')} className={ent}><option value="">—</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{nombreTercero(p)}</option>)}</select></Campo>
                  <Campo etiqueta="Factura" id="ll-doc"><input value={f.documento ?? ''} onChange={set('documento')} maxLength={60} className={ent} /></Campo>
                </>}
              </div>
              <div className="flex justify-end gap-2"><Boton onClick={() => setModo(null)}>Cancelar</Boton>{modo === 'DESECHAR' ? <Boton peligro disabled={enviando || !listo} onClick={ir}>Desechar</Boton> : <BotonPrimario disabled={enviando || !listo} onClick={ir}>Guardar</BotonPrimario>}</div>
            </section>
          )}

          <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Montajes</h3>
            <ul className="divide-y">{l.montajes.map((m) => <li key={m.id} className="flex flex-wrap items-center gap-x-3 py-1.5"><CircleDot className="h-4 w-4 text-gray-400" aria-hidden /><span className="flex-1">{m.unidad} · {m.nombrePosicion.toLowerCase()}<span className="block text-xs text-gray-500">{fecha(m.desde)} → {m.hasta ? fecha(m.hasta) : 'hoy'}{m.motivo ? ` · ${m.motivo}` : ''}</span></span><span className="cifra text-right">{hay(m.km) ? `${num(m.km)} km` : 'montada'}</span></li>)}{!l.montajes.length && <li className="py-1.5 text-gray-500">Nunca se ha montado.</li>}</ul>
          </section>
          {l.mediciones.length > 0 && <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Mediciones</h3>
            <ul className="divide-y">{l.mediciones.map((m, k) => <li key={k} className="flex items-center gap-3 py-1.5"><span className="w-28">{fecha(m.fecha)}</span><span className="cifra w-20">{num(m.profundidadMm, 1)} mm</span><span className="cifra w-16">{hay(m.presionPsi) ? `${num(m.presionPsi)} psi` : ''}</span><span className="min-w-0 flex-1 truncate text-xs text-gray-500">{m.observacion ?? ''} · {m.por}</span></li>)}</ul>
          </section>}
          {l.reencauchesHechos.length > 0 && <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Reencauches</h3>
            <ul className="divide-y">{l.reencauchesHechos.map((r, k) => <li key={k} className="flex items-center gap-3 py-1.5"><span className="w-28">{fecha(r.fecha)}</span><span className="flex-1">{r.proveedor ?? '—'}{r.documento ? ` · ${r.documento}` : ''} · a los {num(r.kmAlEnviar)} km</span><span className="cifra">{Q(r.costo)}</span></li>)}</ul>
          </section>}
        </div>
      )}
    </Hoja>
  )
}
