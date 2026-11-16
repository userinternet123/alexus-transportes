/**
 * EXPERIENCIA DE LOS CLIENTES: las tiendas envían (cifrado) cómo usan SPVI y qué opinan; el panel lo resume.
 * El uso solo llega si la tienda lo aceptó; si deja de aceptarlo, se borra lo recibido de ella.
 */
import { BadRequestException, Body, ConflictException, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AdminGuard, Instalacion, InstalacionGuard, InstalacionReq } from './comun';
import { LlavesService } from './llaves.service';
import { PrismaService } from './prisma.service';
import type { Sobre } from './sobre';

const paqueteZ = z.object({
  version: z.string().max(20).optional(),
  consentimiento: z.boolean(),
  uso: z.array(z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), evento: z.string().min(1).max(140), rol: z.string().max(40), dispositivo: z.enum(['celular', 'tableta', 'escritorio']), veces: z.number().int().min(0).max(1_000_000) })).max(5000),
  opiniones: z.array(z.object({ tipo: z.enum(['NPS', 'UTIL', 'SUGERENCIA']), puntaje: z.number().int().min(0).max(10).nullable(), texto: z.string().max(1000).nullable(), pantalla: z.string().max(120).nullable(), contacto: z.string().max(120).nullable(), rol: z.string().max(40).nullable(), fecha: z.string().max(40) })).max(500),
  perfil: z.record(z.unknown()).nullable(),
});

@Controller('agente')
@UseGuards(InstalacionGuard)
export class ExperienciaAgenteController {
  constructor(private readonly prisma: PrismaService, private readonly llaves: LlavesService) {}

  @Post('experiencia')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async recibir(@Instalacion() inst: InstalacionReq, @Body() body: { sobre?: Sobre }) {
    let crudo: unknown;
    try { crudo = await this.llaves.abrir(body?.sobre as Sobre); } catch (e) {
      if ((e as Error).message.includes('otra llave')) throw new ConflictException('El sobre se cerró con una llave distinta a la de Central');
      throw new BadRequestException('Sobre inválido');
    }
    const p = paqueteZ.safeParse(crudo);
    if (!p.success) throw new BadRequestException('Contenido inválido');
    const d = p.data;
    await this.prisma.$transaction(async (tx) => {
      if (!d.consentimiento) await tx.usoDiario.deleteMany({ where: { instalacionId: inst.id } }); // dejó de aceptar: se borra lo recibido
      else if (d.uso.length) {
        await tx.$executeRaw`
          INSERT INTO uso_diario (instalacion_id, fecha, evento, rol, dispositivo, veces)
          SELECT ${inst.id}, x.f::date, x.e, x.r, x.d, x.v FROM unnest(${d.uso.map((u) => u.fecha)}::text[], ${d.uso.map((u) => u.evento)}::text[], ${d.uso.map((u) => u.rol)}::text[], ${d.uso.map((u) => u.dispositivo)}::text[], ${d.uso.map((u) => u.veces)}::int[]) AS x(f, e, r, d, v)
          ON CONFLICT (instalacion_id, fecha, evento, rol, dispositivo) DO UPDATE SET veces = EXCLUDED.veces`;
      }
      if (d.opiniones.length) await tx.opinion.createMany({ data: d.opiniones.map((o) => ({ ...o, instalacionId: inst.id, fecha: new Date(o.fecha) })) });
      await tx.instalacion.update({ where: { id: inst.id }, data: { consentimientoUso: d.consentimiento, experienciaRecibida: new Date(), ...(d.perfil ? { perfil: d.perfil as object } : {}) } });
    });
    return { ok: true, recibidos: { uso: d.consentimiento ? d.uso.length : 0, opiniones: d.opiniones.length, perfil: Boolean(d.perfil) } };
  }
}

@Controller('panel')
@UseGuards(AdminGuard)
export class ExperienciaPanelController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('experiencia')
  async resumen(@Query('dias') diasTxt?: string) {
    const dias = Math.min(365, Math.max(7, Number(diasTxt) || 30));
    const desde = new Date(Date.now() - dias * 86_400_000);
    const [instalaciones, funciones, dispositivos, opiniones, npsTodos] = await Promise.all([
      this.prisma.instalacion.findMany({ where: { activa: true }, include: { cliente: { select: { empresa: true } } }, orderBy: { nombre: 'asc' } }),
      this.prisma.usoDiario.groupBy({ by: ['evento'], where: { fecha: { gte: desde } }, _sum: { veces: true }, orderBy: { _sum: { veces: 'desc' } }, take: 30 }),
      this.prisma.usoDiario.groupBy({ by: ['dispositivo'], where: { fecha: { gte: desde } }, _sum: { veces: true } }),
      this.prisma.opinion.findMany({ where: { OR: [{ tipo: 'SUGERENCIA' }, { texto: { not: null } }] }, orderBy: { fecha: 'desc' }, take: 60, include: { instalacion: { select: { nombre: true, cliente: { select: { empresa: true } } } } } }),
      this.prisma.opinion.findMany({ where: { tipo: 'NPS', fecha: { gte: new Date(Date.now() - 365 * 86_400_000) } }, orderBy: { fecha: 'desc' }, select: { instalacionId: true, puntaje: true } }),
    ]);
    const usoPorInst = await this.prisma.usoDiario.groupBy({ by: ['instalacionId'], where: { fecha: { gte: desde } }, _sum: { veces: true }, _max: { fecha: true } });
    const inst = new Map(usoPorInst.map((u) => [u.instalacionId, u]));
    // NPS: la última respuesta de cada tienda; promotores 9-10, detractores 0-6
    const ultimo = new Map<string, number>();
    for (const n of npsTodos) if (!ultimo.has(n.instalacionId) && n.puntaje !== null) ultimo.set(n.instalacionId, n.puntaje);
    const notas = [...ultimo.values()];
    const promotores = notas.filter((x) => x >= 9).length; const detractores = notas.filter((x) => x <= 6).length;
    const giros = new Map<string, number>(); const objetivos = new Map<string, number>();
    for (const i of instalaciones) {
      const pf = i.perfil as { giro?: string; objetivos?: string[] } | null;
      if (pf?.giro) giros.set(pf.giro, (giros.get(pf.giro) ?? 0) + 1);
      for (const o of pf?.objetivos ?? []) objetivos.set(o, (objetivos.get(o) ?? 0) + 1);
    }
    return {
      dias,
      nps: { respuestas: notas.length, puntuacion: notas.length ? Math.round(((promotores - detractores) / notas.length) * 100) : null, promotores, pasivos: notas.length - promotores - detractores, detractores },
      instalaciones: instalaciones.map((i) => ({
        id: i.id, nombre: i.nombre, empresa: i.cliente.empresa, consentimiento: i.consentimientoUso, recibida: i.experienciaRecibida, perfil: i.perfil,
        eventos: inst.get(i.id)?._sum.veces ?? 0, ultimoUso: inst.get(i.id)?._max.fecha ?? null, nps: ultimo.get(i.id) ?? null,
      })),
      funciones: funciones.map((f) => ({ evento: f.evento, veces: f._sum.veces ?? 0 })),
      dispositivos: dispositivos.map((x) => ({ dispositivo: x.dispositivo, veces: x._sum.veces ?? 0 })),
      giros: [...giros].map(([giro, n]) => ({ giro, n })).sort((a, b) => b.n - a.n),
      objetivos: [...objetivos].map(([objetivo, n]) => ({ objetivo, n })).sort((a, b) => b.n - a.n),
      opiniones: opiniones.map((o) => ({ id: o.id, tipo: o.tipo, puntaje: o.puntaje, texto: o.texto, pantalla: o.pantalla, contacto: o.contacto, rol: o.rol, fecha: o.fecha, tienda: `${o.instalacion.cliente.empresa} · ${o.instalacion.nombre}` })),
    };
  }
}
