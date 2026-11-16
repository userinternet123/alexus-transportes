/**
 * Eventos de la campana (hechos que pasaron: pedido enviado, recibido…) y el estado VISTO / NO VISTO por usuario.
 * Los eventos se muestran 7 días; las notificaciones vistas siguen en la lista, abajo y en gris.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Ctx } from '../../common/auth/tipos';
import { PrismaService } from '../../common/prisma/prisma.service';

export const DIAS_EVENTOS = 7;

@Injectable()
export class NotificacionesService {
  private readonly log = new Logger('Notificaciones');
  constructor(private readonly prisma: PrismaService) {}

  /** Registra un hecho para la campana. Nunca interrumpe la operación que lo origina. */
  async evento(d: { sucursalId: number | null; permiso: string; tipo: string; nivel?: 'info' | 'aviso' | 'critico'; titulo: string; detalle: string; ruta?: string }) {
    try { await this.prisma.eventoNotificacion.create({ data: { ...d, nivel: d.nivel ?? 'info', ruta: d.ruta ?? null } }); }
    catch (e) { this.log.warn(`Evento no registrado: ${(e as Error).message}`); }
  }

  async eventosRecientes(ctx: Ctx, puede: (p: string) => boolean) {
    const desde = new Date(Date.now() - DIAS_EVENTOS * 86_400_000);
    const filas = await this.prisma.eventoNotificacion.findMany({ where: { creadoEn: { gte: desde }, OR: [{ sucursalId: null }, { sucursalId: ctx.sucursalId ?? -1 }] }, orderBy: { creadoEn: 'desc' }, take: 100 });
    return filas.filter((e) => puede(e.permiso)).map((e) => ({ id: `evento:${e.id}`, tipo: e.tipo, nivel: (['info', 'aviso', 'critico'].includes(e.nivel) ? e.nivel : 'info') as 'info' | 'aviso' | 'critico', titulo: e.titulo, detalle: e.detalle, ruta: e.ruta ?? undefined, fecha: e.creadoEn.toISOString() }));
  }

  async vistas(usuarioId: number, claves: string[]): Promise<Set<string>> {
    if (!claves.length) return new Set();
    const filas = await this.prisma.notificacionVista.findMany({ where: { usuarioId, clave: { in: claves } }, select: { clave: true } });
    return new Set(filas.map((f) => f.clave));
  }

  async marcar(usuarioId: number, claves: string[], visto: boolean) {
    if (visto) await this.prisma.notificacionVista.createMany({ data: claves.map((clave) => ({ usuarioId, clave })), skipDuplicates: true });
    else await this.prisma.notificacionVista.deleteMany({ where: { usuarioId, clave: { in: claves } } });
    // Limpieza: nada de esto sirve después de un mes
    if (Math.random() < 0.05) {
      const mes = new Date(Date.now() - 30 * 86_400_000);
      await this.prisma.notificacionVista.deleteMany({ where: { vistoEn: { lt: mes } } }).catch(() => {});
      await this.prisma.eventoNotificacion.deleteMany({ where: { creadoEn: { lt: mes } } }).catch(() => {});
    }
  }
}
