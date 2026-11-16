/**
 * CONSOLA DE USUARIOS (sin entrar al sistema). Para el primer inicio, o si se perdió el acceso del administrador.
 *   Desarrollo:    npm run usuarios -- <comando> [opciones]
 *   En la empresa:  menú Inicio › ALEXUS Transportes › Consola de usuarios  (pide permisos de administrador de Windows)
 *
 * Comandos:
 *   roles                                   lista los roles disponibles
 *   sucursales                              lista las sucursales
 *   listar                                  lista los usuarios
 *   crear --usuario juan --nombre "Juan Pérez" --rol GERENTE[,CAJERO] [--sucursal 1,2] [--clave X]
 *   clave --usuario juan [--clave X]        restablece la contraseña (y desbloquea al usuario)
 *   activar --usuario juan  |  desactivar --usuario juan
 *
 * Sin --clave se genera una contraseña temporal. En todos los casos el usuario debe cambiarla al entrar.
 * Todo queda en la bitácora con origen "consola".
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';

// ───────── Reglas (las mismas del sistema) ─────────
export const USUARIO_VALIDO = /^[a-z0-9][a-z0-9._-]{2,29}$/;
/** Igual que el sistema: al menos 10 caracteres, con letras y números. */
export function claveValida(clave: string, usuario: string): string | null {
  if (clave.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(clave) || !/\d/.test(clave)) return 'La contraseña debe tener letras y números.';
  if (clave.toLowerCase().includes(usuario.toLowerCase())) return 'La contraseña no puede contener el nombre de usuario.';
  return null;
}
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sin 0/O, 1/l/I para dictarla sin errores
/** Contraseña temporal de 12 caracteres que cumple la regla PARA ESE usuario (letras, números y sin contener su nombre). */
export function claveTemporal(usuario = ''): string {
  for (;;) {
    const c = Array.from({ length: 12 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
    if (claveValida(c, usuario || '\u0000') === null) return c;
  }
}
export function leerOpciones(args: string[]): { comando: string; op: Record<string, string> } {
  const op: Record<string, string> = {};
  for (let i = 1; i < args.length; i += 1) {
    if (args[i].startsWith('--')) { const k = args[i].slice(2); const v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true'; op[k] = v; }
  }
  return { comando: args[0] ?? 'ayuda', op };
}
const lista = (v?: string) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

class ErrorConsola extends Error {}
const falla = (m: string): never => { throw new ErrorConsola(m); };

export async function principal(prisma: PrismaClient, args: string[]) {
  const { comando, op } = leerOpciones(args);
  const bitacora = (accion: string, entidadId: number, despues: Record<string, unknown>) =>
    prisma.auditLog.create({ data: { usuarioId: null, accion, entidad: 'Usuario', entidadId: String(entidadId), despues: { ...despues, origen: 'consola' } } });
  const buscar = async () => {
    const u = op.usuario?.toLowerCase();
    if (!u) falla('Indique --usuario');
    return (await prisma.usuario.findUnique({ where: { username: u } })) ?? falla(`No existe el usuario «${u}»`);
  };

  switch (comando) {
    case 'roles': {
      const roles = await prisma.rol.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { nombre: true } });
      console.log('Roles disponibles:'); roles.forEach((r) => console.log(`  ${r.nombre}`)); return;
    }
    case 'sucursales': {
      const s = await prisma.sucursal.findMany({ orderBy: { id: 'asc' }, select: { id: true, codigo: true, nombre: true, activo: true } });
      console.log('Sucursales:'); s.forEach((x) => console.log(`  ${x.id}  ${x.codigo.padEnd(8)} ${x.nombre}${x.activo ? '' : '  (inactiva)'}`)); return;
    }
    case 'listar': {
      const us = await prisma.usuario.findMany({ orderBy: { username: 'asc' }, include: { roles: { include: { rol: { select: { nombre: true } } } } } });
      console.log('Usuarios:');
      us.forEach((u) => console.log(`  ${u.username.padEnd(20)} ${u.nombre.padEnd(30)} ${u.activo ? 'activo  ' : 'INACTIVO'} ${u.roles.map((r) => r.rol.nombre).join(', ')}${u.debeCambiarPassword ? '  (debe cambiar su contraseña)' : ''}`));
      return;
    }
    case 'crear': {
      const usuario = (op.usuario ?? '').toLowerCase();
      if (!USUARIO_VALIDO.test(usuario)) falla('El usuario debe tener de 3 a 30 caracteres: minúsculas, números, punto, guion o guion bajo (ej. juan.perez).');
      const nombre = (op.nombre ?? '').trim();
      if (nombre.length < 3) falla('Indique --nombre "Nombre completo"');
      if (await prisma.usuario.findUnique({ where: { username: usuario } })) falla(`Ya existe el usuario «${usuario}». Para cambiar su contraseña use: clave --usuario ${usuario}`);
      const nombresRol = lista(op.rol).map((r) => r.toUpperCase());
      if (!nombresRol.length) falla('Indique --rol (vea los disponibles con: roles)');
      const roles = await prisma.rol.findMany({ where: { nombre: { in: nombresRol }, activo: true } });
      const faltan = nombresRol.filter((r) => !roles.some((x) => x.nombre === r));
      if (faltan.length) falla(`No existe(n) el(los) rol(es): ${faltan.join(', ')}. Vea los disponibles con: roles`);
      const todas = await prisma.sucursal.findMany({ where: { activo: true }, select: { id: true, codigo: true } });
      const pedidas = lista(op.sucursal);
      const sucursales = pedidas.length
        ? pedidas.map((x) => todas.find((s) => String(s.id) === x || s.codigo.toUpperCase() === x.toUpperCase()) ?? falla(`No existe la sucursal «${x}» (vea: sucursales)`))
        : todas.length === 1 ? todas : falla('Hay varias sucursales: indique --sucursal con su número o código (vea: sucursales)');
      const temporal = !op.clave;
      const clave = op.clave ?? claveTemporal(usuario);
      const error = claveValida(clave, usuario); if (error) falla(error);
      const u = await prisma.$transaction(async (tx) => {
        const creado = await tx.usuario.create({ data: { username: usuario, nombre, passwordHash: await argon2.hash(clave, { type: argon2.argon2id }), debeCambiarPassword: true } });
        await tx.usuarioRol.createMany({ data: roles.map((r) => ({ usuarioId: creado.id, rolId: r.id })) });
        await tx.usuarioSucursal.createMany({ data: sucursales.map((s, i) => ({ usuarioId: creado.id, sucursalId: s.id, predeterminada: i === 0 })) });
        return creado;
      });
      await bitacora('CREAR', u.id, { username: usuario, roles: nombresRol, sucursales: sucursales.map((s) => s.codigo) });
      console.log(`✔ Usuario «${usuario}» creado con ${nombresRol.join(', ')} en ${sucursales.map((s) => s.codigo).join(', ')}.`);
      console.log(temporal ? `  Contraseña temporal: ${clave}\n  Désela a la persona en privado: al entrar el sistema le pedirá cambiarla.` : '  Al entrar, el sistema le pedirá cambiar la contraseña.');
      return;
    }
    case 'clave': {
      const u = await buscar();
      const temporal = !op.clave;
      const clave = op.clave ?? claveTemporal(u.username);
      const error = claveValida(clave, u.username); if (error) falla(error);
      await prisma.$transaction([
        prisma.usuario.update({ where: { id: u.id }, data: { passwordHash: await argon2.hash(clave, { type: argon2.argon2id }), debeCambiarPassword: true, intentosFallidos: 0, bloqueadoHasta: null } }),
        prisma.sesionRefresh.deleteMany({ where: { usuarioId: u.id } }), // cierra sus sesiones abiertas en todos los equipos
      ]);
      await bitacora('RESTABLECER_PASSWORD', u.id, { username: u.username });
      console.log(`✔ Contraseña de «${u.username}» restablecida; se cerraron sus sesiones y se quitó cualquier bloqueo por intentos.`);
      console.log(temporal ? `  Contraseña temporal: ${clave}\n  Al entrar, el sistema le pedirá cambiarla.` : '  Al entrar, el sistema le pedirá cambiarla.');
      return;
    }
    case 'activar':
    case 'desactivar': {
      const u = await buscar();
      const activo = comando === 'activar';
      if (!activo) {
        const admins = await prisma.usuario.count({ where: { activo: true, roles: { some: { rol: { nombre: 'SUPERADMIN' } } } } });
        const esAdmin = await prisma.usuarioRol.count({ where: { usuarioId: u.id, rol: { nombre: 'SUPERADMIN' } } });
        if (esAdmin && admins <= 1) falla('Es el único administrador activo: no se puede desactivar (el sistema quedaría sin quien lo administre).');
      }
      await prisma.$transaction([
        prisma.usuario.update({ where: { id: u.id }, data: { activo } }),
        ...(activo ? [] : [prisma.sesionRefresh.deleteMany({ where: { usuarioId: u.id } })]),
      ]);
      await bitacora(activo ? 'ACTIVAR' : 'DESACTIVAR', u.id, { username: u.username });
      console.log(`✔ Usuario «${u.username}» ${activo ? 'activado' : 'desactivado (se cerraron sus sesiones)'}.`);
      return;
    }
    default:
      console.log((require('node:fs').readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//)?.[1] ?? '').replace(/^ \* ?/gm, ''));
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  principal(prisma, process.argv.slice(2))
    .catch((e) => { console.error(`✗ ${e instanceof ErrorConsola ? e.message : `Error inesperado: ${(e as Error).message}`}`); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
