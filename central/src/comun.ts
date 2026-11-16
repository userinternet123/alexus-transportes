import {
  BadRequestException, CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z, ZodTypeAny } from 'zod';
import { PrismaService } from './prisma.service';

/** Valida el cuerpo con zod y responde 400 con mensajes legibles. */
export function validar<T extends ZodTypeAny>(esquema: T, datos: unknown): z.infer<T> {
  const r = esquema.safeParse(datos);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

export const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

/** Token de instalación: "<id>.<secreto>". Solo se guarda el hash del secreto. */
export function nuevoSecreto() {
  return randomBytes(32).toString('base64url');
}

/** Compara dos versiones "2.10.3" vs "2.9.0": >0 si a es mayor. */
export function compararVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export interface InstalacionReq { id: string; clienteId: number; canal: string; plan: string | null; version: string | null }
export interface AdminReq { id: number; nombre: string; email: string }

export const Instalacion = createParamDecorator((_: unknown, ctx: ExecutionContext): InstalacionReq => ctx.switchToHttp().getRequest().instalacion);
export const Admin = createParamDecorator((_: unknown, ctx: ExecutionContext): AdminReq => ctx.switchToHttp().getRequest().admin);

/** Autentica a una tienda (agente) por su token. */
@Injectable()
export class InstalacionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const [id, secreto] = token.split('.');
    if (!id || !secreto) throw new UnauthorizedException('Token de instalación requerido');
    const inst = await this.prisma.instalacion.findUnique({ where: { id }, include: { cliente: { select: { id: true } } } });
    const a = Buffer.from(sha256(secreto));
    const b = Buffer.from(inst?.tokenHash ?? '0'.repeat(64));
    if (!inst || !inst.activa || a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Instalación no autorizada o revocada');
    req.instalacion = { id: inst.id, clienteId: inst.cliente.id, canal: inst.canal, plan: inst.plan, version: inst.version } satisfies InstalacionReq;
    return true;
  }
}

/** Autentica al personal del proveedor en el panel. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    try {
      const p = await this.jwt.verifyAsync<{ sub: number; nombre: string; email: string }>(token);
      req.admin = { id: p.sub, nombre: p.nombre, email: p.email } satisfies AdminReq;
      return true;
    } catch {
      throw new UnauthorizedException('Sesión del panel vencida o inválida');
    }
  }
}
