import { test } from 'node:test'
import assert from 'node:assert/strict'
import { antesDeSalir, cuerpoDe, nuevoPendiente, paraReintentar, procesarCola, revisarInspeccion, rutaDe, viajeActual, type AlmacenCola, type FotoLocal, type MiDia, type Pendiente, type Transporte } from './logica'

const foto = (clave: string, destino?: string): FotoLocal => ({ clave, archivoId: null, descripcion: null, latitud: 14.6, longitud: -90.5, tomadaEn: '2026-11-20T10:00:00Z', destino })
const memoria = (inicial: Pendiente[]) => {
  const m = new Map(inicial.map((p) => [p.clave, p]))
  const a: AlmacenCola & { m: Map<string, Pendiente> } = { m, listar: async () => [...m.values()], guardar: async (p) => { m.set(p.clave, p) } }
  return a
}
const errorHttp = (status: number, message = 'x', codigo = 'X') => Object.assign(new Error(message), { response: { status, data: { message, codigo } } })

test('cada tipo va a su ruta del API', () => {
  assert.equal(rutaDe({ tipo: 'evento', viajeId: 7 }), '/viajes/7/eventos')
  assert.equal(rutaDe({ tipo: 'gasto', viajeId: 7 }), '/viajes/7/costos')
  assert.equal(rutaDe({ tipo: 'inspeccion', viajeId: null }), '/inspecciones')
  assert.equal(rutaDe({ tipo: 'carga', viajeId: null }), '/combustible')
  assert.equal(rutaDe({ tipo: 'caso', viajeId: null }), '/casos')
})

test('el cuerpo lleva el uuid y las fotos ya subidas; en la inspección la foto de la falla va en su punto', () => {
  const p = nuevoPendiente({ clave: 'u1', tipo: 'inspeccion', sucursal: 1, usuario: 9, titulo: 'Inspección', carga: { cabezalId: 2, puntos: [{ codigo: 'FRENOS', estado: 'FALLA', nota: 'pierde aire' }, { codigo: 'LUCES', estado: 'OK' }] },
    fotos: [{ ...foto('a', 'punto:FRENOS'), archivoId: 'A' }, { ...foto('b', 'punto:FRENOS'), archivoId: 'B' }, { ...foto('c'), archivoId: 'C' }] })
  const c = cuerpoDe(p) as { uuidCliente: string; puntos: { codigo: string; archivoId: string | null }[]; evidencias: { archivoId: string }[] }
  assert.equal(c.uuidCliente, 'u1')
  assert.deepEqual(c.puntos.map((x) => x.archivoId), ['A', null])
  assert.deepEqual(c.evidencias.map((x) => x.archivoId), ['B', 'C'])
  assert.throws(() => cuerpoDe({ ...p, fotos: [foto('z')] }), /Faltan fotos/)
  const g = cuerpoDe({ ...nuevoPendiente({ clave: 'u2', tipo: 'gasto', sucursal: 1, usuario: 9, titulo: 'Peaje', viajeId: 3, carga: { tipo: 'PEAJE', monto: 30 } }), fotos: [{ ...foto('r'), archivoId: 'R' }] })
  assert.equal(g.archivoId, 'R')
})

test('sube las fotos, recuerda cada una y envía; si se corta la señal a media subida, no las vuelve a subir', async () => {
  const p = nuevoPendiente({ clave: 'u3', tipo: 'evento', sucursal: 1, usuario: 9, titulo: 'Incidente', viajeId: 5, carga: { tipo: 'INCIDENTE', texto: 'llanta' }, fotos: [foto('f1'), foto('f2')] }, 0)
  const almacen = memoria([p])
  let subidas = 0
  let cortar = true
  const t: Transporte = {
    subirFoto: async (f) => { if (f.clave === 'f2' && cortar) { cortar = false; throw new Error('Network Error') } subidas++; return `ID-${f.clave}` },
    enviar: async (ruta, cuerpo) => { assert.equal(ruta, '/viajes/5/eventos'); assert.equal((cuerpo.evidencias as unknown[]).length, 2); return 'Incidente reportado' },
  }
  const r1 = await procesarCola(almacen, t, 0)
  assert.equal(r1.detenido, 'red')
  assert.equal(almacen.m.get('u3')!.fotos[0].archivoId, 'ID-f1') // la primera ya quedó subida
  const r2 = await procesarCola(almacen, t, 10 * 60_000)
  assert.equal(r2.enviadas, 1)
  assert.equal(subidas, 2) // f1 una vez y f2 una vez
  assert.equal(almacen.m.get('u3')!.estado, 'enviada')
})

test('un rechazo queda para revisión con su código y no detiene lo demás; se puede reintentar con cambios', async () => {
  const a = nuevoPendiente({ clave: 'a', tipo: 'carga', sucursal: 1, usuario: 9, titulo: 'Carga', carga: { odometro: 999999 } }, 1)
  const b = nuevoPendiente({ clave: 'b', tipo: 'caso', sucursal: 1, usuario: 9, titulo: 'Caso', carga: { titulo: 'ruido' } }, 2)
  const almacen = memoria([a, b])
  const t: Transporte = { subirFoto: async () => 'x', enviar: async (ruta, c) => { if (ruta === '/combustible' && !c.confirmarSalto) throw errorHttp(422, 'Revise el odómetro', 'SALTO_ODOMETRO'); return 'ok' } }
  const r = await procesarCola(almacen, t, 10)
  assert.deepEqual([r.rechazadas, r.enviadas], [1, 1])
  assert.equal(almacen.m.get('a')!.codigoError, 'SALTO_ODOMETRO')
  await almacen.guardar(paraReintentar(almacen.m.get('a')!, { confirmarSalto: true }, 20))
  assert.equal((await procesarCola(almacen, t, 20)).enviadas, 1)
})

test('sesión vencida detiene sin marcar nada; falla del servidor se reintenta más tarde', async () => {
  const p = nuevoPendiente({ clave: 's', tipo: 'caso', sucursal: 1, usuario: 9, titulo: 'Caso', carga: {} }, 0)
  const almacen = memoria([p])
  assert.equal((await procesarCola(almacen, { subirFoto: async () => 'x', enviar: async () => { throw errorHttp(401) } }, 0)).detenido, 'sesion')
  assert.equal(almacen.m.get('s')!.estado, 'pendiente')
  await procesarCola(almacen, { subirFoto: async () => 'x', enviar: async () => { throw errorHttp(503) } }, 0)
  assert.equal(almacen.m.get('s')!.intentos, 1)
  assert.ok(almacen.m.get('s')!.proximoIntento > 0)
})

test('inspección: faltantes, fallas sin descripción y resultado', () => {
  const puntos = [
    { codigo: 'FRENOS', nombre: 'Frenos', grupo: 'g', critico: true, aplicaA: 'CABEZAL' as const, tipoCaso: 'MECANICO', prioridadSugerida: 'URGENTE' },
    { codigo: 'BOCINA', nombre: 'Bocina', grupo: 'g', critico: false, aplicaA: 'CABEZAL' as const, tipoCaso: 'MECANICO', prioridadSugerida: 'MODERADA' },
    { codigo: 'REM_LUCES', nombre: 'Luces remolque', grupo: 'r', critico: true, aplicaA: 'REMOLQUE' as const, tipoCaso: 'MECANICO', prioridadSugerida: 'URGENTE' },
  ]
  assert.equal(revisarInspeccion(puntos, { FRENOS: { estado: 'OK' } }, false).faltan, 1)
  const r = revisarInspeccion(puntos, { FRENOS: { estado: 'OK' }, BOCINA: { estado: 'FALLA' } }, false)
  assert.deepEqual([r.faltan, r.sinNota, r.resultado], [0, ['Bocina'], 'CON_OBSERVACIONES'])
  assert.equal(revisarInspeccion(puntos, { FRENOS: { estado: 'FALLA', nota: 'x' }, BOCINA: { estado: 'OK' } }, false).resultado, 'RECHAZADA')
})

test('viaje actual y lo que falta antes de salir', () => {
  const dia: MiDia = {
    generado: '', piloto: { id: 1, nombre: 'Luis', licenciaTipo: 'A', licenciaVence: '2027-01-01', diasLicencia: 40 },
    cabezales: [{ id: 2, codigo: 'C-02', placa: 'P', odometro: '1', capacidadTanque: null, rendimientoEsperado: null, estado: 'ACTIVO', asignado: true, inspeccion: { fecha: '', resultado: 'APROBADA', remolqueId: null, vigente: false, fueraDeServicio: false } }],
    viajes: [
      { id: 9, numero: 'V-9', estado: 'PROGRAMADO', fechaSalida: '2026-11-21T10:00:00Z', cabezalId: 2, cabezal: 'C-02' } as MiDia['viajes'][number],
      { id: 8, numero: 'V-8', estado: 'PROGRAMADO', fechaSalida: '2026-11-20T10:00:00Z', cabezalId: 2, cabezal: 'C-02' } as MiDia['viajes'][number],
    ],
    casos: [{ id: 1, numero: 'CS-1', titulo: 'Manguera', prioridad: 'URGENTE', estado: 'ABIERTO', impideSalir: true, cabezalId: 2, venceEn: '' }],
  }
  const v = viajeActual(dia)
  assert.equal(v?.numero, 'V-8')
  assert.deepEqual(antesDeSalir(dia, v, []), ['Falta la inspección de hoy del C-02', 'Caso CS-1 abierto: Manguera'])
  const enCola = [nuevoPendiente({ clave: 'i', tipo: 'inspeccion', sucursal: 1, usuario: 1, titulo: '', carga: { cabezalId: 2 } })]
  assert.deepEqual(antesDeSalir(dia, v, enCola), ['Caso CS-1 abierto: Manguera'])
})
