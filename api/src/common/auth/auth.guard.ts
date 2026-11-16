import { CanActivate, ExecutionContext, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorDominio, prohibido } from '../errors';
import { META_PERMISOS, META_PUBLICO, META_PWD_PENDIENTE, META_SUCURSAL } from './decoradores';
import { Ctx, tienePermiso, UsuarioToken } from './tipos';
import { LicenciaService } from '../../modules/licencia/licencia.service';
import { MODULOS, moduloDe } from '../../modules/licencia/modulos';

/**
 * Guard global único: autenticación (JWT) + contexto de sucursal + permisos.
 * Todo endpoint queda protegido por defecto; se abre explícitamente con @Publico().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly licencia: LicenciaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(META_PUBLICO, targets)) return true;

    const req = context.switchToHttp().getRequest();
    const [tipo, token] = String(req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException({ codigo: 'NO_AUTENTICADO', mensaje: 'Sesión requerida' });

    let usuario: UsuarioToken;
    try {
      usuario = await this.jwt.verifyAsync<UsuarioToken>(token);
    } catch {
      throw new UnauthorizedException({ codigo: 'TOKEN_INVALIDO', mensaje: 'Sesión expirada o inválida' });
    }

    if (usuario.cp && !this.reflector.getAllAndOverride<boolean>(META_PWD_PENDIENTE, targets)) {
      throw new ErrorDominio('CAMBIO_PASSWORD_REQUERIDO', 'Debe cambiar su contraseña antes de continuar', HttpStatus.FORBIDDEN);
    }

    // ── Sucursal activa ──────────────────────────────────────────────
    const header = req.headers['x-sucursal-id'];
    let sucursalId: number | null = header ? Number(header) : null;
    if (sucursalId !== null) {
      if (!Number.isInteger(sucursalId) || sucursalId <= 0) throw prohibido('X-Sucursal-Id inválido');
      if (!usuario.sucursales.includes(sucursalId) && !tienePermiso(usuario, 'sucursales.todas')) {
        throw prohibido('No tiene acceso a la sucursal seleccionada');
      }
    } else if (usuario.sucursales.length === 1) {
      sucursalId = usuario.sucursales[0]; // única sucursal: se asume
    }

    if (this.reflector.getAllAndOverride<boolean>(META_SUCURSAL, targets) && !sucursalId) {
      throw new ErrorDominio('SUCURSAL_REQUERIDA', 'Seleccione la sucursal de trabajo (header X-Sucursal-Id)', HttpStatus.BAD_REQUEST);
    }

    // ── Permisos ─────────────────────────────────────────────────────
    const requeridos = this.reflector.getAllAndMerge<string[]>(META_PERMISOS, targets) ?? [];
    const faltantes = requeridos.filter((p) => !tienePermiso(usuario, p));
    if (faltantes.length) throw prohibido(`Permiso requerido: ${faltantes.join(', ')}`);

    // ── Módulos contratados (aplica también al superadministrador) ──
    for (const p of requeridos) {
      if (!(await this.licencia.permisoHabilitado(p))) {
        const m = moduloDe(p)!;
        throw new ErrorDominio('MODULO_NO_CONTRATADO', `Su plan no incluye el módulo "${MODULOS[m]?.nombre ?? m}"`, HttpStatus.FORBIDDEN, { modulo: m });
      }
    }

    const ctx: Ctx = { usuario, sucursalId, ip: req.ip, requestId: req.id };
    req.ctx = ctx;
    return true;
  }
}
