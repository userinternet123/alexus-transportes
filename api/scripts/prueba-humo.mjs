#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA DE HUMO de SPVI 2.0 — recorre el flujo completo contra el API en marcha:
//   salud → login → (cambio de contraseña) → perfil → productos → reportes
//   → abrir caja → vender → FEL → cuadre → cerrar caja → pre-cierre del día
//
// Uso (con el API corriendo en otra terminal: npm run dev):
//   node scripts/prueba-humo.mjs --password "Admin-Spvi-2026" --nueva "MiClaveNueva2026"
//   node scripts/prueba-humo.mjs --password "MiClaveNueva2026"          (siguientes veces)
//
// Opciones: --usuario admin  --sucursal DEN  --api http://localhost:4000/api/v1
//           --cerrar-dia   (además ejecuta el cierre del día; bloquea ventas de hoy)
//
// ⚠ Crea una venta REAL de 1 unidad en la base de desarrollo (descuenta existencia).
// ─────────────────────────────────────────────────────────────────────────────
import { parseArgs } from 'node:util';

const { values: o } = parseArgs({
  options: {
    api: { type: 'string', default: 'http://localhost:4000/api/v1' },
    usuario: { type: 'string', default: 'admin' },
    password: { type: 'string' },
    nueva: { type: 'string' },
    sucursal: { type: 'string', default: 'DEN' },
    'cerrar-dia': { type: 'boolean', default: false },
  },
});
if (!o.password) {
  console.error('Falta --password.  Ej: node scripts/prueba-humo.mjs --password "Admin-Spvi-2026" --nueva "MiClaveNueva2026"');
  process.exit(1);
}

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const gris = (s) => `\x1b[90m${s}\x1b[0m`;
const Q = (n) => `Q${Number(n ?? 0).toFixed(2)}`;
const resultados = [];
let token = null;
let sucursalId = null;

async function api(metodo, ruta, cuerpo) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (sucursalId) headers['X-Sucursal-Id'] = String(sucursalId);
  let res;
  try {
    res = await fetch(`${o.api}${ruta}`, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  } catch (e) {
    throw new Error(`No hay conexión con ${o.api} — ¿está corriendo "npm run dev"? (${e.cause?.code ?? e.message})`);
  }
  const texto = await res.text();
  const json = texto ? JSON.parse(texto) : {};
  if (!res.ok) {
    const err = new Error(`${res.status} ${json.codigo ?? ''}: ${json.message ?? texto}`);
    err.codigo = json.codigo;
    throw err;
  }
  return json;
}

async function paso(nombre, fn) {
  process.stdout.write(`• ${nombre}… `);
  try {
    const detalle = await fn();
    console.log(verde('✔') + (detalle ? ` ${gris(detalle)}` : ''));
    resultados.push({ paso: nombre, resultado: 'OK' });
    return true;
  } catch (e) {
    console.log(rojo(`✗ ${e.message}`));
    resultados.push({ paso: nombre, resultado: 'FALLÓ' });
    return false;
  }
}

const fin = () => {
  console.log('');
  console.table(resultados);
  const fallos = resultados.filter((r) => r.resultado !== 'OK').length;
  console.log(fallos ? rojo(`${fallos} paso(s) fallaron.`) : verde('✔ Prueba de humo completa: el API funciona de punta a punta.'));
  process.exit(fallos ? 1 : 0);
};

// ── 1. Salud ────────────────────────────────────────────────────────────────
if (!(await paso('API y base de datos en línea', async () => {
  const h = await api('GET', '/health');
  return `BD ${h.db}, ${h.latenciaDbMs} ms`;
}))) fin();

// ── 2. Login (+ cambio de contraseña obligatorio) ───────────────────────────
let debeCambiar = false;
if (!(await paso(`Login como "${o.usuario}"`, async () => {
  const r = await api('POST', '/auth/login', { username: o.usuario, password: o.password });
  token = r.accessToken;
  debeCambiar = Boolean(r.usuario.cp);
  return debeCambiar ? 'debe cambiar contraseña' : `${r.usuario.permisos.includes('*') ? 'superadmin' : r.usuario.permisos.length + ' permisos'}`;
}))) fin();

if (debeCambiar) {
  if (!o.nueva) {
    console.log(rojo('\nEl usuario debe cambiar su contraseña. Repita agregando --nueva "UnaClaveNueva2026" (mín. 10 caracteres, letras y números).'));
    resultados.push({ paso: 'Cambio de contraseña obligatorio', resultado: 'PENDIENTE (use --nueva)' });
    fin();
  }
  if (!(await paso('Cambio de contraseña obligatorio', async () => {
    const r = await api('POST', '/auth/cambiar-password', { actual: o.password, nueva: o.nueva });
    token = r.accessToken;
    return `use --password "${o.nueva}" la próxima vez`;
  }))) fin();
}

// ── 3. Perfil y sucursal ────────────────────────────────────────────────────
if (!(await paso(`Perfil y sucursal ${o.sucursal}`, async () => {
  const me = await api('GET', '/auth/me');
  const s = me.sucursales.find((x) => x.codigo === o.sucursal.toUpperCase()) ?? me.sucursales.find((x) => x.predeterminada) ?? me.sucursales[0];
  if (!s) throw new Error('El usuario no tiene sucursales asignadas (ver paso de usuarios_sucursales)');
  sucursalId = s.id;
  return `${me.nombre} → ${s.codigo} "${s.nombre}" (id ${s.id})`;
}))) fin();

// ── 4. Catálogo, existencias e histórico ────────────────────────────────────
let producto = null;
await paso('Productos con existencia', async () => {
  const r = await api('GET', '/productos?limit=200');
  producto = r.data.find((p) => p.activo && Number(p.existencia) >= 1 && Number(p.precioVenta) > 0);
  if (!producto) throw new Error('No hay productos activos con existencia ≥ 1 y precio > 0 en esta sucursal');
  return `${r.meta.total} productos; usaré "${producto.nombre}" (${Q(producto.precioVenta)}, exist. ${Number(producto.existencia)})`;
});

let hoy = null;
await paso('Fecha contable del servidor', async () => {
  hoy = (await api('GET', '/cierres/hoy')).data.fechaContable;
  return hoy;
});

await paso('Reporte de ventas históricas', async () => {
  const r = await api('GET', `/reportes/ventas-por-dia?desde=2000-01-01&hasta=${hoy}`);
  return `${r.data.length} días con ventas, total ${Q(r.totales.total)}, utilidad ${Q(r.totales.utilidad)}`;
});

await paso('Inventario valorizado', async () => {
  const r = await api('GET', '/reportes/inventario-valorizado');
  return `${r.data.length} filas, valor a costo ${Q(r.totales.valorCosto)}`;
});

if (!producto) fin();

// ── 5. Caja: abrir (o reutilizar la de hoy) ─────────────────────────────────
let sesion = null;
if (!(await paso('Abrir caja', async () => {
  const actual = (await api('GET', '/caja/mi-sesion')).data;
  if (actual && actual.fechaContable.slice(0, 10) === hoy) {
    sesion = actual;
    return `reutilizo la sesión abierta #${actual.id} (${actual.caja.nombre})`;
  }
  if (actual) {
    // Sesión de un día anterior: se cierra cuadrada para poder abrir la de hoy
    const conteos = Object.entries(actual.resumen.esperado).map(([medioPago, monto]) => ({ medioPago, montoContado: Math.max(0, Number(monto)) }));
    await api('POST', `/caja/sesiones/${actual.id}/cerrar`, { conteos, observacion: 'Cierre automático de prueba de humo (sesión de día anterior)' });
  }
  const cajas = (await api('GET', '/catalogos/cajas?limit=0')).data;
  if (!cajas.length) throw new Error('La sucursal no tiene cajas');
  const r = await api('POST', '/caja/abrir', { cajaId: cajas[0].id, montoApertura: 100 });
  sesion = r.data;
  return `sesión #${sesion.id} en "${cajas[0].nombre}" con fondo Q100.00`;
}))) fin();

// ── 6. Venta ────────────────────────────────────────────────────────────────
let venta = null;
await paso('Venta de 1 unidad en efectivo', async () => {
  const precio = Number(producto.precioVenta);
  const paga = Math.ceil(precio / 10) * 10 || 10;
  const r = await api('POST', '/ventas', {
    tipo: 'VENTA',
    lineas: [{ productoId: producto.id, cantidad: 1, porcentajeDescuento: 0 }],
    pagos: [{ medioPago: 'EFECTIVO', monto: paga }],
  });
  venta = r.data;
  return `${venta.serie}-${venta.numero} total ${Q(venta.total)}, pagó ${Q(paga)}, cambio ${Q(venta.cambio)}`;
});

if (venta) {
  await paso('Certificación FEL (adaptador de prueba)', async () => {
    await new Promise((r) => setTimeout(r, 1500)); // la certificación corre en segundo plano
    const v = (await api('GET', `/ventas/${venta.id}`)).data;
    if (v.felEstado !== 'CERTIFICADO') throw new Error(`estado FEL: ${v.felEstado} ${v.felMensaje ?? ''}`);
    return `UUID ${v.felUuid}`;
  });

  await paso('Existencia descontada por el kardex', async () => {
    const r = await api('GET', `/inventario/kardex/${producto.id}`);
    const mov = r.data.find((m) => m.tipo === 'SALIDA_VENTA' && m.documentoId === venta.id);
    if (!mov) throw new Error('no se encontró el movimiento SALIDA_VENTA');
    return `salida ${Number(mov.cantidad)}, saldo ${Number(mov.saldoCantidad)}, costo ${Q(mov.costoUnitario)}`;
  });
}

// ── 7. Cuadre y cierre de caja ──────────────────────────────────────────────
await paso('Cuadre y cierre de caja', async () => {
  const resumen = (await api('GET', `/caja/sesiones/${sesion.id}/resumen`)).data;
  const conteos = Object.entries(resumen.esperado).map(([medioPago, monto]) => ({ medioPago, montoContado: Number(monto) }));
  const r = await api('POST', `/caja/sesiones/${sesion.id}/cerrar`, { conteos });
  return `esperado ${Q(resumen.totalEsperado)} → ${r.message}`;
});

// ── 8. Cierre del día ───────────────────────────────────────────────────────
await paso('Pre-cierre del día', async () => {
  const p = (await api('GET', `/cierres/${hoy}/preview`)).data;
  return `${p.puedeCerrar ? 'listo para cerrar' : 'bloqueado: ' + p.bloqueos.join('; ')} — ventas ${Q(p.resumen.ventasTotal)}, utilidad ${Q(p.resumen.utilidadBruta)}`;
});

if (o['cerrar-dia']) {
  await paso('Cierre del día', async () => (await api('POST', `/cierres/${hoy}`, { observacion: 'Prueba de humo' })).message);
}

fin();
