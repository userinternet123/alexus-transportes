import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso, UsuarioToken } from '../../common/auth/tipos';
import { ErrorDominio, prohibido, reglaNegocio } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { LicenciaService } from '../licencia/licencia.service';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const CREDENCIALES_INVALIDAS = 'Usuario o contraseña incorrectos';

/** Política mínima de contraseñas (ajustable). */
export function validarPoliticaPassword(pwd: string): void {
  if (pwd.length < 10 || !/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) {
    throw reglaNegocio('PASSWORD_DEBIL', 'La contraseña debe tener al menos 10 caracteres, letras y números');
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly parametros: ParametrosService,
    private readonly licencia: LicenciaService,
  ) {}

  /** Construye el payload con roles, permisos y sucursales vigentes. */
  private async construirToken(usuarioId: number): Promise<UsuarioToken> {
    const u = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      include: {
        roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } },
        sucursales: true,
      },
    });
    const rolesActivos = u.roles.map((r) => r.rol).filter((r) => r.activo);
    const esSuper = rolesActivos.some((r) => r.nombre === 'SUPERADMIN');
    // Solo permisos de módulos contratados (el núcleo siempre está incluido)
    const permisos = esSuper
      ? ['*']
      : await this.licencia.filtrarPermisos([...new Set(rolesActivos.flatMap((r) => r.permisos.map((p) => p.permiso.codigo)))]);
    return {
      sub: u.id,
      username: u.username,
      nombre: u.nombre,
      roles: rolesActivos.map((r) => r.nombre),
      permisos,
      sucursales: u.sucursales.map((s) => s.sucursalId),
      cp: u.debeCambiarPassword || undefined,
    };
  }

  private async emitirTokens(usuarioId: number, ip?: string, userAgent?: string) {
    const payload = await this.construirToken(usuarioId);
    const accessToken = await this.jwt.signAsync({ ...payload });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.sesionRefresh.create({
      data: {
        usuarioId,
        tokenHash: sha256(refreshToken),
        expiraEn: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86_400_000),
        ip,
        userAgent: userAgent?.slice(0, 250),
      },
    });
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: env.JWT_ACCESS_TTL_SEG, usuario: payload };
  }

  async login(username: string, password: string, ip?: string, userAgent?: string) {
    const u = await this.prisma.usuario.findUnique({ where: { username: username.trim().toLowerCase() } });

    if (!u || !u.activo) {
      // Mismo costo de CPU exista o no el usuario (evita enumeración de usuarios por tiempo)
      await argon2.hash(password).catch(() => undefined);
      throw new UnauthorizedException({ codigo: 'CREDENCIALES', mensaje: CREDENCIALES_INVALIDAS });
    }
    if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
      throw new ErrorDominio('USUARIO_BLOQUEADO', `Usuario bloqueado temporalmente por intentos fallidos. Intente después de ${u.bloqueadoHasta.toLocaleTimeString('es-GT')}`, HttpStatus.LOCKED);
    }

    const ok = await argon2.verify(u.passwordHash, password).catch(() => false);
    if (!ok) {
      const intentos = u.intentosFallidos + 1;
      const bloquear = intentos >= env.LOGIN_MAX_INTENTOS;
      await this.prisma.usuario.update({
        where: { id: u.id },
        data: {
          intentosFallidos: bloquear ? 0 : intentos,
          bloqueadoHasta: bloquear ? new Date(Date.now() + env.LOGIN_BLOQUEO_MINUTOS * 60_000) : null,
        },
      });
      await this.audit.registrar(null, { accion: 'LOGIN_FALLIDO', entidad: 'Usuario', entidadId: u.id, despues: { ip, intentos } });
      throw new UnauthorizedException({ codigo: 'CREDENCIALES', mensaje: CREDENCIALES_INVALIDAS });
    }

    await this.prisma.usuario.update({
      where: { id: u.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoLogin: new Date() },
    });
    await this.audit.registrar(null, { accion: 'LOGIN', entidad: 'Usuario', entidadId: u.id, despues: { ip } });
    return this.emitirTokens(u.id, ip, userAgent);
  }

  /** Rotación de refresh token con detección de reutilización. */
  async refrescar(refreshToken: string, ip?: string, userAgent?: string) {
    const sesion = await this.prisma.sesionRefresh.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!sesion) throw new UnauthorizedException({ codigo: 'TOKEN_INVALIDO', mensaje: 'Sesión inválida' });

    if (sesion.revocado) {
      // Un token ya rotado se reutilizó => posible robo. Se revocan TODAS las sesiones.
      await this.prisma.sesionRefresh.updateMany({ where: { usuarioId: sesion.usuarioId }, data: { revocado: true } });
      await this.audit.registrar(null, { accion: 'REFRESH_REUTILIZADO', entidad: 'Usuario', entidadId: sesion.usuarioId, despues: { ip } });
      throw new UnauthorizedException({ codigo: 'TOKEN_REUTILIZADO', mensaje: 'Sesión revocada por seguridad. Inicie sesión nuevamente.' });
    }
    if (sesion.expiraEn < new Date()) throw new UnauthorizedException({ codigo: 'TOKEN_EXPIRADO', mensaje: 'Sesión expirada' });

    const usuario = await this.prisma.usuario.findUnique({ where: { id: sesion.usuarioId } });
    if (!usuario?.activo) throw new UnauthorizedException({ codigo: 'USUARIO_INACTIVO', mensaje: 'Usuario inactivo' });

    await this.prisma.sesionRefresh.update({ where: { id: sesion.id }, data: { revocado: true } });
    return this.emitirTokens(sesion.usuarioId, ip, userAgent);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.sesionRefresh.updateMany({ where: { tokenHash: sha256(refreshToken) }, data: { revocado: true } });
  }

  async perfil(ctx: Ctx) {
    const u = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: ctx.usuario.sub },
      select: {
        id: true,
        username: true,
        nombre: true,
        email: true,
        debeCambiarPassword: true,
        ultimoLogin: true,
        empleado: { select: { id: true, codigo: true, puesto: { select: { nombre: true } } } },
        sucursales: { select: { predeterminada: true, sucursal: { select: { id: true, codigo: true, nombre: true } } } },
      },
    });
    return {
      ...u,
      sucursales: u.sucursales.map((s) => ({ ...s.sucursal, predeterminada: s.predeterminada })),
      roles: ctx.usuario.roles,
      permisos: ctx.usuario.permisos,
      // Configurable en Parámetros del sistema (módulo Seguridad)
      sesion: {
        minutos: await this.parametros.numero('seguridad.sesion_minutos'),
        avisoSegundos: await this.parametros.numero('seguridad.aviso_segundos'),
      },
      licencia: await this.licencia.estado().then((l) => ({ plan: l.plan, modo: l.modo, modulos: l.modulos, vence: l.vence, diasRestantes: l.diasRestantes, bloqueado: l.bloqueado, motivo: l.motivo })),
    };
  }

  /**
   * AUTORIZACIÓN DE SUPERVISOR ("override"): un encargado escribe SUS credenciales
   * en la caja de otro usuario para permitir UNA acción puntual (anular, devolver,
   * quitar un producto del carrito). Devuelve un token de un solo propósito,
   * válido 5 minutos, y queda auditado quién autorizó qué.
   */
  async autorizar(ctx: Ctx, username: string, password: string, permiso: string, detalle?: string) {
    const u = await this.prisma.usuario.findUnique({ where: { username: username.trim().toLowerCase() } });
    const invalido = () => new ErrorDominio('AUTORIZACION_INVALIDA', 'Credenciales del supervisor incorrectas', HttpStatus.FORBIDDEN);
    if (!u || !u.activo || (u.bloqueadoHasta && u.bloqueadoHasta > new Date())) throw invalido();
    if (!(await argon2.verify(u.passwordHash, password).catch(() => false))) {
      const intentos = u.intentosFallidos + 1;
      const bloquear = intentos >= env.LOGIN_MAX_INTENTOS;
      await this.prisma.usuario.update({
        where: { id: u.id },
        data: { intentosFallidos: bloquear ? 0 : intentos, bloqueadoHasta: bloquear ? new Date(Date.now() + env.LOGIN_BLOQUEO_MINUTOS * 60_000) : null },
      });
      await this.audit.registrar(ctx, { accion: 'AUTORIZACION_FALLIDA', entidad: 'Usuario', entidadId: u.id, despues: { permiso, detalle } });
      throw invalido();
    }
    const sup = await this.construirToken(u.id);
    if (!tienePermiso(sup, 'operacion.autorizar') || !tienePermiso(sup, permiso)) {
      throw prohibido(`${sup.nombre} no tiene facultad para autorizar esta acción (${permiso})`);
    }
    if (ctx.sucursalId && !sup.sucursales.includes(ctx.sucursalId) && !tienePermiso(sup, 'sucursales.todas')) {
      throw prohibido(`${sup.nombre} no tiene acceso a esta sucursal`);
    }
    const autorizacion = await this.jwt.signAsync(
      { tipo: 'autorizacion', permiso, sup: sup.sub, supNombre: sup.nombre, sol: ctx.usuario.sub, suc: ctx.sucursalId },
      { expiresIn: 300 },
    );
    await this.audit.registrar(ctx, { accion: 'AUTORIZACION', entidad: 'Usuario', entidadId: sup.sub, despues: { permiso, detalle, solicitante: ctx.usuario.username } });
    return { autorizacion, supervisor: { id: sup.sub, nombre: sup.nombre }, expiraEnSeg: 300 };
  }

  /**
   * Si el usuario tiene el permiso, no hace falta autorización (devuelve null).
   * Si no lo tiene, exige un token de autorización vigente para ESE permiso,
   * emitido para ESTE usuario y ESTA sucursal. Devuelve quién autorizó.
   */
  async validarAutorizacion(ctx: Ctx, permiso: string, token?: string): Promise<{ id: number; nombre: string } | null> {
    if (tienePermiso(ctx.usuario, permiso)) return null;
    if (!token) {
      throw new ErrorDominio('AUTORIZACION_REQUERIDA', 'Esta acción requiere autorización de un encargado', HttpStatus.FORBIDDEN, { permiso });
    }
    let p: { tipo?: string; permiso?: string; sup?: number; supNombre?: string; sol?: number; suc?: number | null };
    try {
      p = await this.jwt.verifyAsync(token);
    } catch {
      throw new ErrorDominio('AUTORIZACION_VENCIDA', 'La autorización venció. Solicítela de nuevo.', HttpStatus.FORBIDDEN, { permiso });
    }
    if (p.tipo !== 'autorizacion' || p.permiso !== permiso || p.sol !== ctx.usuario.sub || (p.suc ?? null) !== (ctx.sucursalId ?? null)) {
      throw new ErrorDominio('AUTORIZACION_INVALIDA', 'La autorización no corresponde a esta acción', HttpStatus.FORBIDDEN, { permiso });
    }
    return { id: p.sup!, nombre: p.supNombre ?? '' };
  }

  async cambiarPassword(ctx: Ctx, actual: string, nueva: string) {
    const u = await this.prisma.usuario.findUniqueOrThrow({ where: { id: ctx.usuario.sub } });
    if (!(await argon2.verify(u.passwordHash, actual))) {
      throw reglaNegocio('PASSWORD_ACTUAL', 'La contraseña actual no es correcta');
    }
    if (actual === nueva) throw reglaNegocio('PASSWORD_IGUAL', 'La nueva contraseña debe ser distinta a la actual');
    validarPoliticaPassword(nueva);

    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: u.id },
        data: { passwordHash: await argon2.hash(nueva, { type: argon2.argon2id }), debeCambiarPassword: false },
      }),
      this.prisma.sesionRefresh.updateMany({ where: { usuarioId: u.id }, data: { revocado: true } }),
    ]);
    await this.audit.registrar(ctx, { accion: 'CAMBIO_PASSWORD', entidad: 'Usuario', entidadId: u.id });
    // Nuevo par de tokens sin la marca "cp"
    return this.emitirTokens(u.id, ctx.ip);
  }
}
