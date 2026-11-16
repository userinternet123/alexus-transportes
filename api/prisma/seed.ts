import { crearBasicosRrhh } from './basicos-rrhh';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Seed idempotente: permisos, roles base, parámetros, empresa/sucursal demo,
 * secuencias, cliente CF y usuario administrador inicial.
 *   npm run db:seed
 * La contraseña del admin se toma de SEED_ADMIN_PASSWORD (obligatoria).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISOS, ROLES_BASE } from '../src/common/auth/permisos.catalogo';
import { PARAMETROS_DEFECTO } from '../src/common/parametros/parametros.service';

const prisma = new PrismaClient();

interface Geografia { departamentos: { codigo: string; nombre: string }[]; municipios: { codigo: string; nombre: string; departamento: string }[] }
function leerGeografia(): Geografia | null {
  const candidatos = [
    join(__dirname, 'datos', 'guatemala.json'),
    join(__dirname, '..', 'prisma', 'datos', 'guatemala.json'),
    join(__dirname, '..', '..', 'prisma', 'datos', 'guatemala.json'),
    join(process.cwd(), 'prisma', 'datos', 'guatemala.json'),
  ];
  const ruta = candidatos.find((c) => existsSync(c));
  return ruta ? (JSON.parse(readFileSync(ruta, 'utf8')) as Geografia) : null;
}

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 10) {
    throw new Error('Defina SEED_ADMIN_PASSWORD (mín. 10 caracteres) para crear el administrador inicial');
  }

  // 1) Permisos (fuente de verdad: permisos.catalogo.ts)
  for (const [codigo, p] of Object.entries(PERMISOS)) {
    await prisma.permiso.upsert({ where: { codigo }, create: { codigo, ...p }, update: p });
  }
  const todos = await prisma.permiso.findMany();
  const idPorCodigo = new Map(todos.map((p) => [p.codigo, p.id]));

  // 2) Roles base
  for (const [nombre, r] of Object.entries(ROLES_BASE)) {
    const rol = await prisma.rol.upsert({
      where: { nombre },
      create: { nombre, descripcion: r.descripcion, esSistema: nombre === 'SUPERADMIN' },
      update: { descripcion: r.descripcion },
    });
    if (r.permisos.includes('*')) continue; // SUPERADMIN => '*' en el token
    const ids = r.permisos.map((c) => idPorCodigo.get(c)).filter((x): x is number => x !== undefined);
    await prisma.rolPermiso.createMany({ data: ids.map((permisoId) => ({ rolId: rol.id, permisoId })), skipDuplicates: true });
  }

  // 3) Parámetros
  for (const [clave, p] of Object.entries(PARAMETROS_DEFECTO)) {
    await prisma.parametroSistema.upsert({ where: { clave }, create: { clave, ...p }, update: {} });
  }

  // 4) Geografía mínima (el ETL carga departamentos/municipios completos)
  const gt = await prisma.pais.upsert({ where: { nombre: 'Guatemala' }, create: { nombre: 'Guatemala', codigoIso: 'GT' }, update: {} });

  // Departamentos y municipios oficiales (22 y 340). Idempotente: no duplica si ya existen.
  const geo = leerGeografia();
  if (geo) {
    const deptoPorCodigo = new Map<string, number>();
    for (const d of geo.departamentos) {
      const dep = await prisma.departamento.upsert({
        where: { paisId_nombre: { paisId: gt.id, nombre: d.nombre } },
        create: { paisId: gt.id, nombre: d.nombre },
        update: {},
      });
      deptoPorCodigo.set(d.codigo, dep.id);
    }
    const r = await prisma.municipio.createMany({
      data: geo.municipios.map((m) => ({ departamentoId: deptoPorCodigo.get(m.departamento)!, nombre: m.nombre })),
      skipDuplicates: true,
    });
    if (r.count) console.log(`✔ Geografía: ${geo.departamentos.length} departamentos, ${r.count} municipios nuevos`);
  } else {
    console.warn('⚠ No se encontró prisma/datos/guatemala.json: se omiten departamentos y municipios');
  }

  // 5) Empresa, sucursal, bodega, caja y secuencias demo
  const empresa = await prisma.empresa.upsert({
    where: { nit: process.env.SEED_EMPRESA_NIT ?? '0000000' },
    create: { nombre: process.env.SEED_EMPRESA_NOMBRE ?? 'Mi Empresa, S.A.', nit: process.env.SEED_EMPRESA_NIT ?? '0000000' },
    update: {},
  });
  const sucursal = await prisma.sucursal.upsert({
    where: { codigo: 'S01' },
    create: { empresaId: empresa.id, codigo: 'S01', nombre: 'Sucursal Central', establecimientoFel: 1 },
    update: {},
  });
  await prisma.bodega.upsert({
    where: { sucursalId_nombre: { sucursalId: sucursal.id, nombre: 'Principal' } },
    create: { sucursalId: sucursal.id, nombre: 'Principal', esPrincipal: true },
    update: {},
  });
  await prisma.caja.upsert({
    where: { sucursalId_nombre: { sucursalId: sucursal.id, nombre: 'Caja 1' } },
    create: { sucursalId: sucursal.id, nombre: 'Caja 1' },
    update: {},
  });
  for (const [tipo, serie] of [['VENTA', 'V-S01'], ['COTIZACION', 'C-S01'], ['DEVOLUCION', 'D-S01']] as const) {
    await prisma.secuenciaDocumento.upsert({
      where: { sucursalId_tipo_serie: { sucursalId: sucursal.id, tipo, serie } },
      create: { sucursalId: sucursal.id, tipo, serie },
      update: {},
    });
  }

  // 6) Consumidor Final
  const cf = await prisma.tercero.findFirst({ where: { nit: 'CF' } });
  if (!cf) await prisma.tercero.create({ data: { nit: 'CF', nombres: 'CONSUMIDOR FINAL', esCliente: true } });

  // 7) Catálogo base de producto (para poder crear productos de inmediato)
  const cat = await prisma.categoria.upsert({ where: { nombre: 'GENERAL' }, create: { nombre: 'GENERAL' }, update: {} });
  const grupo = await prisma.grupo.upsert({
    where: { categoriaId_nombre: { categoriaId: cat.id, nombre: 'GENERAL' } },
    create: { categoriaId: cat.id, nombre: 'GENERAL' },
    update: {},
  });
  await prisma.subgrupo.upsert({ where: { grupoId_nombre: { grupoId: grupo.id, nombre: 'GENERAL' } }, create: { grupoId: grupo.id, nombre: 'GENERAL' }, update: {} });
  await prisma.presentacion.upsert({ where: { nombre: 'Unidad' }, create: { nombre: 'Unidad', abreviatura: 'UNI' }, update: {} });

  // 8) Administrador
  const superadmin = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'SUPERADMIN' } });
  const admin = await prisma.usuario.upsert({
    where: { username: 'admin' },
    create: {
      username: 'admin',
      nombre: 'Administrador del sistema',
      passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
      debeCambiarPassword: true,
      roles: { create: [{ rolId: superadmin.id }] },
      sucursales: { create: [{ sucursalId: sucursal.id, predeterminada: true }] },
    },
    update: {},
  });

  // 9) Departamentos y puestos básicos (solo si el negocio no ha creado ninguno)
  const rrhh = await crearBasicosRrhh(prisma);
  if (rrhh.creados) console.log(`✔ RRHH: ${rrhh.departamentos} departamentos y ${rrhh.puestos} puestos básicos (edítelos en Recursos humanos).`);

  console.log(`✔ Seed completo. País ${gt.nombre}, sucursal ${sucursal.codigo}, usuario "${admin.username}" (debe cambiar contraseña al ingresar).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
