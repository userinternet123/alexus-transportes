// Lógica SIN dependencias de React Native (se prueba en la PC con `npm test`): la cola de reportes del piloto.
//
// Todo lo que el piloto captura (reporte del viaje, inspección, combustible, gasto, caso) entra primero a esta cola,
// con sus fotos, la hora del celular y un identificador único. La cola lo envía cuando hay señal:
//   1. sube cada foto que aún no se subió (y recuerda su archivoId, para no subirla dos veces);
//   2. envía el reporte con el identificador: si ya había llegado, el servidor responde «ya recibido» y no duplica.
// Sin red se detiene; un rechazo (p. ej. «falta la inspección de hoy») se marca para que el piloto lo revise.

export type TipoEnvio = 'evento' | 'inspeccion' | 'carga' | 'gasto' | 'caso'
export type EstadoEnvio = 'pendiente' | 'enviada' | 'rechazada'

export interface FotoLocal {
  clave: string // dónde está guardada (cifrada) en el teléfono
  archivoId: string | null // ya subida al servidor
  descripcion: string | null
  latitud: number | null
  longitud: number | null
  tomadaEn: string
  destino?: string // «punto:FRENOS» = foto de esa falla en la inspección; vacío = evidencia general
}

export interface Pendiente {
  clave: string // también es el uuidCliente que recibe el servidor
  tipo: TipoEnvio
  sucursal: number
  usuario: number
  creado: number
  titulo: string // lo que se ve en la lista de envíos: «Salida · V-000030»
  viajeId: number | null
  carga: Record<string, unknown> // el cuerpo, sin fotos ni uuid
  fotos: FotoLocal[]
  estado: EstadoEnvio
  intentos: number
  proximoIntento: number
  error: string | null
  codigoError: string | null
  resultado: { mensaje: string } | null
}

export interface AlmacenCola { listar(): Promise<Pendiente[]>; guardar(p: Pendiente): Promise<void> }

export interface Transporte {
  /** Sube la foto guardada en el teléfono y devuelve su archivoId. */
  subirFoto(f: FotoLocal): Promise<string>
  /** POST al API; devuelve el mensaje del servidor. */
  enviar(ruta: string, cuerpo: Record<string, unknown>): Promise<string>
}

/** Ruta del API según el tipo de reporte. */
export function rutaDe(p: Pick<Pendiente, 'tipo' | 'viajeId'>): string {
  switch (p.tipo) {
    case 'evento': return `/viajes/${p.viajeId}/eventos`
    case 'gasto': return `/viajes/${p.viajeId}/costos`
    case 'inspeccion': return '/inspecciones'
    case 'carga': return '/combustible'
    case 'caso': return '/casos'
  }
}

const evidencia = (f: FotoLocal) => ({ archivoId: f.archivoId, descripcion: f.descripcion, latitud: f.latitud, longitud: f.longitud, tomadaEn: f.tomadaEn })

/** El cuerpo que recibe el servidor, con los archivoId de las fotos ya subidas. */
export function cuerpoDe(p: Pendiente): Record<string, unknown> {
  const fotos = p.fotos.filter((f) => f.archivoId)
  if (fotos.length !== p.fotos.length) throw new Error('Faltan fotos por subir')
  const base = { ...p.carga, uuidCliente: p.clave }
  if (p.tipo === 'carga' || p.tipo === 'gasto') return { ...base, archivoId: fotos[0]?.archivoId ?? null } // una sola foto: el vale o el recibo
  if (p.tipo === 'inspeccion') {
    const puntos = (p.carga.puntos as { codigo: string }[]).map((pt) => {
      const propias = fotos.filter((f) => f.destino === `punto:${pt.codigo}`)
      return { ...pt, archivoId: propias[0]?.archivoId ?? null }
    })
    // La primera foto de cada falla va en el punto; las demás y las generales, como evidencias de la inspección
    const usadas = new Set(puntos.map((pt) => pt.archivoId).filter(Boolean))
    return { ...base, puntos, evidencias: fotos.filter((f) => !usadas.has(f.archivoId)).map(evidencia) }
  }
  return { ...base, evidencias: fotos.map(evidencia) }
}

/** red / sesión vencida / falla temporal del servidor (se reintenta) / rechazo (necesita que el piloto lo revise). */
export function clasificar(e: unknown): 'red' | 'sesion' | 'servidor' | 'rechazo' {
  const r = (e as { response?: { status: number } })?.response
  if (!r) return 'red'
  if (r.status === 401) return 'sesion'
  if (r.status === 408 || r.status === 429 || r.status >= 500) return 'servidor'
  return 'rechazo'
}
export const mensajeDe = (e: unknown) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (e as Error)?.message ?? 'Error desconocido'
export const codigoDe = (e: unknown) => (e as { response?: { data?: { codigo?: string } } })?.response?.data?.codigo ?? null

/** 30 s, 1 min, 2 min, 4 min… hasta 15 min. */
export const esperaReintento = (intentos: number) => Math.min(30_000 * 2 ** Math.max(0, intentos - 1), 15 * 60_000)

/**
 * Envía lo pendiente, en el orden en que se capturó (la inspección antes que la salida que depende de ella).
 * Cada foto subida se guarda de inmediato: si se corta la señal a medias, la próxima vez sigue donde quedó.
 */
export async function procesarCola(almacen: AlmacenCola, t: Transporte, ahora = Date.now()) {
  const res = { enviadas: 0, rechazadas: 0, detenido: null as null | 'red' | 'sesion', enviados: [] as Pendiente[] }
  const listos = (await almacen.listar()).filter((p) => p.estado === 'pendiente' && p.proximoIntento <= ahora).sort((a, b) => a.creado - b.creado)
  for (const original of listos) {
    let p = original
    try {
      for (let i = 0; i < p.fotos.length; i++) {
        if (p.fotos[i].archivoId) continue
        const archivoId = await t.subirFoto(p.fotos[i])
        p = { ...p, fotos: p.fotos.map((f, j) => (j === i ? { ...f, archivoId } : f)) }
        await almacen.guardar(p)
      }
      const mensaje = await t.enviar(rutaDe(p), cuerpoDe(p))
      p = { ...p, estado: 'enviada', resultado: { mensaje }, error: null, codigoError: null }
      await almacen.guardar(p)
      res.enviadas++
      res.enviados.push(p)
    } catch (e) {
      const tipo = clasificar(e)
      if (tipo === 'sesion') { res.detenido = 'sesion'; break }
      if (tipo === 'rechazo') {
        await almacen.guardar({ ...p, estado: 'rechazada', intentos: p.intentos + 1, error: mensajeDe(e), codigoError: codigoDe(e) })
        res.rechazadas++
        continue
      }
      await almacen.guardar({ ...p, intentos: p.intentos + 1, proximoIntento: ahora + esperaReintento(p.intentos + 1), error: tipo === 'red' ? null : mensajeDe(e) })
      if (tipo === 'red') { res.detenido = 'red'; break }
    }
  }
  return res
}

/** Volver a intentar algo rechazado (después de corregir la causa), opcionalmente con cambios en la carga. */
export const paraReintentar = (p: Pendiente, cambios: Record<string, unknown> = {}, ahora = Date.now()): Pendiente =>
  ({ ...p, carga: { ...p.carga, ...cambios }, estado: 'pendiente', proximoIntento: ahora, error: null, codigoError: null })

/** Nuevo reporte para la cola. */
export function nuevoPendiente(d: { clave: string; tipo: TipoEnvio; sucursal: number; usuario: number; titulo: string; viajeId?: number | null; carga: Record<string, unknown>; fotos?: FotoLocal[] }, ahora = Date.now()): Pendiente {
  return { ...d, viajeId: d.viajeId ?? null, fotos: d.fotos ?? [], creado: ahora, estado: 'pendiente', intentos: 0, proximoIntento: ahora, error: null, codigoError: null, resultado: null }
}

export function haceCuanto(ms: number, ahora = Date.now()) {
  const min = Math.max(0, Math.round((ahora - ms) / 60_000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`
  return `hace ${Math.round(min / 1440)} días`
}

// ───────────── Inspección (mismas reglas que el servidor, para avisar antes de enviar) ─────────────
export interface PuntoInspeccion { codigo: string; nombre: string; grupo: string; critico: boolean; aplicaA: 'CABEZAL' | 'REMOLQUE'; tipoCaso: string; prioridadSugerida: string }
export type Respuesta = { estado: 'OK' | 'FALLA' | 'NO_APLICA'; nota?: string; prioridad?: string }

export function revisarInspeccion(puntos: PuntoInspeccion[], resp: Record<string, Respuesta | undefined>, conRemolque: boolean) {
  const aplican = puntos.filter((p) => p.aplicaA === 'CABEZAL' || conRemolque)
  const faltan = aplican.filter((p) => !resp[p.codigo])
  const sinNota = aplican.filter((p) => resp[p.codigo]?.estado === 'FALLA' && !resp[p.codigo]?.nota?.trim())
  const criticas = aplican.filter((p) => p.critico && resp[p.codigo]?.estado === 'FALLA')
  const fallas = aplican.filter((p) => resp[p.codigo]?.estado === 'FALLA')
  return {
    aplican, faltan: faltan.length, sinNota: sinNota.map((p) => p.nombre),
    resultado: (criticas.length ? 'RECHAZADA' : fallas.length ? 'CON_OBSERVACIONES' : 'APROBADA') as 'APROBADA' | 'CON_OBSERVACIONES' | 'RECHAZADA',
  }
}

// ───────────── «Mi día» (lo que manda el servidor y la app guarda para trabajar sin señal) ─────────────
export interface CabezalDia {
  id: number; codigo: string; placa: string; odometro: string; capacidadTanque: string | null; rendimientoEsperado: string | null; estado: string; asignado: boolean
  inspeccion: { fecha: string; resultado: string; remolqueId: number | null; vigente: boolean; fueraDeServicio: boolean } | null
}
export interface ViajeDia {
  id: number; numero: string; estado: 'PROGRAMADO' | 'EN_RUTA' | 'FINALIZADO'; cliente: string; ruta: string | null; origen: string; destino: string
  carga: string | null; referencia: string | null; fechaSalida: string; fechaCompromiso: string | null; observaciones: string | null
  cabezalId: number; cabezal: string; placa: string; remolqueId: number | null; remolque: string | null; kmSalida: string | null
  anticipos: string; ultimoReporte: { tipo: string; ocurridoEn: string } | null; piloto: string | null
}
export interface CasoDia { id: number; numero: string; titulo: string; prioridad: string; estado: string; impideSalir: boolean; cabezalId: number | null; venceEn: string }
export interface MiDia {
  generado: string
  piloto: { id: number; nombre: string; licenciaTipo: string; licenciaVence: string; diasLicencia: number } | null
  cabezales: CabezalDia[]
  viajes: ViajeDia[]
  casos: CasoDia[]
}

/** El viaje que importa ahora: el que está en ruta; si no, el próximo programado. */
export function viajeActual(d: MiDia | null): ViajeDia | null {
  if (!d) return null
  return d.viajes.find((v) => v.estado === 'EN_RUTA') ?? [...d.viajes].filter((v) => v.estado === 'PROGRAMADO').sort((a, b) => a.fechaSalida.localeCompare(b.fechaSalida))[0] ?? null
}

/** Lo que el piloto debe hacer antes de salir (o lo que lo impide), según lo último que se sabe. */
export function antesDeSalir(d: MiDia | null, v: ViajeDia | null, enCola: Pendiente[]): string[] {
  if (!d || !v || v.estado !== 'PROGRAMADO') return []
  const c = d.cabezales.find((x) => x.id === v.cabezalId)
  const inspeccionEnCola = enCola.some((p) => p.tipo === 'inspeccion' && p.estado !== 'rechazada' && p.carga.cabezalId === v.cabezalId)
  const avisos: string[] = []
  if (c?.inspeccion?.fueraDeServicio && !inspeccionEnCola) avisos.push(`${c.codigo} está fuera de servicio por la última inspección`)
  else if (!c?.inspeccion?.vigente && !inspeccionEnCola) avisos.push(`Falta la inspección de hoy del ${v.cabezal}`)
  for (const k of d.casos.filter((x) => x.impideSalir && (x.cabezalId === v.cabezalId))) avisos.push(`Caso ${k.numero} abierto: ${k.titulo}`)
  if (d.piloto && d.piloto.diasLicencia < 0) avisos.push('Su licencia de conducir está vencida')
  return avisos
}
