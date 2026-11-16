import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Ctx } from './tipos';

export const META_PUBLICO = 'spvi:publico';
export const META_PERMISOS = 'spvi:permisos';
export const META_SUCURSAL = 'spvi:requiere-sucursal';
export const META_PWD_PENDIENTE = 'spvi:permite-pwd-pendiente';

/** Endpoint sin autenticación (login, health). */
export const Publico = () => SetMetadata(META_PUBLICO, true);
/** La ruta funciona aunque el equipo no tenga licencia válida (iniciar sesión, ver y activar la licencia). */
export const META_SIN_LICENCIA = 'spvi:sin-licencia';
export const SinLicencia = () => SetMetadata(META_SIN_LICENCIA, true);

/** Requiere TODOS los permisos indicados. */
export const Permisos = (...permisos: string[]) => SetMetadata(META_PERMISOS, permisos);

/** Exige sucursal activa (header X-Sucursal-Id) — ventas, caja, inventario... */
export const RequiereSucursal = () => SetMetadata(META_SUCURSAL, true);

/** Permite el acceso aunque el usuario deba cambiar su contraseña. */
export const PermitePasswordPendiente = () => SetMetadata(META_PWD_PENDIENTE, true);

/** Inyecta el contexto (usuario + sucursal) en el handler. */
export const Contexto = createParamDecorator((_: unknown, ctx: ExecutionContext): Ctx => {
  return ctx.switchToHttp().getRequest().ctx;
});
