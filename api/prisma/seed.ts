import { crearBasicosRrhh } from './basicos-rrhh';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Seed idempotente: permisos, roles base, parámetros, empresa/sede demo,
 * planes de mantenimiento básicos, categorías de gasto y usuario administrador inicial.
 *   npm run db:seed
 * La contraseña del admin se toma de SEED_ADMIN_PASSWORD (obligatoria).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISOS, ROLES_BASE } from '../src/common/auth/permisos.catalogo';
import { PARAMETROS_DEFECTO } from '../src/common/parametros/parametros.service';
import { CATEGORIAS_BASICAS } from '../src/modules/gastos/gastos.logica';

/** Planes preventivos de inicio: cada X km o Y días, lo que ocurra primero. */
const PLANES_BASICOS = [
  { nombre: 'Cambio de aceite y filtros de motor', cadaKm: 15000, cadaDias: 90, avisoKm: 1000, avisoDias: 10 },
  { nombre: 'Filtros de combustible y aire', cadaKm: 30000, cadaDias: 180, avisoKm: 1500, avisoDias: 15 },
  { nombre: 'Revisión de frenos', cadaKm: 30000, cadaDias: 180, avisoKm: 2000, avisoDias: 15 },
  { nombre: 'Engrase general', cadaKm: 10000, cadaDias: 30, avisoKm: 500, avisoDias: 5 },
  { nombre: 'Aceite de transmisión y diferencial', cadaKm: 80000, cadaDias: 365, avisoKm: 3000, avisoDias: 30 },
  { nombre: 'Rotación de llantas', cadaKm: 20000, cadaDias: null, avisoKm: 1000, avisoDias: 0 },
  { nombre: 'Servicio mayor', cadaKm: 150000, cadaDias: 730, avisoKm: 5000, avisoDias: 30 },
];

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

  // 5) Empresa y sede demo
  const empresa = await prisma.empresa.upsert({
    where: { nit: process.env.SEED_EMPRESA_NIT ?? '0000000' },
    create: { nombre: process.env.SEED_EMPRESA_NOMBRE ?? 'Mi Transportes, S.A.', nit: process.env.SEED_EMPRESA_NIT ?? '0000000' },
    update: {},
  });
  const sucursal = await prisma.sucursal.upsert({
    where: { codigo: 'S01' },
    create: { empresaId: empresa.id, codigo: 'S01', nombre: 'Sede central' },
    update: {},
  });

  // 6) Planes de mantenimiento típicos de un cabezal (el taller los ajusta a su flota)
  for (const p of PLANES_BASICOS) await prisma.planMantenimiento.upsert({ where: { nombre: p.nombre }, create: p, update: {} });

  // 7) Categorías de gasto de operación
  await prisma.categoriaGasto.createMany({ data: CATEGORIAS_BASICAS.map((nombre) => ({ nombre })), skipDuplicates: true });

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

  console.log(`✔ Seed completo. País ${gt.nombre}, sede ${sucursal.codigo}, usuario "${admin.username}" (debe cambiar contraseña al ingresar).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
