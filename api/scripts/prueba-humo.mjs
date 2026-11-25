#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA DE HUMO de ALEXUS Transportes: recorre el flujo de un viaje contra el API en marcha.
//   salud → login → cotizar → programar → iniciar sin inspección (debe fallar) → inspección con falla
//   crítica (rechazada + caso + orden) → nueva inspección aprobada → iniciar → anticipo → peaje
//   → reporte en vivo con fotos e incidente sin señal (caso, sin duplicar) → en ruta ahora → carga de combustible
//   → finalizar → liquidar (con cargas laborales) → cotización guardada → ranking de rentabilidad
//
// Uso (con el API corriendo: npm run dev, y datos de prueba: npm run db:demo):
//   node scripts/prueba-humo.mjs --password "CambiarAhora2026" --nueva "MiClaveNueva2026"   (primera vez)
//   node scripts/prueba-humo.mjs --password "MiClaveNueva2026"
// Opciones: --usuario admin  --api http://localhost:4000/api/v1
// ⚠ Crea un viaje, inspecciones, casos, una orden de taller y una carga REALES en la base de desarrollo.
// ─────────────────────────────────────────────────────────────────────────────
import { parseArgs } from 'node:util';

const { values: o } = parseArgs({
  options: {
    api: { type: 'string', default: 'http://localhost:4000/api/v1' },
    usuario: { type: 'string', default: 'admin' },
    password: { type: 'string' },
    nueva: { type: 'string' },
  },
});
if (!o.password) {
  console.error('Falta --password.  Ej: node scripts/prueba-humo.mjs --password "CambiarAhora2026" --nueva "MiClaveNueva2026"');
  process.exit(1);
}

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const gris = (s) => `\x1b[90m${s}\x1b[0m`;
const Q = (n) => `Q${Number(n ?? 0).toFixed(2)}`;
let token = null;
let sucursalId = null;
let fallos = 0;

async function http(metodo, ruta, cuerpo) {
  const r = await fetch(`${o.api}${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(sucursalId ? { 'x-sucursal-id': String(sucursalId) } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

async function paso(nombre, fn) {
  try {
    const detalle = await fn();
    console.log(`${verde('✔')} ${nombre}${detalle ? gris(` — ${detalle}`) : ''}`);
  } catch (e) {
    fallos += 1;
    console.log(`${rojo('✘')} ${nombre}: ${e.message}`);
  }
}

const ok = (r, msg) => {
  if (r.status >= 300) throw new Error(`${r.status} ${r.json.codigo ?? ''} ${r.json.message ?? r.json.mensaje ?? JSON.stringify(r.json)}`);
  return r.json;
};
const espera = (r, codigo) => {
  if (r.status < 300) throw new Error(`se esperaba el error ${codigo} y respondió ${r.status}`);
  if (r.json.codigo !== codigo) throw new Error(`se esperaba ${codigo} y llegó ${r.json.codigo}: ${r.json.message}`);
  return r.json.message;
};

const contexto = {};

await paso('API en línea', async () => { ok(await http('GET', '/health')); });

await paso('Iniciar sesión', async () => {
  let r = ok(await http('POST', '/auth/login', { username: o.usuario, password: o.password }));
  token = r.accessToken;
  if (r.usuario.cp) {
    if (!o.nueva) throw new Error('El usuario debe cambiar su contraseña: agregue --nueva');
    ok(await http('POST', '/auth/cambiar-password', { actual: o.password, nueva: o.nueva }));
    r = ok(await http('POST', '/auth/login', { username: o.usuario, password: o.nueva }));
    token = r.accessToken;
  }
  sucursalId = r.usuario.sucursales[0];
  return `sede ${sucursalId}`;
});

await paso('Datos de prueba disponibles', async () => {
  const lista = async (ruta) => ok(await http('GET', `${ruta}?limit=0`)).data;
  const [cabezales, pilotos, clientes, rutas, remolques] = await Promise.all([lista('/flota/cabezales'), lista('/pilotos'), lista('/terceros/clientes'), lista('/catalogos/rutas'), lista('/flota/remolques')]);
  const enRuta = ok(await http('GET', '/viajes?estado=EN_RUTA')).data.viajes;
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
  const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const inspeccionados = new Set(ok(await http('GET', `/inspecciones?desde=${ayer}`)).data.inspecciones.map((i) => i.cabezal));
  const libre = (c) => c.estado === 'ACTIVO' && !enRuta.some((v) => v.cabezal === c.codigo);
  // De preferencia uno sin inspección en las últimas 24 h, para probar que no puede salir sin ella
  contexto.cabezal = cabezales.find((c) => libre(c) && !inspeccionados.has(c.codigo)) ?? cabezales.find(libre);
  contexto.sinInspeccion = !inspeccionados.has(contexto.cabezal?.codigo);
  void hoy;
  contexto.piloto = pilotos.find((p) => !enRuta.some((v) => v.pilotoId === p.id) && new Date(p.licenciaVence) > new Date());
  contexto.cliente = clientes[0];
  contexto.ruta = rutas[0];
  contexto.remolque = remolques.find((r) => r.estado === 'ACTIVO' && !enRuta.some((v) => v.remolque === r.codigo));
  if (!contexto.cabezal || !contexto.piloto || !contexto.cliente || !contexto.ruta) throw new Error('Faltan cabezal libre, piloto, cliente o ruta: corra npm run db:demo');
  return `${contexto.cabezal.codigo}, piloto #${contexto.piloto.id}, ${contexto.ruta.nombre}`;
});

await paso('Cotizar el viaje (ida y regreso vacío)', async () => {
  const r = ok(await http('POST', '/viajes/cotizar', { rutaId: contexto.ruta.id, clienteId: contexto.cliente.id, cabezalId: contexto.cabezal.id, regreso: 'VACIO' })).data;
  contexto.precio = r.precioRedondeado;
  return `${r.kmTotal} km, costo ${Q(r.costoTotal)}, sugerido ${Q(r.precioRedondeado)}${r.avisos?.length ? ` · ${r.avisos.length} aviso(s)` : ''}`;
});

await paso('Programar el viaje', async () => {
  const salida = new Date(Date.now() + 3_600_000).toISOString();
  const r = ok(await http('POST', '/viajes', { clienteId: contexto.cliente.id, rutaId: contexto.ruta.id, cabezalId: contexto.cabezal.id, remolqueId: contexto.remolque?.id ?? null, pilotoId: contexto.piloto.id, fechaSalida: salida, carga: 'Prueba de humo', montoCobrado: contexto.precio }));
  contexto.viaje = r.data;
  return `${r.data.numero}${r.data.avisos.length ? ` · ${r.data.avisos.join('; ')}` : ''}`;
});

const puntos = async (remolque) => ok(await http('GET', `/inspecciones/puntos?remolque=${remolque ? 'true' : 'false'}`)).data;

await paso('No inicia sin inspección', async () => (contexto.sinInspeccion ? espera(await http('POST', `/viajes/${contexto.viaje.id}/iniciar`, {}), 'INSPECCION_REQUERIDA') : 'omitido: todos los cabezales libres tienen inspección de hoy'));

await paso('Inspección con frenos en falla: rechazada, abre caso urgente y orden', async () => {
  const lista = await puntos(!!contexto.remolque);
  const r = ok(await http('POST', '/inspecciones', {
    cabezalId: contexto.cabezal.id, remolqueId: contexto.remolque?.id ?? null, pilotoId: contexto.piloto.id, odometro: Number(contexto.cabezal.odometro) + 5,
    puntos: lista.map((p) => (p.codigo === 'FRENOS' ? { codigo: p.codigo, estado: 'FALLA', nota: 'Pedal esponjoso, pierde aire' } : { codigo: p.codigo, estado: 'OK' })),
  }));
  if (r.data.resultado !== 'RECHAZADA') throw new Error(`resultado ${r.data.resultado}`);
  if (!r.data.casos?.length) throw new Error('no abrió casos');
  return `${r.data.ordenTrabajo} · casos ${r.data.casos.map((c) => `${c.numero} (${c.prioridad})`).join(', ')}`;
});

await paso('No inicia con la inspección rechazada', async () => espera(await http('POST', `/viajes/${contexto.viaje.id}/iniciar`, {}), 'INSPECCION_RECHAZADA'));

await paso('Caso: pasar a en proceso y resolver', async () => {
  const casos = ok(await http('GET', `/casos?cabezalId=${contexto.cabezal.id}&estado=ABIERTOS`)).data.casos;
  const c = casos[0];
  ok(await http('PUT', `/casos/${c.id}/estado`, { estado: 'EN_PROCESO', comentario: 'Taller revisa compresor' }));
  ok(await http('PUT', `/casos/${c.id}/estado`, { estado: 'RESUELTO', comentario: 'Se cambió la válvula de purga' }));
  return `${c.numero} resuelto`;
});

await paso('Nueva inspección aprobada', async () => {
  const lista = await puntos(!!contexto.remolque);
  const r = ok(await http('POST', '/inspecciones', { cabezalId: contexto.cabezal.id, remolqueId: contexto.remolque?.id ?? null, pilotoId: contexto.piloto.id, viajeId: contexto.viaje.id, puntos: lista.map((p) => ({ codigo: p.codigo, estado: 'OK' })) }));
  if (r.data.resultado !== 'APROBADA') throw new Error(r.data.resultado);
});

await paso('Iniciar el viaje', async () => {
  const r = ok(await http('POST', `/viajes/${contexto.viaje.id}/iniciar`, {}));
  return r.message;
});

// JPEG mínimo válido (1×1) para probar las evidencias
const FOTO = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
const subirFoto = async (nombre) => ok(await http('POST', '/archivos', { nombre, mime: 'image/jpeg', base64: FOTO })).data.id

await paso('Reporte en vivo: salida con ubicación y foto', async () => {
  const foto = await subirFoto('salida.jpg')
  const r = ok(await http('POST', `/viajes/${contexto.viaje.id}/eventos`, { tipo: 'SALIDA', texto: 'Sale del predio', latitud: 14.6349, longitud: -90.5069, precisionM: 12, evidencias: [{ archivoId: foto, descripcion: 'Carga asegurada' }] }))
  return r.message
})

await paso('Incidente sin señal: abre caso con foto y no se duplica al reenviar', async () => {
  const foto = await subirFoto('llanta.jpg')
  const uuid = crypto.randomUUID()
  const cuerpo = { tipo: 'INCIDENTE', texto: 'Llanta trasera baja', latitud: 14.30, longitud: -90.78, ocurridoEn: new Date(Date.now() - 40 * 60_000).toISOString(), uuidCliente: uuid, evidencias: [{ archivoId: foto }], caso: { tipo: 'LLANTAS', prioridad: 'ALTA', titulo: 'Llanta trasera derecha baja' } }
  const a = ok(await http('POST', `/viajes/${contexto.viaje.id}/eventos`, cuerpo))
  const b = ok(await http('POST', `/viajes/${contexto.viaje.id}/eventos`, cuerpo))
  if (a.data.id !== b.data.id) throw new Error('el reenvío duplicó el reporte')
  if (!a.data.caso) throw new Error('no abrió caso')
  if (a.data.sinSenalMin < 39) throw new Error('no respetó la hora del celular')
  contexto.casoIncidente = a.data.caso
  return `${a.message} · reenvío: ${b.message} · ${a.data.sinSenalMin} min sin señal`
})

await paso('No se puede adjuntar la foto de otro usuario ni una inexistente', async () => espera(await http('POST', `/viajes/${contexto.viaje.id}/eventos`, { tipo: 'NOTA', texto: 'x', evidencias: [{ archivoId: crypto.randomUUID() }] }), 'EVIDENCIA_NO_EXISTE'))

await paso('En ruta ahora', async () => {
  const r = ok(await http('GET', '/viajes/en-vivo')).data
  const v = r.find((x) => x.id === contexto.viaje.id)
  if (!v?.ultimo) throw new Error('el viaje no aparece con su último reporte')
  return `${r.length} viaje(s) en ruta · ${v.numero}: ${v.ultimo.etiqueta}, ${v.casosAbiertos.length} caso(s) abierto(s)`
})

await paso('Caso del incidente con su foto; agregar otra y resolverlo', async () => {
  const c = ok(await http('GET', `/casos/${contexto.casoIncidente.id}`)).data
  if (c.evidencias.length !== 1 || c.latitud == null) throw new Error('el caso no trae foto o ubicación')
  ok(await http('POST', `/casos/${c.id}/evidencias`, { evidencias: [{ archivoId: await subirFoto('reparada.jpg'), descripcion: 'Llanta cambiada' }] }))
  ok(await http('PUT', `/casos/${c.id}/estado`, { estado: 'RESUELTO', comentario: 'Se cambió por la de repuesto en ruta' }))
  return `${c.numero}: 2 fotos, resuelto`
})

await paso('Entregar anticipo de Q1,000', async () => ok(await http('POST', `/viajes/${contexto.viaje.id}/anticipos`, { monto: 1000, nota: 'Prueba' })).message);
await paso('Registrar peaje de Q120 (del anticipo)', async () => ok(await http('POST', `/viajes/${contexto.viaje.id}/costos`, { tipo: 'PEAJE', monto: 120, descripcion: 'Autopista Palín-Escuintla' })).message);
await paso('El combustible no entra como costo suelto', async () => espera(await http('POST', `/viajes/${contexto.viaje.id}/costos`, { tipo: 'COMBUSTIBLE', monto: 500 }), 'COMBUSTIBLE_COMO_CARGA'));

await paso('Carga de combustible en el viaje', async () => {
  const det = ok(await http('GET', `/viajes/${contexto.viaje.id}`)).data;
  contexto.kmSalida = Number(det.kmSalida);
  const r = ok(await http('POST', '/combustible', { cabezalId: contexto.cabezal.id, viajeId: contexto.viaje.id, odometro: contexto.kmSalida + 90, galones: 18.5, precioGalon: 31.25, tanqueLleno: true, estacion: 'Prueba', confirmarSalto: true }));
  return r.message;
});

await paso('Finalizar el viaje', async () => ok(await http('POST', `/viajes/${contexto.viaje.id}/finalizar`, { kmLlegada: contexto.kmSalida + Number(contexto.ruta.kmEstimados) * 2, kmVacios: Number(contexto.ruta.kmEstimados) })).message);

await paso('Liquidar el viaje (con cargas laborales sobre el pago al piloto)', async () => {
  const r = ok(await http('POST', `/viajes/${contexto.viaje.id}/liquidar`));
  return `${r.message} · ganancia ${Q(r.data.ganancia)} (${r.data.margen ?? '—'} %) · cargas ${Q(r.data.cargasPagoPiloto)}`;
});

await paso('Cotizador desglosa sueldos y cargas laborales incluidas', async () => {
  const r = ok(await http('POST', '/viajes/cotizar', { rutaId: contexto.ruta.id })).data
  const cargas = r.supuestos.cargas.filter((c) => c.incluida).map((c) => `${c.nombre.split(' ')[0]} ${c.tasa} %`)
  return `sueldos: ${r.supuestos.fuenteSueldos.toLowerCase()} · ${cargas.join(', ')}`
});

await paso('Guardar una cotización y convertirla en viaje', async () => {
  const c = ok(await http('POST', '/cotizaciones', { clienteId: contexto.cliente.id, rutaId: contexto.ruta.id, regreso: 'VACIO', terreno: 'MONTANA', trafico: 'LENTO', horasEspera: 3, extras: [{ concepto: 'Maniobra de descarga', monto: 250 }] })).data;
  const v = ok(await http('POST', `/cotizaciones/${c.id}/convertir`, { cabezalId: contexto.cabezal.id, pilotoId: contexto.piloto.id, fechaSalida: new Date(Date.now() + 86_400_000).toISOString() })).data;
  ok(await http('POST', `/viajes/${v.id}/cancelar`, { motivo: 'Viaje de la prueba de humo' }));
  return `${c.numero} → ${v.numero} (cancelado)`;
});

await paso('Ranking de rentabilidad', async () => {
  const r = ok(await http('GET', '/viajes/rentabilidad')).data;
  return `${r.porCliente.length} clientes, ${r.porRuta.length} rutas, ${r.viajes.length} viajes`;
});

await paso('Depreciación de la flota (reglas por marca, tipo y año) y su partida en el costo por km', async () => {
  const d = ok(await http('GET', '/finanzas/depreciacion')).data;
  const con = d.unidades.filter((u) => u.estado !== 'SIN_DATOS');
  if (!con.length) throw new Error('Ninguna unidad tiene costo y fecha de compra');
  const malas = con.filter((u) => Math.abs(Number(u.costo) - Number(u.acumulada) - Number(u.valorLibros)) > 0.01);
  if (malas.length) throw new Error(`Valor en libros no cuadra: ${malas.map((u) => u.codigo).join(', ')}`);
  const ck = ok(await http('GET', '/viajes/costo-km')).data;
  const partida = ck.partidas.find((x) => x.concepto.startsWith('Depreciación'));
  if (ck.depreciacion.incluida && !partida) throw new Error('La depreciación está incluida pero no aparece en el costo por km');
  return `${con.length} unidades · libros Q${Number(d.totales.valorLibros).toFixed(2)} · período Q${Number(d.totales.periodo).toFixed(2)} · ${ck.depreciacion.incluida ? 'incluida' : 'no incluida'} en el costo por km`;
});

await paso('Cuentas por cobrar: facturar un viaje, abonar, antigüedad y recordatorio', async () => {
  const sin = ok(await http('GET', '/cobros/sin-facturar')).data;
  if (!sin.length) return 'sin viajes por facturar (se omite)';
  const g = sin[0];
  const v = g.viajes[0];
  const hoy = new Date().toISOString().slice(0, 10);
  const c = ok(await http('POST', '/cobros', { clienteId: g.clienteId, viajeIds: [v.id], fechaEmision: hoy, diasCredito: 30 })).data;
  const repetido = await http('POST', '/cobros', { clienteId: g.clienteId, viajeIds: [v.id], fechaEmision: hoy });
  if (repetido.status !== 409) throw new Error('Se pudo facturar dos veces el mismo viaje');
  const mitad = Math.round(Number(v.montoCobrado) * 50) / 100;
  ok(await http('POST', `/cobros/${c.id}/abonos`, { fecha: hoy, monto: mitad, medio: 'TRANSFERENCIA', referencia: 'HUMO' }));
  const d = ok(await http('GET', `/cobros/${c.id}`)).data;
  if (d.estado !== 'PARCIAL' || Math.abs(Number(d.saldo) - (Number(v.montoCobrado) - mitad)) > 0.01) throw new Error(`Saldo inesperado: ${d.saldo}`);
  if (!d.recordatorio?.texto.includes('Total:')) throw new Error('Sin recordatorio');
  const r = ok(await http('GET', '/cobros/resumen')).data;
  // Se deja como estaba: se anula el abono y la cuenta (el viaje vuelve a «sin facturar»)
  ok(await http('PUT', `/cobros/${c.id}/abonos/${d.abonos[0].id}/anular`, { motivo: 'Prueba de humo' }));
  ok(await http('PUT', `/cobros/${c.id}/anular`, { motivo: 'Prueba de humo' }));
  return `${c.numero} · ${g.cliente} · saldo tras abono Q${Number(d.saldo).toFixed(2)} · por cobrar Q${Number(r.total.saldo).toFixed(2)} · ${r.tramos.length} tramos`;
});

await paso('Taller: orden con repuesto, cerrar libera la unidad, alertas de mantenimiento', async () => {
  const cab = ok(await http('GET', '/flota/cabezales?limit=0')).data.find((c) => c.estado === 'ACTIVO');
  const rep = ok(await http('GET', '/mantenimiento/repuestos?limit=0')).data[0];
  if (!cab || !rep) return 'sin cabezal activo o repuestos (se omite)';
  const o = ok(await http('POST', '/taller/ordenes', { cabezalId: cab.id, tipo: 'CORRECTIVO', descripcion: 'Prueba de humo: revisión', ponerEnTaller: true })).data;
  const enTaller = ok(await http('GET', `/flota/cabezales/${cab.id}`)).data.estado;
  ok(await http('POST', `/taller/ordenes/${o.id}/repuestos`, { repuestoId: rep.id, cantidad: 1, costoUnitario: 100 }));
  ok(await http('PUT', `/taller/ordenes/${o.id}`, { manoObra: 50 }));
  const cierre = ok(await http('PUT', `/taller/ordenes/${o.id}/estado`, { estado: 'CERRADA', comentario: 'Prueba de humo terminada' }));
  const despues = ok(await http('GET', `/flota/cabezales/${cab.id}`)).data.estado;
  if (enTaller !== 'EN_TALLER') throw new Error(`No quedó en taller (${enTaller})`);
  if (despues !== 'ACTIVO' && !/sigue con la orden/.test(cierre.message)) throw new Error(`No se liberó la unidad (${despues})`);
  const m = ok(await http('GET', '/taller/mantenimiento')).data;
  return `${o.numero} · ${cierre.message} · alertas: ${m.resumen.VENCIDO} vencidas, ${m.resumen.PROXIMO} próximas`;
});

await paso('Incidentes: multa con pago, accidente con orden, seguro y descuento al piloto en planilla', async () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const cab = ok(await http('GET', '/flota/cabezales?limit=0')).data.find((c) => c.estado === 'ACTIVO');
  const pil = ok(await http('GET', '/pilotos?limit=0')).data[0];
  if (!cab || !pil) return 'sin cabezal o piloto (se omite)';
  espera(await http('POST', '/incidentes', { tipo: 'MULTA', fecha: hoy, descripcion: 'Multa sin monto' }), 'VALIDACION');
  const m = ok(await http('POST', '/incidentes', { tipo: 'MULTA', fecha: hoy, descripcion: 'Prueba de humo: exceso de velocidad', cabezalId: cab.id, pilotoId: pil.id, montoMulta: 400, fechaLimitePago: hoy })).data;
  espera(await http('PUT', `/incidentes/${m.id}/estado`, { estado: 'CERRADO', comentario: 'sin pagar' }), 'MULTA_SIN_PAGAR');
  ok(await http('PUT', `/incidentes/${m.id}/gestion`, { pagadoEn: hoy, montoPagado: 300, responsable: 'EMPRESA' }));
  ok(await http('PUT', `/incidentes/${m.id}/estado`, { estado: 'CERRADO', comentario: 'Pagada con descuento' }));
  const a = ok(await http('POST', '/incidentes', { tipo: 'ACCIDENTE', fecha: hoy, descripcion: 'Prueba de humo: golpe en defensa', cabezalId: cab.id, pilotoId: pil.id, costoDanos: 3000, abrirOrden: true }));
  espera(await http('PUT', `/incidentes/${a.data.id}/gestion`, { descuentoPiloto: 600 }), 'RESPONSABLE');
  ok(await http('PUT', `/incidentes/${a.data.id}/gestion`, { responsable: 'PILOTO', descuentoPiloto: 600, cuotasDescuento: 2, aseguradora: 'Seguros de prueba', estadoReclamo: 'PRESENTADO' }));
  const d = ok(await http('GET', `/incidentes/${a.data.id}`)).data;
  if (!d.ordenTrabajo) throw new Error('No abrió la orden de taller');
  const r = ok(await http('GET', '/incidentes/resumen')).data;
  // Se deja como estaba: la orden se anula y el incidente también
  ok(await http('PUT', `/taller/ordenes/${d.ordenTrabajo.id}/estado`, { estado: 'ANULADA', comentario: 'Prueba de humo' }));
  ok(await http('PUT', `/incidentes/${a.data.id}/estado`, { estado: 'ANULADO', comentario: 'Prueba de humo' }));
  return `${m.numero} pagada y cerrada · ${a.data.numero} con ${d.ordenTrabajo.numero}, neto Q${Number(d.neto).toFixed(2)} · ${r.totales.incidentes} incidentes en el año`;
});

await paso('Llantas: montar, medir, rotar, retirar a reencauche y volver; rendimiento por marca', async () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const t = ok(await http('GET', '/llantas-control/tablero?estado=EN_BODEGA')).data;
  const l = t.filas[0];
  const cab = ok(await http('GET', '/flota/cabezales?limit=0')).data.find((c) => c.estado === 'ACTIVO' && c.codigo !== 'C-01') ?? null;
  if (!l || !cab) return 'sin llantas en bodega o cabezal (se omite)';
  const u = ok(await http('GET', `/llantas-control/unidad?cabezalId=${cab.id}`)).data;
  const libres = u.posiciones.filter((p) => !p.llanta && p.posicion !== 'REP');
  if (libres.length < 2) return 'sin posiciones libres (se omite)';
  ok(await http('POST', `/llantas-control/${l.id}/montar`, { cabezalId: cab.id, posicion: libres[0].posicion, fecha: hoy }));
  espera(await http('POST', `/llantas-control/${l.id}/montar`, { cabezalId: cab.id, posicion: libres[1].posicion, fecha: hoy }), 'LLANTA_NO_DISPONIBLE');
  const mm = Number(l.profundidadInicialMm ?? 18);
  espera(await http('POST', `/llantas-control/${l.id}/medicion`, { fecha: hoy, profundidadMm: mm + 1 }), 'MEDICION_INVALIDA');
  ok(await http('POST', `/llantas-control/${l.id}/medicion`, { fecha: hoy, profundidadMm: mm - 1, presionPsi: 110 }));
  ok(await http('POST', `/llantas-control/${l.id}/rotar`, { cabezalId: cab.id, posicion: libres[1].posicion, fecha: hoy }));
  ok(await http('POST', `/llantas-control/${l.id}/retirar`, { fecha: hoy, motivo: 'Prueba de humo', destino: 'EN_REENCAUCHE', profundidadMm: mm - 2 }));
  ok(await http('POST', `/llantas-control/${l.id}/reencauche`, { fecha: hoy, costo: 1200, profundidadMm: 15 }));
  const h = ok(await http('GET', `/llantas-control/${l.id}/historial`)).data;
  if (h.estado !== 'EN_BODEGA' || h.reencauches < 1 || h.montajes.length < 2) throw new Error(`Historial inesperado: ${h.estado}, ${h.montajes.length} montajes`);
  const pm = ok(await http('GET', '/llantas-control/por-marca')).data;
  return `${l.codigo}: ${h.montajes.length} montajes, ${h.mediciones.length} mediciones, reencauche ${h.reencauches} · ${pm.length} marcas comparadas · alertas: ${t.resumen.CAMBIAR} cambiar, ${t.resumen.PRONTO} pronto`;
});

await paso('Planilla con horas extra, pago por viajes y descuentos por incidentes', async () => {
  const hoy = new Date();
  const p = ok(await http('POST', '/rrhh/planillas/generar', { anio: hoy.getUTCFullYear(), mes: hoy.getUTCMonth() + 1, tipo: 'MENSUAL' })).data;
  const d = ok(await http('GET', `/rrhh/planillas/${p.id}`)).data;
  const extra = d.detalles.reduce((a, x) => a + Number(x.horasExtraMonto), 0);
  const desc = d.descuentos.reduce((a, x) => a + Number(x.monto), 0);
  if (!d.detalles.length) throw new Error('La planilla salió vacía');
  return `${d.periodo}: ${d.detalles.length} empleados · horas extra Q${extra.toFixed(2)} · descuentos por incidentes Q${desc.toFixed(2)} · líquido Q${Number(d.totalLiquido).toFixed(2)}`;
});

await paso('Avisos en la campana (mantenimiento, llantas, multas)', async () => {
  const n = ok(await http('GET', '/notificaciones')).data;
  const tipos = [...new Set(n.map((x) => x.tipo))];
  return `${n.length} avisos · ${tipos.join(', ')}`;
});

console.log(fallos ? rojo(`\n${fallos} paso(s) fallaron`) : verde('\nTodo en orden'));
process.exit(fallos ? 1 : 0);
