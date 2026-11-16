import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Ctx } from '../auth/tipos';
import { Db, PrismaService } from '../prisma/prisma.service';

export interface EventoAuditoria {
  accion: string;
  entidad: string;
  entidadId?: string | number | bigint | null;
  antes?: unknown;
  despues?: unknown;
}

/** Serializa Decimal/BigInt/Date a JSON plano. */
const plano = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined ? undefined : (JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))) as Prisma.InputJsonValue);

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registrar dentro de la MISMA transacción del cambio (pasar `tx`). */
  async registrar(ctx: Ctx | null, e: EventoAuditoria, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        usuarioId: ctx?.usuario.sub ?? null,
        sucursalId: ctx?.sucursalId ?? null,
        accion: e.accion,
        entidad: e.entidad,
        entidadId: e.entidadId != null ? String(e.entidadId) : null,
        antes: plano(e.antes),
        despues: plano(e.despues),
        ip: ctx?.ip ?? null,
        requestId: ctx?.requestId ?? null,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
