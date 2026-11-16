/**
 * ═════════════════════════════════════════════════════════════════════════════
 *  ETL SPVI 1.x (SQL Server, una BD por sucursal)  ──►  SPVI 2.0 (PostgreSQL)
 * ═════════════════════════════════════════════════════════════════════════════
 *  Una ejecución POR SUCURSAL. IDEMPOTENTE (legacyId = "<COD>:<tabla>:<id>"):
 *  re-ejecutarlo no duplica datos.
 *
 *  Fuente CSV (sin conexión — exportados con exportar-legado.ps1):
 *    npm run etl:sucursal -- --codigo PIL --nombre "El Pilar" --csv ~/export-PIL [--seco]
 *
 *  Fuente SQL Server (conexión directa):
 *    LEGACY_MSSQL="Server=host,1433;Database=dbCSRUSElPilar;User Id=etl_ro;Password=...;Encrypt=false;TrustServerCertificate=true" \
 *    npm run etl:sucursal -- --codigo PIL --nombre "El Pilar" [--seco]
 *
 *  --seco          : solo lee el origen y muestra conteos (no escribe)
 *  --sin-historico : no migra ventas/compras históricas
 *  --corte         : DÍA DEL CAMBIO. Iguala inventario y precios a los del sistema anterior (con un ajuste
 *                    "CORTE_MIGRACION" visible en el kárdex). Se niega si la sucursal ya tiene ventas o movimientos
 *                    hechos en SPVI 2.0 (los borraría); --forzar solo si esos movimientos eran pruebas.
 *  Siempre deja un ACTA (acta-migracion-<COD>-<fecha>.md) con la comparación origen ↔ destino y su veredicto.
 *
 *  Decisiones (validar con negocio — ver docs/05-migracion-de-datos.md):
 *   • Catálogos unificados por NOMBRE entre sucursales.
 *   • Productos unificados por código de barras, luego por CodigoProducto.
 *   • Costo inicial = promedio ponderado de todas las compras del producto.
 *   • Contraseñas legadas: si vienen, se HASHEAN con Argon2 y se fuerza cambio;
 *     si no vienen (export sin -IncluirPasswords), contraseña aleatoria => reset por admin.
 *   • Ventas históricas sin medio de pago en el legado => se asumen EFECTIVO.
 *   • El histórico NO genera kardex: el inventario arranca con INVENTARIO_INICIAL.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { armarActa, cambiosDeProducto, compararMeses, diferenciasInventario, Mes, veredicto } from './corte.logica';
import { Fila, Fuente, FuenteCsv, FuenteMssql } from './fuentes';

const { values: args } = parseArgs({
  options: {
    codigo: { type: 'string' },
    nombre: { type: 'string' },
    csv: { type: 'string' },
    'sin-historico': { type: 'boolean', default: false },
    seco: { type: 'boolean', default: false },
    corte: { type: 'boolean', default: false },
    forzar: { type: 'boolean', default: false },
  },
});
if (!args.codigo || !args.nombre || (!args.csv && !process.env.LEGACY_MSSQL)) {
  console.error('Uso:\n  npm run etl:sucursal -- --codigo PIL --nombre "El Pilar" --csv <carpeta> [--seco] [--sin-historico]\n' +
    '  o defina LEGACY_MSSQL para leer directo de SQL Server.');
  process.exit(1);
}

const COD = args.codigo.toUpperCase();
const L = (tabla: string, id: number | string) => `${COD}:${tabla}:${id}`;
const pg = new PrismaClient();
const D = (v: unknown) => new Prisma.Decimal(v == null || v === '' ? 0 : String(v));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const fecha = (d: Date) => new Date(`${ymd(d)}T00:00:00.000Z`);
const limpio = (s: unknown) => (s == null ? null : String(s).trim().replace(/\s+/g, ' ') || null);
const vivo = (r: Fila, campo = 'EstadoEliminado') => r[campo] !== true; // null/false => vigente
const AVISOS: string[] = []; // todo lo que empieza con ⚠ también va al acta
const log = (...m: unknown[]) => { const t = m.map(String).join(' '); if (t.includes('⚠')) AVISOS.push(t); console.log(`[${COD}]`, ...m); };
let montoOmitido = D(0);
let productosActualizados = 0;
let preciosCambiados = 0;
let existenciasAjustadas = 0;

interface Legado {
  tipos: Fila[]; grupos: Fila[]; genericos: Fila[]; marcas: Fila[]; presentaciones: Fila[]; productos: Fila[];
  stock: Map<number, Prisma.Decimal>; costos: Map<number, Prisma.Decimal>;
  personas: Fila[]; roles: Fila[]; rolPersona: Fila[]; identificaciones: Fila[]; proveedores: Fila[]; descuentos: Fila[];
  ventas: Fila[]; detallesVenta: Fila[]; ingresos: Fila[]; detallesIngreso: Fila[];
  geo: { departamentos: Fila[]; municipios: Fila[]; colonias: Fila[]; direcciones: Fila[] };
}

/** Extrae y prepara el origen (mismos filtros que usaba la aplicación vieja). */
async function extraer(f: Fuente): Promise<Legado> {
  log(`Leyendo ${f.descripcion}…`);
  const t = (n: string) => f.tabla(n);
  const [tipos, grupos, genericos, marcas, presentaciones, productos, stockRaw, ingresos, detIng,
    personas, roles, rolPersona, idPersona, tiposId, proveedores, descuentos, ventas, detVenta] = await Promise.all([
    t('TTipoProducto'), t('TGrupo'), t('TNombreGenerico'), t('TMarcaProducto'), t('TPresentacion'), t('TProducto'),
    t('TStock'), t('TIngreso'), t('TDetalleIngreso'), t('TPersona'), t('TRol'), t('TRolPersona'),
    t('TIdentificacionPersona'), t('TTipoIdentificacion'), t('TProveedor'), t('TDescuento'), t('TVenta'), t('TDetalleVenta'),
  ]);

  // Geografía y direcciones: opcionales (exportaciones anteriores no las incluyen)
  const opcional = async (n: string) => { try { return await t(n); } catch { log(`(sin ${n}: se omiten las direcciones)`); return [] as Fila[]; } };
  const [geoDeptos, geoMunis, geoColonias, geoDirecciones] = await Promise.all([opcional('TDepartamento'), opcional('TMunicipio'), opcional('TColonia'), opcional('TDireccion')]);

  const stock = new Map<number, Prisma.Decimal>();
  for (const s of stockRaw.filter((r) => vivo(r))) stock.set(s.IdProducto, (stock.get(s.IdProducto) ?? D(0)).plus(D(s.Stock)));

  // Costo promedio ponderado de compras vigentes (el sistema viejo usaba un "último costo" no determinístico)
  const ingresosVivos = new Set(ingresos.filter((r) => vivo(r)).map((r) => r.IdIngreso));
  const acumulado = new Map<number, { valor: Prisma.Decimal; cantidad: Prisma.Decimal }>();
  for (const d of detIng.filter((r) => vivo(r) && ingresosVivos.has(r.IdIngreso))) {
    const a = acumulado.get(d.IdProducto) ?? { valor: D(0), cantidad: D(0) };
    acumulado.set(d.IdProducto, { valor: a.valor.plus(D(d.PrecioCompra).times(D(d.CantidadIngreso))), cantidad: a.cantidad.plus(D(d.CantidadIngreso)) });
  }
  const costos = new Map<number, Prisma.Decimal>();
  for (const [id, a] of acumulado) {
    if (!a.cantidad.gt(0)) continue;
    const costo = a.valor.div(a.cantidad).toDecimalPlaces(4);
    if (costo.gte(0)) costos.set(id, costo); // costos negativos del legado => sin costo (se corrige con compras nuevas)
  }

  const nombreTipoId = new Map(tiposId.map((r) => [r.IdTipoIdentificacion, String(r.TipoIdentificacion ?? '')]));
  const identificaciones = idPersona.filter((r) => vivo(r)).map((r) => ({ ...r, TipoIdentificacion: nombreTipoId.get(r.IdTipoIdentificacion) ?? '' }));

  return {
    tipos: tipos.filter((r) => vivo(r, 'Eliminado')),
    grupos: grupos.filter((r) => vivo(r, 'Eliminado')),
    genericos: genericos.filter((r) => vivo(r)),
    marcas: marcas.filter((r) => vivo(r)),
    presentaciones: presentaciones.filter((r) => vivo(r)),
    productos, // TODOS: los eliminados se migran como INACTIVOS para no perder existencias ni historial
    stock, costos, personas,
    roles: roles.filter((r) => vivo(r)),
    rolPersona: rolPersona.filter((r) => vivo(r)),
    identificaciones,
    proveedores: proveedores.filter((r) => vivo(r)),
    descuentos: descuentos.filter((r) => vivo(r)),
    ventas: [...ventas].sort((a, b) => a.IdVenta - b.IdVenta),
    detallesVenta: detVenta.filter((r) => vivo(r)),
    ingresos: ingresos.filter((r) => vivo(r)),
    detallesIngreso: detIng.filter((r) => vivo(r)),
    geo: {
      departamentos: geoDeptos, municipios: geoMunis, colonias: geoColonias,
      // la más reciente primero: si una persona tiene varias, gana la última registrada
      direcciones: geoDirecciones.filter((r) => vivo(r)).sort((a, b) => String(b.FechaInserto ?? '').localeCompare(String(a.FechaInserto ?? ''))),
    },
  };
}

/** Normaliza nombres de lugares para compararlos: sin tildes, minúsculas, sin "ciudad de". */
const normLugar = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\bciudad de\b/g, '').replace(/\s+/g, ' ').trim();
/** Primer campo de nombre de una fila del legado (NombreMunicipio, Nombre, Descripcion…). */
const nombreDe = (r: Fila) => { const k = Object.keys(r).find((c) => /^nombre/i.test(c) || /^descripcion/i.test(c)); return k ? limpio(r[k]) : null; };
/** Texto de relleno del sistema viejo que no es una dirección real. */
const esRelleno = (s: string | null) => !s || /^(n\/?a|na|ninguna|sin direccion|-+|\.+|ciudad)$/i.test(s.trim());

/**
 * DIRECCIONES: TDireccion (texto) + TColonia → TMunicipio → TDepartamento.
 * El municipio del legado se enlaza con el catálogo oficial por nombre (sin tildes).
 * Idempotente y conservador: solo completa campos vacíos (no pisa ediciones hechas en SPVI 2.0).
 */
async function migrarDirecciones(lg: Legado, mapa: { tercero: Map<number, number>; prov: Map<number, number> }, sucursalId: number) {
  const { departamentos, municipios, colonias, direcciones } = lg.geo;
  if (!direcciones.length) return;

  const oficiales = await pg.municipio.findMany({ select: { id: true, nombre: true, departamento: { select: { nombre: true } } } });
  if (!oficiales.length) log('⚠ El catálogo de municipios está vacío: ejecute el seed antes de migrar para enlazar municipios');
  const porDeptoYNombre = new Map(oficiales.map((m) => [`${normLugar(m.departamento.nombre)}|${normLugar(m.nombre)}`, m.id]));
  const porNombre = new Map<string, number[]>();
  for (const m of oficiales) porNombre.set(normLugar(m.nombre), [...(porNombre.get(normLugar(m.nombre)) ?? []), m.id]);

  const deptoLegado = new Map(departamentos.map((d) => [d.IdDepartamento, nombreDe(d)]));
  const muniLegado = new Map<number, number | null>(); // IdMunicipio legado → municipio oficial
  for (const m of municipios) {
    const nombre = normLugar(nombreDe(m));
    const depto = normLugar(deptoLegado.get(m.IdDepartamento));
    const unico = porNombre.get(nombre);
    muniLegado.set(m.IdMunicipio, porDeptoYNombre.get(`${depto}|${nombre}`) ?? (unico?.length === 1 ? unico[0] : null));
  }
  const muniDeColonia = new Map(colonias.map((c) => [c.IdColonia, muniLegado.get(c.IdMunicipio) ?? null]));

  let aplicadas = 0, conMunicipio = 0, sinMunicipio = 0;
  const vistos = new Set<string>();
  for (const d of direcciones) {
    const texto = esRelleno(limpio(d.Direccion)) ? null : limpio(d.Direccion)!.slice(0, 250);
    const municipioId = d.IdColonia != null ? muniDeColonia.get(d.IdColonia) ?? null : null;
    if (!texto && !municipioId) continue;

    const terceroId = d.IdPersona != null ? mapa.tercero.get(d.IdPersona) : d.IdProveedor != null ? mapa.prov.get(d.IdProveedor) : undefined;
    const clave = terceroId ? `T${terceroId}` : d.IdSucursal != null ? 'S' : null;
    if (!clave || vistos.has(clave)) continue; // la más reciente ya se aplicó
    vistos.add(clave);

    const actual = terceroId
      ? await pg.tercero.findUnique({ where: { id: terceroId }, select: { direccion: true, municipioId: true } })
      : await pg.sucursal.findUnique({ where: { id: sucursalId }, select: { direccion: true, municipioId: true } });
    if (!actual) continue;
    const data: { direccion?: string; municipioId?: number } = {};
    if (texto && !actual.direccion) data.direccion = texto;
    if (municipioId && !actual.municipioId) data.municipioId = municipioId;
    if (!Object.keys(data).length) continue;
    if (!args.seco) {
      if (terceroId) await pg.tercero.update({ where: { id: terceroId }, data });
      else await pg.sucursal.update({ where: { id: sucursalId }, data });
    }
    aplicadas++;
    if (municipioId) conMunicipio++; else sinMunicipio++;
  }
  log(`Direcciones OK (${aplicadas} completadas: ${conMunicipio} con municipio, ${sinMunicipio} solo con texto)`);
}

async function main() {
  const fuente: Fuente = args.csv ? new FuenteCsv(args.csv.replace(/^~/, homedir())) : new FuenteMssql(process.env.LEGACY_MSSQL!);
  const lg = await extraer(fuente);
  await fuente.cerrar();
  log(`productos=${lg.productos.length} existencias=${lg.stock.size} personas=${lg.personas.length} proveedores=${lg.proveedores.length} ventas=${lg.ventas.length}`);

  if (args.seco) {
    reconciliarOrigen(lg);
    return;
  }
  if (args.corte) await protegerCorte();

  // ── 1. ESTRUCTURA ──────────────────────────────────────────────────────────
  const empresa = await pg.empresa.findFirstOrThrow({ orderBy: { id: 'asc' } }); // creada por el seed
  const sucursal = await pg.sucursal.upsert({ where: { codigo: COD }, create: { empresaId: empresa.id, codigo: COD, nombre: args.nombre! }, update: {} });
  const bodega = await pg.bodega.upsert({
    where: { sucursalId_nombre: { sucursalId: sucursal.id, nombre: 'Principal' } },
    create: { sucursalId: sucursal.id, nombre: 'Principal', esPrincipal: true }, update: {},
  });
  await pg.caja.upsert({ where: { sucursalId_nombre: { sucursalId: sucursal.id, nombre: 'Caja 1' } }, create: { sucursalId: sucursal.id, nombre: 'Caja 1' }, update: {} });
  for (const [tipo, serie] of [['VENTA', `V-${COD}`], ['COTIZACION', `C-${COD}`], ['DEVOLUCION', `D-${COD}`]]) {
    await pg.secuenciaDocumento.upsert({ where: { sucursalId_tipo_serie: { sucursalId: sucursal.id, tipo, serie } }, create: { sucursalId: sucursal.id, tipo, serie }, update: {} });
  }

  // ── 2. CATÁLOGOS (unificados por nombre) ───────────────────────────────────
  const mapa = {
    cat: new Map<number, number>(), grupo: new Map<number, number>(), sub: new Map<number, number>(), marca: new Map<number, number>(),
    pres: new Map<number, number>(), prod: new Map<number, number>(), tercero: new Map<number, number>(), prov: new Map<number, number>(),
    usuario: new Map<number, number>(), rol: new Map<number, number>(),
  };
  const catGeneral = await pg.categoria.upsert({ where: { nombre: 'GENERAL' }, create: { nombre: 'GENERAL' }, update: {} });
  const grupoGeneral = await pg.grupo.upsert({ where: { categoriaId_nombre: { categoriaId: catGeneral.id, nombre: 'GENERAL' } }, create: { categoriaId: catGeneral.id, nombre: 'GENERAL' }, update: {} });
  const subGeneral = await pg.subgrupo.upsert({ where: { grupoId_nombre: { grupoId: grupoGeneral.id, nombre: 'GENERAL' } }, create: { grupoId: grupoGeneral.id, nombre: 'GENERAL' }, update: {} });
  const presUnidad = await pg.presentacion.upsert({ where: { nombre: 'Unidad' }, create: { nombre: 'Unidad', abreviatura: 'UNI' }, update: {} });

  for (const r of lg.tipos) {
    const nombre = (limpio(r.NombreTipoProducto) ?? `TIPO ${r.IdTipoProducto}`).toUpperCase();
    mapa.cat.set(r.IdTipoProducto, (await pg.categoria.upsert({ where: { nombre }, create: { nombre }, update: {} })).id);
  }
  for (const r of lg.grupos) {
    const categoriaId = mapa.cat.get(r.IdTipoProducto) ?? catGeneral.id;
    const nombre = (limpio(r.NombreGrupo) ?? `GRUPO ${r.IdGrupo}`).toUpperCase();
    mapa.grupo.set(r.IdGrupo, (await pg.grupo.upsert({ where: { categoriaId_nombre: { categoriaId, nombre } }, create: { categoriaId, nombre }, update: {} })).id);
  }
  for (const r of lg.genericos) {
    const grupoId = mapa.grupo.get(r.IdGrupo) ?? grupoGeneral.id;
    const nombre = (limpio(r.NombreGenerico) ?? `SUBGRUPO ${r.IdNombreGenerico}`).toUpperCase();
    mapa.sub.set(r.IdNombreGenerico, (await pg.subgrupo.upsert({ where: { grupoId_nombre: { grupoId, nombre } }, create: { grupoId, nombre }, update: {} })).id);
  }
  for (const r of lg.marcas) {
    const nombre = (limpio(r.Marca) ?? `MARCA ${r.IdMarcaProducto}`).toUpperCase();
    mapa.marca.set(r.IdMarcaProducto, (await pg.marca.upsert({ where: { nombre }, create: { nombre }, update: {} })).id);
  }
  for (const r of lg.presentaciones) {
    const nombre = limpio(r.TipoPresentacion) ?? `PRESENTACIÓN ${r.IdPresentacion}`;
    mapa.pres.set(r.IdPresentacion, (await pg.presentacion.upsert({ where: { nombre }, create: { nombre }, update: {} })).id);
  }
  log(`Catálogos OK (categorías ${mapa.cat.size}, grupos ${mapa.grupo.size}, subgrupos ${mapa.sub.size}, marcas ${mapa.marca.size})`);

  // ── 3. PRODUCTOS ───────────────────────────────────────────────────────────
  let nuevos = 0;
  for (const p of lg.productos) {
    const legacyId = L('TProducto', p.IdProducto);
    const barra = limpio(p.CodigoBarra);
    const sku = (limpio(p.CodigoProducto) ?? `${COD}-${p.IdProducto}`).toUpperCase();
    const existente =
      (await pg.producto.findUnique({ where: { legacyId } })) ??
      (barra ? await pg.producto.findUnique({ where: { codigoBarra: barra } }) : null) ??
      (await pg.producto.findUnique({ where: { sku } }));
    if (existente) {
      mapa.prod.set(p.IdProducto, existente.id);
      // Día del cambio: precio, nombre y estado tal como están HOY en el sistema anterior (solo productos de esta sucursal)
      if (args.corte && existente.legacyId === legacyId) {
        const cambios = cambiosDeProducto(
          { precioVenta: Number(existente.precioVenta), nombre: existente.nombre, activo: existente.activo },
          { precioVenta: Number(D(p.PrecioProducto)), nombre: limpio(p.NombreProducto), activo: vivo(p) && p.EstadoActivo !== false },
        );
        if (Object.keys(cambios).length) {
          await pg.producto.update({ where: { id: existente.id }, data: { ...cambios, ...(cambios.precioVenta !== undefined ? { precioVenta: D(cambios.precioVenta) } : {}) } });
          productosActualizados++;
          if (cambios.precioVenta !== undefined) preciosCambiados++;
        }
      }
      continue;
    }
    const creado = await pg.producto.create({
      data: {
        legacyId, sku, codigoBarra: barra, codigoProveedor: limpio(p.CodigoProductoProveedor),
        nombre: limpio(p.NombreProducto) ?? sku, descripcion: limpio(p.DescripcionProducto),
        subgrupoId: mapa.sub.get(p.IdNombreGenerico) ?? subGeneral.id,
        marcaId: mapa.marca.get(p.IdMarcaProducto) ?? null,
        presentacionId: mapa.pres.get(p.IdPresentacion) ?? presUnidad.id,
        precioVenta: D(p.PrecioProducto), activo: vivo(p) && p.EstadoActivo !== false,
      },
    });
    mapa.prod.set(p.IdProducto, creado.id);
    nuevos++;
  }
  const eliminados = lg.productos.filter((p) => !vivo(p)).length;
  log(`Productos OK (${nuevos} nuevos, ${lg.productos.length - nuevos} unificados con existentes; ${eliminados} eliminados en el legado => INACTIVOS)`);

  // ── 4. ROLES, PERSONAS (clientes/usuarios) Y PROVEEDORES ───────────────────
  for (const r of lg.roles) {
    const nombre = `LEGADO_${String(r.Rol ?? r.IdRol).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '_')}`.slice(0, 40);
    mapa.rol.set(r.IdRol, (await pg.rol.upsert({ where: { nombre }, create: { nombre, descripcion: `Migrado de ${COD}. Asigne permisos.` }, update: {} })).id);
  }
  const rolesDe = new Map<number, number[]>();
  for (const rp of lg.rolPersona) rolesDe.set(rp.IdPersona, [...(rolesDe.get(rp.IdPersona) ?? []), rp.IdRol]);

  const idsDe = new Map<number, { nit?: string; cui?: string }>();
  for (const i of lg.identificaciones) {
    const tipo = String(i.TipoIdentificacion).toUpperCase();
    const numero = String(i.NumeroIdentificacion ?? '').replace(/[\s-]/g, '').toUpperCase();
    const actual = idsDe.get(i.IdPersona) ?? {};
    if (tipo.includes('NIT')) actual.nit = numero;
    else if (tipo.includes('DPI') || tipo.includes('CUI')) actual.cui = numero;
    idsDe.set(i.IdPersona, actual);
  }

  const usuarioHistorico = await pg.usuario.upsert({
    where: { username: `historico.${COD.toLowerCase()}` },
    create: { username: `historico.${COD.toLowerCase()}`, nombre: `Histórico ${args.nombre}`, passwordHash: await argon2.hash(randomUUID()), activo: false },
    update: {},
  });
  const cf = await pg.tercero.findFirstOrThrow({ where: { nit: 'CF' }, orderBy: { id: 'asc' } });
  const sinPassword: string[] = [];

  for (const p of lg.personas) {
    const ids = idsDe.get(p.IdPersona) ?? {};
    const parte = (v: unknown) => { const x = limpio(v); return x && x.toUpperCase() !== 'NA' ? x : null; };
    const nombres = [parte(p.PrimerNombre), parte(p.SegundoNombre), parte(p.TercerNombre)].filter(Boolean).join(' ') || null;
    const apellidos = [parte(p.PrimerApellido), parte(p.SegundoApellido)].filter(Boolean).join(' ') || null;

    if (ids.nit === 'CF' || (!nombres && !apellidos)) {
      mapa.tercero.set(p.IdPersona, cf.id);
    } else {
      const t = await pg.tercero.upsert({
        where: { legacyId: L('TPersona', p.IdPersona) },
        create: {
          legacyId: L('TPersona', p.IdPersona), nombres, apellidos, nit: ids.nit || 'CF',
          cui: ids.cui && /^\d{13}$/.test(ids.cui) ? ids.cui : null, esCliente: true, activo: p.EstadoActivo !== false,
        },
        update: {},
      });
      mapa.tercero.set(p.IdPersona, t.id);
    }

    const nick = limpio(p.NickName)?.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (nick && nick !== 'na') {
      const username = `${nick}.${COD.toLowerCase()}`; // evita choques entre sucursales
      const tienePassword = Boolean(limpio(p.Passwd));
      if (!tienePassword) sinPassword.push(username);
      const u = await pg.usuario.upsert({
        where: { username },
        create: {
          username, nombre: [nombres, apellidos].filter(Boolean).join(' ') || nick,
          passwordHash: await argon2.hash(tienePassword ? String(p.Passwd) : randomUUID(), { type: argon2.argon2id }),
          debeCambiarPassword: true, activo: p.EstadoActivo !== false,
          sucursales: { create: [{ sucursalId: sucursal.id, predeterminada: true }] },
        },
        update: {},
      });
      for (const idRol of rolesDe.get(p.IdPersona) ?? []) {
        const rolId = mapa.rol.get(idRol);
        if (rolId) await pg.usuarioRol.upsert({ where: { usuarioId_rolId: { usuarioId: u.id, rolId } }, create: { usuarioId: u.id, rolId }, update: {} });
      }
      mapa.usuario.set(p.IdPersona, u.id);
    }
  }

  for (const pr of lg.proveedores) {
    const nit = String(pr.NITProveedor ?? '').replace(/[\s-]/g, '').toUpperCase() || null;
    const existente = nit ? await pg.tercero.findFirst({ where: { nit, esProveedor: true } }) : null;
    const t = existente ?? (await pg.tercero.upsert({
      where: { legacyId: L('TProveedor', pr.IdProveedor) },
      create: {
        legacyId: L('TProveedor', pr.IdProveedor), tipo: 'EMPRESA', razonSocial: limpio(pr.NombreProveedor) ?? `PROVEEDOR ${pr.IdProveedor}`,
        nit, esProveedor: true, esCliente: false, activo: pr.EstadoActivo !== false,
      },
      update: {},
    }));
    mapa.prov.set(pr.IdProveedor, t.id);
  }
  log(`Terceros OK (clientes ${mapa.tercero.size}, usuarios ${mapa.usuario.size}, proveedores ${mapa.prov.size})`);
  await migrarDirecciones(lg, mapa, sucursal.id);

  // ── 5. POLÍTICAS DE DESCUENTO ──────────────────────────────────────────────
  let politicas = 0;
  const invalidas: string[] = [];
  for (const d of lg.descuentos) {
    const rolId = mapa.rol.get(d.IdRol);
    const productoId = mapa.prod.get(d.IdProducto);
    if (!rolId || !productoId) continue;
    // El legado no validaba el rango: un 220 % habría generado precios negativos en caja
    const pct = D(d.PorcentajeDescuento);
    if (pct.lt(0) || pct.gt(100)) {
      invalidas.push(`IdProducto ${d.IdProducto} (rol ${d.IdRol}): ${pct.toFixed(2)}%`);
      continue;
    }
    if (await pg.politicaDescuento.findFirst({ where: { rolId, productoId } })) continue;
    await pg.politicaDescuento.create({
      data: { rolId, productoId, porcentajeMax: D(d.PorcentajeDescuento), cantidadMaxima: d.CantidadMaxima ? D(d.CantidadMaxima) : null, activo: d.EstadoActivo !== false },
    });
    politicas++;
  }
  log(`Políticas de descuento: ${politicas}`);
  if (invalidas.length) {
    log(`⚠ ${invalidas.length} descuentos con porcentaje fuera de 0–100 % — NO migrados (corrija en Políticas de descuento):`);
    invalidas.slice(0, 20).forEach((x) => console.log(`   ${x}`));
    if (invalidas.length > 20) console.log(`   … y ${invalidas.length - 20} más`);
  }

  // ── 6. INVENTARIO INICIAL ──────────────────────────────────────────────────
  const admin = await pg.usuario.findUniqueOrThrow({ where: { username: 'admin' } });
  let ajuste = await pg.ajuste.findFirst({ where: { bodegaId: bodega.id, motivo: 'INVENTARIO_INICIAL' } });
  ajuste ??= await pg.ajuste.create({ data: { bodegaId: bodega.id, motivo: 'INVENTARIO_INICIAL', observacion: `Migración ${COD}`, usuarioId: admin.id, estado: 'CONFIRMADO' } });
  let cargados = 0;
  let negativos = 0;
  let deEliminados = 0;
  const eliminadosIds = new Set(lg.productos.filter((p) => !vivo(p)).map((p) => p.IdProducto as number));
  let sinProducto = 0;
  for (const [idLegado, cantidad] of lg.stock) {
    const productoId = mapa.prod.get(idLegado);
    if (cantidad.isZero()) continue;
    if (!productoId) { sinProducto++; continue; } // TStock apunta a un producto que no existe en TProducto
    if (await pg.existencia.findUnique({ where: { productoId_bodegaId: { productoId, bodegaId: bodega.id } } })) continue;
    if (eliminadosIds.has(idLegado)) deEliminados++;
    const costo = lg.costos.get(idLegado) ?? D(0);
    if (cantidad.isNegative()) negativos++;
    await pg.$transaction([
      pg.existencia.create({ data: { productoId, bodegaId: bodega.id, cantidad, costoPromedio: costo } }),
      pg.movimientoInventario.create({
        data: {
          bodegaId: bodega.id, productoId, tipo: 'INVENTARIO_INICIAL', cantidad, costoUnitario: costo, saldoCantidad: cantidad,
          saldoCostoPromedio: costo, documentoTipo: 'INICIAL', documentoId: ajuste.id, usuarioId: admin.id,
          observacion: cantidad.isNegative() ? 'SALDO NEGATIVO EN LEGADO — corregir con conteo físico' : 'Saldo migrado',
        },
      }),
    ]);
    cargados++;
  }
  if (args.corte) await igualarInventario(lg, mapa.prod, bodega.id, admin.id);
  log(`Existencias iniciales: ${cargados}${negativos ? ` (⚠ ${negativos} negativas)` : ''}` +
    `${deEliminados ? ` (⚠ ${deEliminados} de productos eliminados en el legado, quedan en productos INACTIVOS)` : ''}` +
    `${sinProducto ? ` (⚠ ${sinProducto} filas de TStock sin producto en TProducto — omitidas)` : ''}`);

  // ── 7. HISTÓRICO ───────────────────────────────────────────────────────────
  if (!args['sin-historico']) await migrarHistorico(lg, { sucursalId: sucursal.id, bodegaId: bodega.id, cfId: cf.id, usuarioHistoricoId: usuarioHistorico.id, mapa });

  reconciliarOrigen(lg);
  await reconciliarDestino(sucursal.id);
  await escribirActa(lg, mapa.prod, sucursal.id, bodega.id);
  if (sinPassword.length) {
    log(`⚠ ${sinPassword.length} usuario(s) migrados SIN contraseña. Restablézcala desde Seguridad > Usuarios:`);
    console.log('   ' + sinPassword.join(', '));
  }
}

async function migrarHistorico(
  lg: Legado,
  c: { sucursalId: number; bodegaId: number; cfId: number; usuarioHistoricoId: number; mapa: Record<string, Map<number, number>> },
) {
  const detallesPor = new Map<number, Fila[]>();
  for (const d of lg.detallesVenta) detallesPor.set(d.IdVenta, [...(detallesPor.get(d.IdVenta) ?? []), d]);

  let n = 0;
  let omitidas = 0;
  let lineasHuerfanas = 0;
  let lineasSinCantidad = 0;
  let ventasEnCero = 0;
  let montoHuerfano = D(0);
  for (const v of lg.ventas) {
    const legacyId = L('TVenta', v.IdVenta);
    if (await pg.venta.findUnique({ where: { legacyId }, select: { id: true } })) continue;
    const todas = detallesPor.get(v.IdVenta) ?? [];
    const sinCantidad = todas.filter((d) => !D(d.CantidadVenta).gt(0));
    lineasSinCantidad += sinCantidad.length;
    const lineas = todas.filter((d) => c.mapa.prod.has(d.IdProducto) && D(d.CantidadVenta).gt(0));
    for (const h of todas.filter((d) => !c.mapa.prod.has(d.IdProducto) && D(d.CantidadVenta).gt(0))) {
      lineasHuerfanas++;
      montoHuerfano = montoHuerfano.plus(D(h.PrecioVenta).times(D(h.CantidadVenta)));
    }
    if (!lineas.length || !(v.FechaVenta instanceof Date)) { omitidas++; continue; }

    const esVenta = v.VentaCotizacion !== false;
    const det = lineas.map((d) => {
      const cantidad = D(d.CantidadVenta);
      const precioUnitario = D(d.PrecioVenta);
      const precioLista = d.PrecioProducto != null ? D(d.PrecioProducto) : precioUnitario;
      return {
        productoId: c.mapa.prod.get(d.IdProducto)!, descripcion: `Producto legado ${d.IdProducto}`, cantidad, precioLista,
        porcentajeDescuento: D(d.PorcentajeDescuento), descuento: precioLista.minus(precioUnitario).times(cantidad).toDecimalPlaces(2),
        precioUnitario, subtotal: precioUnitario.times(cantidad).toDecimalPlaces(2), costoUnitario: lg.costos.get(d.IdProducto) ?? D(0),
      };
    });
    const total = det.reduce((a, d) => a.plus(d.subtotal), D(0));
    const anulada = v.EstadoEliminado === true;
    if (!total.gt(0)) ventasEnCero++;
    await pg.venta.create({
      data: {
        legacyId, sucursalId: c.sucursalId, bodegaId: c.bodegaId, tipo: esVenta ? 'VENTA' : 'COTIZACION',
        estado: anulada ? 'ANULADA' : esVenta ? 'CONFIRMADA' : 'VENCIDA',
        serie: 'HIST', numero: v.IdVenta, fecha: v.FechaVenta, fechaContable: fecha(v.FechaVenta),
        clienteId: c.mapa.tercero.get(v.IdCliente) ?? c.cfId, vendedorId: c.mapa.usuario.get(v.IdEmpleado) ?? c.usuarioHistoricoId,
        subtotal: det.reduce((a, d) => a.plus(d.precioLista.times(d.cantidad)), D(0)).toDecimalPlaces(2),
        descuentoTotal: det.reduce((a, d) => a.plus(d.descuento), D(0)), total,
        costoTotal: det.reduce((a, d) => a.plus(d.costoUnitario.times(d.cantidad)), D(0)).toDecimalPlaces(2),
        felEstado: 'NO_APLICA', observaciones: `Legado ${COD}: factura ${v.SerieFactura ?? ''}-${v.NumeroFactura ?? ''}`.slice(0, 500),
        detalles: { create: det },
        // Ventas en Q0 o negativas en el legado: sin pago (el pago debe ser > 0)
        pagos: esVenta && !anulada && total.gt(0) ? { create: [{ medioPago: 'EFECTIVO', monto: total, referencia: 'Supuesto ETL' }] } : undefined,
      },
    });
    if (++n % 500 === 0) log(`  ventas históricas: ${n}…`);
  }
  log(`Ventas históricas: ${n} migradas, ${omitidas} omitidas (sin detalle válido o sin fecha)`);
  if (ventasEnCero) log(`⚠ ${ventasEnCero} ventas con total Q0 o negativo en el legado — migradas sin pago`);
  if (lineasSinCantidad) log(`⚠ ${lineasSinCantidad} líneas de venta con cantidad 0 o negativa — omitidas`);
  montoOmitido = montoHuerfano;
  if (lineasHuerfanas) log(`⚠ ${lineasHuerfanas} líneas de venta apuntan a productos inexistentes en TProducto (Q${montoHuerfano.toFixed(2)}) — no migradas`);

  const detIngPor = new Map<number, Fila[]>();
  for (const d of lg.detallesIngreso) detIngPor.set(d.IdIngreso, [...(detIngPor.get(d.IdIngreso) ?? []), d]);
  let m = 0;
  for (const i of lg.ingresos) {
    const legacyId = L('TIngreso', i.IdIngreso);
    if (await pg.compra.findUnique({ where: { legacyId }, select: { id: true } })) continue;
    const proveedorId = c.mapa.prov.get(i.IdProveedor);
    const lineas = (detIngPor.get(i.IdIngreso) ?? []).filter((d) => c.mapa.prod.has(d.IdProducto) && D(d.CantidadIngreso).gt(0));
    const fechaIngreso: Date | null = i.FechaIngreso instanceof Date ? i.FechaIngreso : null;
    if (!proveedorId || !lineas.length || !fechaIngreso) continue;
    const det = lineas.map((d) => ({
      productoId: c.mapa.prod.get(d.IdProducto)!, cantidad: D(d.CantidadIngreso), costoUnitario: D(d.PrecioCompra),
      subtotal: D(d.CantidadIngreso).times(D(d.PrecioCompra)).toDecimalPlaces(2),
    }));
    const total = det.reduce((a, d) => a.plus(d.subtotal), D(0));
    const base = {
      legacyId, sucursalId: c.sucursalId, bodegaId: c.bodegaId, proveedorId, serieFactura: limpio(i.SerieFactura) ?? 'S/S',
      fechaFactura: fecha(i.FechaFactura instanceof Date ? i.FechaFactura : fechaIngreso), fechaContable: fecha(fechaIngreso),
      subtotal: total, total, usuarioId: c.usuarioHistoricoId, detalles: { create: det },
    };
    try {
      await pg.compra.create({ data: { ...base, numeroFactura: limpio(i.NumeroFactura) ?? `S/N-${i.IdIngreso}`, observacion: `Legado ${COD}` } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      // Misma factura de proveedor registrada dos veces en el legado
      await pg.compra.create({ data: { ...base, numeroFactura: `${limpio(i.NumeroFactura) ?? 'S/N'}-DUP${i.IdIngreso}`, observacion: `Legado ${COD} — FACTURA DUPLICADA EN ORIGEN, revisar` } });
    }
    m++;
  }
  log(`Compras históricas: ${m}`);
}

function reconciliarOrigen(lg: Legado) {
  const ventasVivas = new Set(lg.ventas.filter((v) => v.EstadoEliminado !== true && v.VentaCotizacion !== false).map((v) => v.IdVenta));
  const monto = lg.detallesVenta.filter((d) => ventasVivas.has(d.IdVenta)).reduce((a, d) => a.plus(D(d.PrecioVenta).times(D(d.CantidadVenta))), D(0));
  const unidades = [...lg.stock.values()].reduce((a, s) => a.plus(s), D(0));
  const vigentes = lg.productos.filter((p) => vivo(p)).length;
  const conStockEliminado = [...lg.stock.keys()].filter((id) => lg.productos.some((p) => p.IdProducto === id && !vivo(p))).length;
  console.table([{ fuente: `Legado ${COD}`, productos: `${vigentes} vigentes + ${lg.productos.length - vigentes} eliminados`, unidades: unidades.toNumber(), ventas: ventasVivas.size, montoVentas: monto.toFixed(2) }]);
  if (conStockEliminado) log(`ℹ ${conStockEliminado} productos ELIMINADOS en el legado tienen existencia registrada (se migran como inactivos).`);
}

async function reconciliarDestino(sucursalId: number) {
  const [unidades, ventas, productos] = await Promise.all([
    pg.existencia.aggregate({ where: { bodega: { sucursalId } }, _sum: { cantidad: true } }),
    pg.venta.aggregate({ where: { sucursalId, serie: 'HIST', tipo: 'VENTA', estado: 'CONFIRMADA' }, _count: { _all: true }, _sum: { total: true } }),
    pg.producto.count({ where: { legacyId: { startsWith: `${COD}:` } } }),
  ]);
  console.table([{
    fuente: 'SPVI 2.0', productos: `${productos} (nuevos)`, unidades: Number(unidades._sum.cantidad ?? 0),
    ventas: ventas._count._all, montoVentas: Number(ventas._sum.total ?? 0).toFixed(2),
  }]);
  log('Diferencias esperadas: productos unificados con otra sucursal no cuentan como "nuevos"; ventas sin detalle válido se omiten.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pg.$disconnect());

// ══════════════════════════════ CORTE Y ACTA ══════════════════════════════

/** El corte iguala el inventario al sistema anterior: si en SPVI 2.0 ya se trabajó en esta sucursal, eso se perdería. */
async function protegerCorte() {
  const suc = await pg.sucursal.findUnique({ where: { codigo: COD } });
  if (!suc) return; // primera migración: no hay nada que proteger
  const [ventas, movimientos] = await Promise.all([
    pg.venta.count({ where: { sucursalId: suc.id, NOT: { serie: 'HIST' } } }),
    pg.movimientoInventario.count({ where: { bodega: { sucursalId: suc.id }, tipo: { not: 'INVENTARIO_INICIAL' }, NOT: { observacion: { startsWith: 'Corte de migración' } } } }),
  ]);
  if ((ventas || movimientos) && !args.forzar) {
    console.error(`\n✗ CORTE DETENIDO: la sucursal ${COD} ya tiene ${ventas} ventas y ${movimientos} movimientos de inventario hechos en SPVI 2.0.\n` +
      '  El corte iguala el inventario al sistema anterior y esos movimientos dejarían de cuadrar.\n' +
      '  Si fueron PRUEBAS, repita con --forzar. Si la sucursal ya opera en SPVI 2.0, NO haga el corte.');
    process.exit(2);
  }
  if (ventas || movimientos) log(`⚠ Corte forzado: había ${ventas} ventas y ${movimientos} movimientos hechos en SPVI 2.0 (declarados como pruebas)`);
}

async function igualarInventario(lg: Legado, prod: Map<number, number>, bodegaId: number, usuarioId: number) {
  const legado = new Map<number, number>();
  for (const [idLegado, cantidad] of lg.stock) { const id = prod.get(idLegado); if (id) legado.set(id, (legado.get(id) ?? 0) + cantidad.toNumber()); }
  const existencias = await pg.existencia.findMany({ where: { bodegaId }, select: { productoId: true, cantidad: true, costoPromedio: true } });
  const actual = new Map(existencias.map((e) => [e.productoId, Number(e.cantidad)]));
  const costo = new Map(existencias.map((e) => [e.productoId, e.costoPromedio]));
  const difs = diferenciasInventario(legado, actual);
  if (!difs.length) { log('Corte: el inventario ya era idéntico al del sistema anterior'); return; }
  const ajuste = await pg.ajuste.create({ data: { bodegaId, motivo: 'CORTE_MIGRACION', observacion: `Corte de migración ${COD}: existencias igualadas al sistema anterior`, usuarioId, estado: 'CONFIRMADO' } });
  const idLegadoDe = new Map([...prod].map(([l, n]) => [n, l]));
  for (const f of difs) {
    const c = costo.get(f.productoId) ?? lg.costos.get(idLegadoDe.get(f.productoId) ?? -1) ?? D(0);
    const dif = D(f.diferencia);
    await pg.$transaction([
      pg.existencia.upsert({ where: { productoId_bodegaId: { productoId: f.productoId, bodegaId } }, create: { productoId: f.productoId, bodegaId, cantidad: D(f.legado), costoPromedio: c }, update: { cantidad: D(f.legado) } }),
      pg.movimientoInventario.create({
        data: {
          bodegaId, productoId: f.productoId, tipo: dif.gt(0) ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO', cantidad: dif.abs(), costoUnitario: c,
          saldoCantidad: D(f.legado), saldoCostoPromedio: c, documentoTipo: 'AJUSTE', documentoId: ajuste.id, usuarioId,
          observacion: `Corte de migración: ${f.actual} → ${f.legado} (como en el sistema anterior)`,
        },
      }),
    ]);
    existenciasAjustadas++;
  }
  log(`Corte: ${existenciasAjustadas} existencias igualadas al sistema anterior (ajuste ${ajuste.id})`);
}

async function escribirActa(lg: Legado, prod: Map<number, number>, sucursalId: number, bodegaId: number) {
  const ventasVivas = lg.ventas.filter((v) => v.EstadoEliminado !== true && v.VentaCotizacion !== false);
  const vivasIds = new Set(ventasVivas.map((v) => v.IdVenta));
  const montoPor = new Map<number, number>();
  for (const d of lg.detallesVenta) if (vivasIds.has(d.IdVenta)) montoPor.set(d.IdVenta, (montoPor.get(d.IdVenta) ?? 0) + D(d.PrecioVenta).times(D(d.CantidadVenta)).toNumber());
  const mesesLegado = new Map<string, Mes>();
  for (const v of ventasVivas) {
    if (!(v.FechaVenta instanceof Date)) continue;
    const m = ymd(v.FechaVenta).slice(0, 7); const x = mesesLegado.get(m) ?? { ventas: 0, monto: 0 };
    mesesLegado.set(m, { ventas: x.ventas + 1, monto: x.monto + (montoPor.get(v.IdVenta) ?? 0) });
  }
  const filasDestino = await pg.$queryRaw<{ mes: string; ventas: number; monto: number }[]>`
    SELECT to_char(fecha_contable, 'YYYY-MM') AS mes, COUNT(*)::int AS ventas, COALESCE(SUM(total), 0)::float8 AS monto
    FROM ventas WHERE sucursal_id = ${sucursalId} AND serie = 'HIST' AND tipo = 'VENTA' AND estado = 'CONFIRMADA' GROUP BY 1`;
  const mesesDestino = new Map(filasDestino.map((f) => [f.mes, { ventas: f.ventas, monto: f.monto }]));
  const legadoInv = new Map<number, number>();
  for (const [idLegado, cantidad] of lg.stock) { const id = prod.get(idLegado); if (id) legadoInv.set(id, (legadoInv.get(id) ?? 0) + cantidad.toNumber()); }
  const existencias = await pg.existencia.findMany({ where: { bodegaId }, select: { productoId: true, cantidad: true, costoPromedio: true, producto: { select: { nombre: true } } } });
  const actual = new Map(existencias.map((e) => [e.productoId, Number(e.cantidad)]));
  const nombres = new Map(existencias.map((e) => [e.productoId, e.producto.nombre]));
  // Solo lo migrable: filas de TStock de productos inexistentes en TProducto se omiten (y ya se avisan)
  const valorLegado = [...lg.stock].filter(([id]) => prod.has(id)).reduce((a, [id, c]) => a + c.toNumber() * (lg.costos.get(id)?.toNumber() ?? 0), 0);
  const [compras, productos] = await Promise.all([
    pg.compra.count({ where: { sucursalId, legacyId: { startsWith: `${COD}:` } } }),
    pg.producto.count({ where: { OR: [{ legacyId: { startsWith: `${COD}:` } }, { id: { in: [...new Set(prod.values())] } }], activo: true } }),
  ]);
  const datos = {
    codigo: COD, nombre: args.nombre!, fecha: new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala' }), modo: (args.corte ? 'corte' : 'ensayo') as 'corte' | 'ensayo',
    origen: { productosVigentes: lg.productos.filter((p) => vivo(p) && p.EstadoActivo !== false).length, unidades: [...legadoInv.values()].reduce((a, c) => a + c, 0), valor: valorLegado, ventas: ventasVivas.length, montoVentas: [...montoPor.values()].reduce((a, b) => a + b, 0), compras: lg.ingresos.length },
    destino: { productos, unidades: existencias.reduce((a, e) => a + Number(e.cantidad), 0), valor: existencias.reduce((a, e) => a + Number(e.cantidad) * Number(e.costoPromedio), 0), ventas: filasDestino.reduce((a, f) => a + f.ventas, 0), montoVentas: filasDestino.reduce((a, f) => a + f.monto, 0), compras },
    inventario: { ajustados: existenciasAjustadas, pendientes: diferenciasInventario(legadoInv, actual, nombres) },
    productosActualizados, preciosCambiados, meses: compararMeses(mesesLegado, mesesDestino), montoOmitido: montoOmitido.toNumber(), avisos: AVISOS,
  };
  const archivo = `acta-migracion-${COD}-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(archivo, armarActa(datos), 'utf8');
  const v = veredicto(datos);
  log(`${v.aprobado ? '✔ ACTA APROBADA' : '✗ ACTA NO APROBADA'}: ${archivo}`);
}
