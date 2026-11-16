// ─────────────────────────────────────────────────────────────────────────────
// LICENCIA Y MÓDULOS: plan contratado, módulos incluidos, vigencia, carga de
// una licencia nueva y (plan Profesional o superior) qué reportes ven los usuarios.
// ─────────────────────────────────────────────────────────────────────────────
import CodigoEquipo from './CodigoEquipo'
import { useEffect, useState } from 'react'
import { BadgeCheck, Lock, Upload } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { errorApi } from '../comun/formato'
import { Grupo } from '../comun/Hoja'

const MODO = {
  abierto: ['Modo desarrollo', 'Todos los módulos están habilitados porque este servidor aún no exige licencia.', 'bg-sky-50 text-sky-700'],
  licenciado: ['Licencia activa', '', 'bg-green-50 text-green-700'],
  vencida: ['Licencia vencida', 'El sistema funciona con el plan Básico hasta que se cargue una licencia vigente.', 'bg-red-50 text-red-700'],
  'sin-licencia': ['Sin licencia', 'El sistema funciona con el plan Básico. Cargue la licencia que le entregó su proveedor.', 'bg-amber-50 text-amber-700'],
}

const limite = (n) => (n === null || n === undefined || n >= 9999 ? 'sin límite' : `hasta ${n}`)

export default function Licencia() {
  const [lic, setLic] = useState(null)
  const [reportes, setReportes] = useState({ data: [], configurable: false })
  const [token, setToken] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = () => {
    api.get('/licencia').then(({ data }) => setLic(data.data))
    api.get('/licencia/reportes').then(({ data }) => setReportes(data))
  }
  useEffect(cargar, [])

  const activar = async () => {
    setGuardando(true)
    try {
      const { data } = await api.put('/licencia', { token })
      showToast({ type: 'success', message: data.message })
      setToken('')
      cargar()
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setGuardando(false) }
  }

  const leerArchivo = (archivo) => {
    if (!archivo) return
    const r = new FileReader()
    r.onload = () => setToken(String(r.result).trim())
    r.readAsText(archivo)
  }

  const alternarReporte = async (clave) => {
    const ocultos = reportes.data.filter((r) => r.contratado && (r.clave === clave ? r.visible : !r.visible)).map((r) => r.clave)
    try {
      await api.put('/licencia/reportes', { ocultos })
      setReportes((x) => ({ ...x, data: x.data.map((r) => (r.clave === clave ? { ...r, visible: !r.visible } : r)) }))
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  if (!lic) return <p className="p-6 text-gray-500">Cargando…</p>
  const [titulo, explicacion, color] = MODO[lic.modo] ?? MODO['sin-licencia']
  const porCategoria = reportes.data.reduce((acc, r) => ({ ...acc, [r.categoria]: [...(acc[r.categoria] ?? []), r] }), {})

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <section className="rounded-superficie border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">Plan contratado</p>
            <p className="text-3xl font-bold tracking-tight">{lic.planNombre}</p>
            <p className="mt-1 text-sm text-gray-600">{lic.empresa}{lic.nit && lic.nit !== 'CF' ? `, NIT ${lic.nit}` : ''}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${color}`}>{titulo}</span>
        </div>
        {explicacion && <p className="mt-3 text-sm text-gray-600">{explicacion}</p>}
        {lic.modo === 'licenciado' && (
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-gray-500">Vence</dt><dd className={`font-medium ${lic.diasRestantes <= 15 ? 'text-amber-700' : ''}`}>{lic.vence} ({lic.diasRestantes} días)</dd></div>
            <div><dt className="text-gray-500">Usuarios activos</dt><dd className="font-medium">{limite(lic.limites?.usuarios ?? lic.maxUsuarios)}</dd></div>
            <div><dt className="text-gray-500">Sucursales</dt><dd className="font-medium">{limite(lic.limites?.sucursales ?? lic.maxSucursales)}</dd></div>
            <div><dt className="text-gray-500">Bodegas</dt><dd className="font-medium">{limite(lic.limites?.bodegas)}</dd></div>
            <div><dt className="text-gray-500">Cajas</dt><dd className="font-medium">{limite(lic.limites?.cajas)}</dd></div>
          </dl>
        )}
      </section>

      <Grupo titulo="Módulos">
        {lic.modulos.map((m) => (
          <div key={m.clave} className={`flex items-start gap-3 px-4 py-3 ${m.incluido ? '' : 'opacity-70'}`}>
            {m.incluido ? <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden /> : <Lock className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden />}
            <div className="flex-1">
              <p className="text-[15px] font-medium">{m.nombre}</p>
              <p className="text-sm text-gray-500">{m.descripcion}</p>
            </div>
            <span className="text-xs text-gray-500">{m.incluido ? 'Incluido' : `Disponible en plan ${m.disponibleEn}`}</span>
          </div>
        ))}
      </Grupo>

      <section>
        <h3 className="mb-1.5 px-1 text-[13px] text-gray-500">Reportes</h3>
        <p className="mb-2 px-1 text-xs text-gray-500">
          {reportes.configurable ? 'Elija qué reportes contratados ven sus usuarios.' : 'Para elegir qué reportes ve su personal se requiere el plan Profesional o superior.'}
        </p>
        <div className="space-y-3">
          {Object.entries(porCategoria).map(([cat, lista]) => (
            <Grupo key={cat} titulo={cat}>
              {lista.map((r) => (
                <label key={r.clave} className={`flex items-center gap-3 px-4 py-2.5 ${r.contratado ? '' : 'opacity-60'}`}>
                  <span className="flex-1">
                    <span className="block text-[15px]">{r.titulo}</span>
                    <span className="block text-xs text-gray-500">{r.contratado ? r.descripcion : 'No incluido en su plan'}</span>
                  </span>
                  {r.contratado
                    ? <input type="checkbox" checked={r.visible} disabled={!reportes.configurable} onChange={() => alternarReporte(r.clave)} aria-label={`Mostrar ${r.titulo}`} />
                    : <Lock className="h-4 w-4 text-gray-400" aria-label="No incluido" />}
                </label>
              ))}
            </Grupo>
          ))}
        </div>
      </section>

      {lic.modo !== 'abierto' && (
        <section className="rounded-superficie border bg-white p-5">
          <div className="mb-4"><CodigoEquipo codigo={lic?.codigoEquipo} /></div>
          <h3 className="font-semibold">Cargar licencia</h3>
          <p className="mt-1 text-sm text-gray-600">Pegue el texto de la licencia o elija el archivo <code>.lic</code> que le entregó su proveedor.</p>
          <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} className="mt-3 w-full rounded-control border px-3 py-2 font-mono text-xs" placeholder="eyJ2IjoxLCJlbXByZXNhIjoi…" aria-label="Texto de la licencia" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-control border px-3 py-2 text-sm hover:bg-gray-50">
              <Upload className="h-4 w-4" /> Elegir archivo .lic
              <input type="file" accept=".lic,text/plain" className="sr-only" onChange={(e) => leerArchivo(e.target.files?.[0])} />
            </label>
            <button type="button" disabled={token.length < 40 || guardando} onClick={activar} className="rounded-control bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {guardando ? 'Verificando…' : 'Activar licencia'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
