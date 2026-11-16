import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { validar, zPaginacion } from '../../common/pipes/zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { validarPoliticaPassword } from '../auth/auth.service';
import { LicenciaService } from '../licencia/licencia.service';

const usuarioSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Solo minúsculas, números, punto, guion'),
  nombre: z.string().trim().min(3).max(120),
  email: z.string().email().optional().nullable(),
  empleadoId: z.number().int().positive().optional().nullable(),
  roles: z.array(z.number().int().positive()).min(1, 'Asigne al menos un rol'),
  sucursales: z.array(z.number().int().positive()).min(1, 'Asigne al menos una sucursal'),
  sucursalPredeterminada: z.number().int().positive().optional(),
  passwordTemporal: z.string().min(10).optional(),
  activo: z.boolean().default(true),
});

const rolSchema = z.object({
  nombre: z.string().trim().toUpperCase().min(3).max(40),
  descripcion: z.string().trim().max(200).optional().nullable(),
  activo: z.boolean().default(true),
});

const selectUsuario = {
  id: true, username: true, nombre: true, email: true, activo: true, debeCambiarPassword: true,
  ultimoLogin: true, bloqueadoHasta: true, empleadoId: true,
  roles: { select: { rol: { select: { id: true, nombre: true } } } },
  sucursales: { select: { predeterminada: true, sucursal: { select: { id: true, nombre: true } } } },
} as const;

/** Contraseña temporal legible (se muestra UNA vez al administrador). */
const generarTemporal = () => `Spvi-${randomBytes(6).toString('base64url')}9`;

@ApiTags('seguridad')
@ApiBearerAuth()
@Controller('seguridad')
export class SeguridadController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly licencia: LicenciaService,
  ) {}

  // ───────────────────────────── PERMISOS ─────────────────────────────
  @Get('permisos')
  @Permisos('seguridad.roles.ver')
  async permisos() {
    const data = await this.prisma.permiso.findMany({ orderBy: [{ modulo: 'asc' }, { codigo: 'asc' }] });
    return { data };
  }

  // ─────────────────────────────── ROLES ──────────────────────────────
  @Get('roles')
  @Permisos('seguridad.roles.ver')
  async roles() {
    const roles = await this.prisma.rol.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { usuarios: true, permisos: true } } },
    });
    return { data: roles.map(({ _count, ...r }) => ({ ...r, usuarios: _count.usuarios, permisos: _count.permisos })) };
  }

  @Post('roles')
  @Permisos('seguridad.roles.gestionar')
  async crearRol(@Body() body: unknown, @Contexto() ctx: Ctx) {
    const dto = validar(rolSchema, body);
    const data = await this.prisma.rol.create({ data: dto });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Rol', entidadId: data.id, despues: data });
    return { data, message: 'Rol creado' };
  }

  @Put('roles/:id')
  @Permisos('seguridad.roles.gestionar')
  async editarRol(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Contexto() ctx: Ctx) {
    const dto = validar(rolSchema.partial(), body);
    const antes = await this.prisma.rol.findUnique({ where: { id } });
    if (!antes) throw noEncontrado('Rol', id);
    if (antes.esSistema) throw reglaNegocio('ROL_SISTEMA', 'Los roles del sistema no se pueden modificar');
    const data = await this.prisma.rol.update({ where: { id }, data: dto });
    await this.audit.registrar(ctx, { accion: 'ACTUALIZAR', entidad: 'Rol', entidadId: id, antes, despues: data });
    return { data, message: 'Rol actualizado' };
  }

  @Delete('roles/:id')
  @Permisos('seguridad.roles.gestionar')
  async desactivarRol(@Param('id', ParseIntPipe) id: number, @Contexto() ctx: Ctx) {
    const rol = await this.prisma.rol.findUnique({ where: { id } });
    if (!rol) throw noEncontrado('Rol', id);
    if (rol.esSistema) throw reglaNegocio('ROL_SISTEMA', 'Los roles del sistema no se pueden desactivar');
    await this.prisma.rol.update({ where: { id }, data: { activo: false } });
    await this.audit.registrar(ctx, { accion: 'DESACTIVAR', entidad: 'Rol', entidadId: id });
    return { message: 'Rol desactivado' };
  }

  @Get('roles/:id/permisos')
  @Permisos('seguridad.roles.ver')
  async permisosDeRol(@Param('id', ParseIntPipe) id: number) {
    const asignados = await this.prisma.rolPermiso.findMany({ where: { rolId: id }, select: { permisoId: true } });
    return { data: asignados.map((a) => a.permisoId) };
  }

  /** Reemplaza el set completo de permisos del rol (idempotente). */
  @Put('roles/:id/permisos')
  @Permisos('seguridad.roles.gestionar')
  async asignarPermisos(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Contexto() ctx: Ctx) {
    const { permisoIds } = validar(z.object({ permisoIds: z.array(z.number().int().positive()) }), body);
    const rol = await this.prisma.rol.findUnique({ where: { id } });
    if (!rol) throw noEncontrado('Rol', id);
    if (rol.esSistema) throw reglaNegocio('ROL_SISTEMA', 'Los permisos de roles del sistema no se modifican');
    await this.prisma.enTransaccion(async (tx) => {
      const antes = await tx.rolPermiso.findMany({ where: { rolId: id } });
      await tx.rolPermiso.deleteMany({ where: { rolId: id } });
      await tx.rolPermiso.createMany({ data: [...new Set(permisoIds)].map((permisoId) => ({ rolId: id, permisoId })) });
      await this.audit.registrar(ctx, { accion: 'ASIGNAR_PERMISOS', entidad: 'Rol', entidadId: id, antes: antes.map((a) => a.permisoId), despues: permisoIds }, tx);
    });
    return { message: 'Permisos actualizados. Aplican en el próximo inicio de sesión de cada usuario.' };
  }

  // ───────────────────────────── USUARIOS ─────────────────────────────
  @Get('usuarios')
  @Permisos('seguridad.usuarios.ver')
  async usuarios(@Query() query: Record<string, string>) {
    const { page, limit, q } = validar(zPaginacion, query);
    const where = q
      ? { OR: [{ username: { contains: q, mode: 'insensitive' as const } }, { nombre: { contains: q, mode: 'insensitive' as const } }] }
      : {};
    const [total, data] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where, select: selectUsuario, orderBy: { nombre: 'asc' },
        ...(limit > 0 ? { skip: (page - 1) * limit, take: limit } : {}),
      }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  @Post('usuarios')
  @Permisos('seguridad.usuarios.gestionar')
  async crearUsuario(@Body() body: unknown, @Contexto() ctx: Ctx) {
    const dto = validar(usuarioSchema, body);
    await this.licencia.validarLimiteUsuarios(await this.prisma.usuario.count({ where: { activo: true } }));
    const temporal = dto.passwordTemporal ?? generarTemporal();
    validarPoliticaPassword(temporal);
    const data = await this.prisma.enTransaccion(async (tx) => {
      const u = await tx.usuario.create({
        data: {
          username: dto.username, nombre: dto.nombre, email: dto.email ?? null, empleadoId: dto.empleadoId ?? null,
          activo: dto.activo, debeCambiarPassword: true,
          passwordHash: await argon2.hash(temporal, { type: argon2.argon2id }),
          roles: { create: dto.roles.map((rolId) => ({ rolId })) },
          sucursales: {
            create: dto.sucursales.map((sucursalId, i) => ({
              sucursalId,
              predeterminada: dto.sucursalPredeterminada ? dto.sucursalPredeterminada === sucursalId : i === 0,
            })),
          },
        },
        select: selectUsuario,
      });
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Usuario', entidadId: u.id, despues: u }, tx);
      return u;
    });
    return { data: { ...data, passwordTemporal: temporal }, message: 'Usuario creado. Entregue la contraseña temporal de forma segura.' };
  }

  @Put('usuarios/:id')
  @Permisos('seguridad.usuarios.gestionar')
  async editarUsuario(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Contexto() ctx: Ctx) {
    const dto = validar(usuarioSchema.omit({ passwordTemporal: true, username: true }).partial(), body);
    if (id === ctx.usuario.sub && dto.activo === false) throw reglaNegocio('AUTO_DESACTIVAR', 'No puede desactivarse a sí mismo');
    const data = await this.prisma.enTransaccion(async (tx) => {
      const antes = await tx.usuario.findUnique({ where: { id }, select: selectUsuario });
      if (!antes) throw noEncontrado('Usuario', id);
      if (dto.roles) {
        await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
        await tx.usuarioRol.createMany({ data: dto.roles.map((rolId) => ({ usuarioId: id, rolId })) });
      }
      if (dto.sucursales) {
        await tx.usuarioSucursal.deleteMany({ where: { usuarioId: id } });
        await tx.usuarioSucursal.createMany({
          data: dto.sucursales.map((sucursalId, i) => ({
            usuarioId: id, sucursalId,
            predeterminada: dto.sucursalPredeterminada ? dto.sucursalPredeterminada === sucursalId : i === 0,
          })),
        });
      }
      const despues = await tx.usuario.update({
        where: { id },
        data: { nombre: dto.nombre, email: dto.email, empleadoId: dto.empleadoId, activo: dto.activo },
        select: selectUsuario,
      });
      // Cambios de acceso => cerrar sesiones activas
      if (dto.roles || dto.sucursales || dto.activo === false) {
        await tx.sesionRefresh.updateMany({ where: { usuarioId: id }, data: { revocado: true } });
      }
      await this.audit.registrar(ctx, { accion: 'ACTUALIZAR', entidad: 'Usuario', entidadId: id, antes, despues }, tx);
      return despues;
    });
    return { data, message: 'Usuario actualizado' };
  }

  @Post('usuarios/:id/reset-password')
  @Permisos('seguridad.usuarios.gestionar')
  async resetPassword(@Param('id', ParseIntPipe) id: number, @Contexto() ctx: Ctx) {
    const temporal = generarTemporal();
    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id },
        data: {
          passwordHash: await argon2.hash(temporal, { type: argon2.argon2id }),
          debeCambiarPassword: true, intentosFallidos: 0, bloqueadoHasta: null,
        },
      }),
      this.prisma.sesionRefresh.updateMany({ where: { usuarioId: id }, data: { revocado: true } }),
    ]);
    await this.audit.registrar(ctx, { accion: 'RESET_PASSWORD', entidad: 'Usuario', entidadId: id });
    return { data: { passwordTemporal: temporal }, message: 'Contraseña restablecida' };
  }

  // ───────────────────────────── AUDITORÍA ────────────────────────────
  @Get('auditoria')
  @Permisos('auditoria.ver')
  async auditoria(@Query() query: Record<string, string>) {
    const { page, limit } = validar(zPaginacion, query);
    const where = {
      ...(query.entidad ? { entidad: query.entidad } : {}),
      ...(query.entidadId ? { entidadId: query.entidadId } : {}),
      ...(query.usuarioId ? { usuarioId: Number(query.usuarioId) } : {}),
    };
    const take = limit > 0 ? limit : 100;
    const data = await this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * take, take });
    return { data };
  }
}
