#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA DE HUMO de ALEXUS Transportes: recorre el flujo de un viaje contra el API en marcha.
//   salud → login → cotizar → programar → iniciar sin inspección (debe fallar) → inspección con falla
//   crítica (rechazada + caso + orden) → nueva inspección aprobada → iniciar → anticipo → peaje
//   → carga de combustible → finalizar → liquidar → cotización guardada → ranking de rentabilidad
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

await paso('Liquidar el viaje', async () => {
  const r = ok(await http('POST', `/viajes/${contexto.viaje.id}/liquidar`));
  return `${r.message} · ganancia ${Q(r.data.ganancia)} (${r.data.margen ?? '—'} %)`;
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

console.log(fallos ? rojo(`\n${fallos} paso(s) fallaron`) : verde('\nTodo en orden'));
process.exit(fallos ? 1 : 0);
