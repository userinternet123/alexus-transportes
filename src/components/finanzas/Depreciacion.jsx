// ─────────────────────────────────────────────────────────────────────────────
// DEPRECIACIÓN: cuánto valen hoy los cabezales y remolques, cuánto han perdido y cuánto le cuesta a cada km
// esa pérdida de valor. La regla de cada unidad sale de Finanzas › Reglas de depreciación (por marca, tipo y año)
// o de su propia ficha; lo del período entra al costo por km si el parámetro lo incluye.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Q } from '../comun/formato'
import { Boton, Cifra, Etiqueta } from '../operacion/comun'
import { fecha, haceDias, hay, hoy, num, useConsulta } from '../operacion/util'

const METODO = { LINEA_RECTA: 'Línea recta', SUMA_DIGITOS: 'Suma de dígitos', SALDO_DECRECIENTE: 'Saldo decreciente', TABLA: 'Tabla por año', POR_KM: 'Por km' }
const ESTADO = {
  DEPRECIANDO: ['Depreciándose', 'azul'], DEPRECIADA: ['Depreciada', 'gris'], DE_BAJA: ['Dada de baja', 'gris'],
  EXCLUIDA: ['Fuera de costos', 'ambar'], SIN_DATOS: ['Sin datos de compra', 'rojo'], SIN_INICIAR: ['Aún no se compra', 'gris'],
}
const ORIGEN = { REGLA: 'Regla', UNIDAD: 'Propia de la unidad', FISCAL: 'Tasa fiscal' }

function Barra({ pct }) {
  const v = Math.min(100, Math.max(0, Number(pct) || 0))
  return <span className="mt-1 block h-1.5 w-full rounded-full bg-gray-100" aria-hidden="true"><span className="block h-1.5 rounded-full bg-gray-500" style={{ width: `${v}%` }} /></span>
}

export default function Depreciacion() {
  const navigate = useNavigate()
  const [hasta, setHasta] = useState(hoy())
  const [desde, setDesde] = useState(haceDias(90))
  const [abierta, setAbierta] = useState(null)
  const { datos: d, cargando } = useConsulta('/finanzas/depreciacion', { hasta, desde })
  const t = d?.totales
  const porKm = t && Number(t.kmPeriodo) > 0 ? Number(t.periodo) / Number(t.kmPeriodo) : null
  const conDatos = d?.unidades.filter((u) => u.estado !== 'SIN_DATOS') ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Período desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        <label>Al día<input type="date" value={hasta} max={hoy()} onChange={(e) => setHasta(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        <div className="ml-auto flex gap-2">
          <Boton onClick={() => navigate('/home/reglas-depreciacion')}>Reglas de depreciación</Boton>
          <Boton onClick={() => navigate('/home/parametros')}>Parámetros</Boton>
        </div>
      </div>

      {d && (d.incluidaEnCostos
        ? <p className="rounded-control bg-green-50 px-3 py-2 text-sm text-green-900">La depreciación entra al costo por km, al cotizador y a la ganancia de cada viaje{hay(porKm) ? `: en este período, Q${num(porKm, 2)} por km recorrido` : ''}.</p>
        : <p className="rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900">La depreciación <b>no</b> está entrando a los costos. Para incluirla, active «costos.incluir_depreciacion» en Administración › Parámetros.</p>)}

      {t && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra titulo="Costo de compra" valor={Q(t.costo)} detalle={`${conDatos.length} unidad(es) con datos de compra`} />
        <Cifra titulo="Depreciación acumulada" valor={Q(t.acumulada)} detalle={Number(t.costo) ? `${num((Number(t.acumulada) / Number(t.costo)) * 100, 1)} % del costo` : null} />
        <Cifra titulo="Valor en libros" valor={Q(t.valorLibros)} detalle={`Fiscal (${d.tasaFiscal} % anual): ${Q(t.fiscalValorLibros)}`} />
        <Cifra titulo="Depreciación del período" valor={Q(t.periodo)} detalle={`${hay(porKm) ? `Q${num(porKm, 2)}/km · ` : ''}cuota anual ${Q(t.anual)}`} />
      </section>}

      {d?.avisos.length > 0 && <ul className="space-y-1">{d.avisos.map((a) => <li key={a} className="rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900">{a}</li>)}</ul>}

      <section className="rounded-superficie border bg-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-semibold">Por unidad</h2>
          <p className="text-xs text-gray-500">{d ? `Del ${fecha(d.desde)} al ${fecha(d.fecha)}` : cargando ? 'Calculando…' : ''} · toque una unidad para ver su tabla año por año</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr><th className="px-4 py-2">Unidad</th><th className="py-2">Cómo se deprecia</th><th className="py-2 text-right">Costo</th><th className="py-2 text-right">Acumulada</th><th className="w-40 py-2 pl-4">Valor en libros</th><th className="py-2 text-right">Del período</th><th className="py-2 text-right">Por km</th><th className="px-4 py-2">Estado</th></tr>
            </thead>
            <tbody className="divide-y">
              {d?.unidades.map((u) => {
                const clave = `${u.tipo}-${u.id}`
                const [estado, color] = ESTADO[u.estado] ?? [u.estado, 'gris']
                const abierto = abierta === clave
                return (
                  <Fragment key={clave}>
                    <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setAbierta(abierto ? null : clave)} aria-expanded={abierto}>
                      <td className="px-4 py-2"><span className="font-medium">{u.codigo}</span> <span className="text-gray-500">{u.placa}</span><span className="block text-xs text-gray-500">{u.tipo === 'CABEZAL' ? 'Cabezal' : `Remolque ${u.tipoRemolque?.toLowerCase() ?? ''}`} · {[u.marca, u.anio].filter(Boolean).join(' ') || 'sin marca'}</span></td>
                      <td className="py-2">{u.estado === 'SIN_DATOS' ? <span className="text-gray-400">—</span> : <>
                        {METODO[u.metodo]}{u.metodo === 'POR_KM' ? ` · ${num(u.vidaKm)} km` : ` · ${u.vidaAnios} años`} · residual {num(u.residualPct, 0)}{'\u00a0'}%
                        <span className="block text-xs text-gray-500">{u.regla ? `Regla «${u.regla}»` : 'Sin regla'}{u.origen !== 'REGLA' ? ` · ${ORIGEN[u.origen].toLowerCase()}` : ''}</span>
                      </>}</td>
                      <td className="cifra py-2 text-right">{Number(u.costo) ? Q(u.costo) : '—'}</td>
                      <td className="cifra py-2 text-right">{Number(u.costo) ? Q(u.acumulada) : '—'}</td>
                      <td className="py-2 pl-4"><span className="cifra">{Number(u.costo) ? Q(u.valorLibros) : '—'}</span>{Number(u.costo) > 0 && <><Barra pct={u.pctDepreciado} /><span className="text-xs text-gray-500">{num(u.pctDepreciado, 1)} % depreciado</span></>}</td>
                      <td className="cifra py-2 text-right">{Number(u.periodo) ? Q(u.periodo) : '—'}<span className="block text-xs text-gray-500">{Number(u.kmPeriodo) ? `${num(u.kmPeriodo)} km` : ''}</span></td>
                      <td className="cifra py-2 text-right">{hay(u.porKm) && Number(u.periodo) ? `Q${num(u.porKm, 2)}` : '—'}</td>
                      <td className="px-4 py-2"><Etiqueta color={color}>{estado}</Etiqueta></td>
                    </tr>
                    {abierto && <tr className="bg-gray-50"><td colSpan={8} className="px-4 py-3"><Detalle u={u} tasa={d.tasaFiscal} onEditar={() => navigate(u.tipo === 'CABEZAL' ? '/home/cabezales' : '/home/remolques')} /></td></tr>}
                  </Fragment>
                )
              })}
              {d && !d.unidades.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">No hay cabezales ni remolques registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-superficie border bg-white p-4 text-sm text-gray-600">
        <h2 className="mb-2 font-semibold text-gray-900">Cómo se decide la depreciación de cada unidad</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Lo que tenga su ficha (sección «Depreciación» del cabezal o remolque): método, vida útil, valor residual.</li>
          <li>Lo que falte sale de la regla más específica que le aplica: primero la que coincide en marca, luego en tipo de remolque, luego en año del modelo; la general de su tipo al final.</li>
          <li>Sin regla, se usa la tasa fiscal ({d?.tasaFiscal ?? 20} % anual en línea recta, sin residual), el máximo de la Ley del ISR para vehículos y remolques.</li>
        </ol>
        <p className="mt-2">Línea recta: igual cada año. Suma de dígitos y saldo decreciente: más en los primeros años, cuando la unidad pierde más valor. Tabla por año: el porcentaje que usted defina para cada año. Por km: según lo que recorre (cabezales con el odómetro; remolques con los km de sus viajes). La columna fiscal es referencia para su contador; los costos usan la de gerencia.</p>
      </section>
    </div>
  )
}

function Detalle({ u, tasa, onEditar }) {
  if (u.estado === 'SIN_DATOS') { return <div className="flex flex-wrap items-center gap-3"><p>{u.avisos.join(' ')}</p><Boton onClick={onEditar}>Completar la ficha</Boton></div> }
  const enCurso = Math.floor(u.aniosUso)
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="overflow-x-auto">
        {u.calendario.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">Año de vida</th><th className="py-1">Desde</th><th className="py-1 text-right">Cuota</th><th className="py-1 text-right">Acumulada</th><th className="py-1 text-right">Valor en libros</th></tr></thead>
            <tbody className="divide-y">{u.calendario.map((c) => (
              <tr key={c.anio} className={c.anio === enCurso + 1 && u.estado === 'DEPRECIANDO' ? 'bg-white font-medium' : ''}>
                <td className="py-1">{c.anio}{c.anio === enCurso + 1 && u.estado === 'DEPRECIANDO' ? ' · en curso' : ''}</td><td className="py-1">{fecha(c.desde)}</td>
                <td className="cifra py-1 text-right">{Q(c.cuota)}</td><td className="cifra py-1 text-right">{Q(c.acumulada)}</td><td className="cifra py-1 text-right">{Q(c.valorLibros)}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p>Se deprecia Q{num(u.porKm, 4)} por cada km. Lleva {num(u.kmUsados)} km desde la compra de {num(u.vidaKm)} km de vida útil.</p>}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-gray-500">Compra</dt><dd>{fecha(u.fechaCompra)}</dd>
        <dt className="text-gray-500">Valor residual</dt><dd className="cifra">{Q(u.residual)}</dd>
        <dt className="text-gray-500">Base a depreciar</dt><dd className="cifra">{Q(u.base)}</dd>
        {hay(u.anualActual) && <><dt className="text-gray-500">Cuota de este año</dt><dd className="cifra">{Q(u.anualActual)} ({Q(u.mensualActual)} al mes)</dd></>}
        {u.terminaEl && <><dt className="text-gray-500">Termina</dt><dd>{fecha(u.terminaEl)}</dd></>}
        <dt className="text-gray-500">Origen</dt><dd>{ORIGEN[u.origen]}{u.regla ? ` + «${u.regla}»` : ''}</dd>
        <dt className="col-span-2 mt-2 font-medium text-gray-900">Fiscal ({tasa} % anual)</dt>
        <dt className="text-gray-500">Cuota anual</dt><dd className="cifra">{Q(u.fiscal.anual)}</dd>
        <dt className="text-gray-500">Acumulada</dt><dd className="cifra">{Q(u.fiscal.acumulada)}</dd>
        <dt className="text-gray-500">Valor en libros</dt><dd className="cifra">{Q(u.fiscal.valorLibros)}</dd>
        {u.avisos.length > 0 && <dd className="col-span-2 mt-2 text-amber-800">{u.avisos.join(' ')}</dd>}
        <dd className="col-span-2 mt-2"><Boton onClick={onEditar}>Editar la ficha de {u.tipo === 'CABEZAL' ? 'cabezales' : 'remolques'}</Boton></dd>
      </dl>
    </div>
  )
}
