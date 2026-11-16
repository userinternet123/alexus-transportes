/**
 * API PARA LAS TIENDAS (agentes). Todo entra por HTTPS saliente desde la tienda:
 * la tienda pregunta, Central responde. Nunca se conecta Central a la tienda.
 */
import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { compararVersion, Instalacion, InstalacionGuard, InstalacionReq, sha256, validar } from './comun';
import { env } from './env';
import { LlavesService } from './llaves.service';
import { PrismaService } from './prisma.service';

const hoy = () => new Date(new Date().toISOString().slice(0, 10));

@Controller('agente')
@UseGuards(InstalacionGuard)
export class AgenteController {
  constructor(private readonly prisma: PrismaService, private readonly llaves: LlavesService) {}

  /** Latido: la tienda informa su estado y recibe anuncios, versión nueva y novedades de soporte. */
  @Post('latido')
  async latido(@Instalacion() inst: InstalacionReq, @Body() body: unknown) {
    const d = validar(z.object({
      version: z.string().max(20), plan: z.string().max(30).optional(), sistema: z.string().max(80).optional(),
      equipo: z.string().regex(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/).optional(), // código del equipo (para atarle la licencia)
    }), body);
    const registro = await this.prisma.instalacion.update({ where: { id: inst.id }, data: { version: d.version, plan: d.plan, sistema: d.sistema, ultimoContacto: new Date(), ...(d.equipo ? { equipo: d.equipo } : {}) } });

    const ahora = new Date();
    const anuncios = await this.prisma.anuncio.findMany({
      where: {
        activo: true, desde: { lte: ahora }, OR: [{ hasta: null }, { hasta: { gte: ahora } }],
        AND: [{ OR: [{ planes: { isEmpty: true } }, { planes: { has: d.plan ?? '' } }] }],
      },
      select: { id: true, tipo: true, titulo: true, texto: true, enlace: true, imagenUrl: true, ubicaciones: true },
      orderBy: { creadoEn: 'desc' },
      take: 10,
    });

    // Versión más reciente de su canal, si es mayor que la instalada
    const versiones = await this.prisma.version.findMany({ where: { canal: inst.canal } });
    const ultima = versiones.sort((a, b) => compararVersion(b.numero, a.numero))[0];
    const actualizacion = ultima && compararVersion(ultima.numero, d.version) > 0
      ? {
          version: ultima.numero, notas: ultima.notas, url: ultima.url, sha256: ultima.sha256,
          // crítica si CUALQUIER versión intermedia lo es (no saltarse un parche de seguridad)
          critica: versiones.some((v) => v.critica && compararVersion(v.numero, d.version) > 0),
        }
      : null;

    const respuestas = await this.prisma.ticket.count({
      where: { instalacionId: inst.id, estado: { not: 'RESUELTO' }, mensajes: { some: { autor: 'soporte', creadoEn: { gte: new Date(Date.now() - 7 * 86_400_000) } } } },
    });
    // La licencia la verifica la tienda con su llave pública: Central solo la entrega
    // Llave pública para cifrar uso y opiniones: la tienda la fija la primera vez y rechaza cambios
    return { anuncios, actualizacion, ticketsConRespuesta: respuestas, licencia: registro.licencia ?? null, proximoLatidoHoras: env.LATIDO_HORAS, llaveDatos: await this.llaves.publica() };
  }

  /** Errores técnicos (sin datos personales): se agrupan por huella. */
  @Post('errores')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async errores(@Instalacion() inst: InstalacionReq, @Body() body: unknown) {
    const { errores } = validar(z.object({
      errores: z.array(z.object({
        origen: z.enum(['api', 'web']), mensaje: z.string().max(1000), stack: z.string().max(8000).optional(),
        ruta: z.string().max(300).optional(), version: z.string().max(20).optional(), cantidad: z.number().int().min(1).max(10000).default(1),
      })).max(100),
    }), body);
    for (const e of errores) {
      // La huella ignora números y fechas para agrupar el mismo error con distintos datos
      const marco = (e.stack ?? '').split('\n').slice(0, 3).join('|');
      const huella = sha256(`${e.origen}|${e.mensaje.replace(/\d+/g, '#')}|${marco.replace(/:\d+:\d+/g, '')}`);
      await this.prisma.errorAgrupado.upsert({
        where: { instalacionId_huella: { instalacionId: inst.id, huella } },
        create: { instalacionId: inst.id, huella, origen: e.origen, mensaje: e.mensaje, stack: e.stack, ruta: e.ruta, version: e.version, conteo: e.cantidad },
        update: { conteo: { increment: e.cantidad }, ultimaVez: new Date(), version: e.version, resuelto: false },
      });
    }
    return { recibidos: errores.length };
  }

  @Post('tickets')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async crearTicket(@Instalacion() inst: InstalacionReq, @Body() body: unknown) {
    const d = validar(z.object({
      usuario: z.string().max(60), usuarioNombre: z.string().max(120), asunto: z.string().trim().min(3).max(150),
      descripcion: z.string().trim().min(5).max(5000), captura: z.string().max(2_000_000).optional(), contexto: z.record(z.unknown()).optional(),
    }), body);
    const t = await this.prisma.ticket.create({
      data: {
        instalacionId: inst.id, usuario: d.usuario, usuarioNombre: d.usuarioNombre, asunto: d.asunto, descripcion: d.descripcion,
        captura: d.captura ? Buffer.from(d.captura.replace(/^data:[^;]+;base64,/, ''), 'base64') : undefined,
        contexto: d.contexto as object | undefined,
      },
      select: { id: true, estado: true, creadoEn: true },
    });
    return { data: t, message: `Ticket #${t.id} enviado. Soporte le responderá aquí mismo.` };
  }

  /** Tickets de un usuario de la tienda, con la conversación. */
  @Get('tickets')
  async tickets(@Instalacion() inst: InstalacionReq, @Query('usuario') usuario: string) {
    const data = await this.prisma.ticket.findMany({
      where: { instalacionId: inst.id, ...(usuario ? { usuario } : {}) },
      select: { id: true, asunto: true, descripcion: true, estado: true, creadoEn: true, actualizadoEn: true, mensajes: { orderBy: { id: 'asc' }, select: { autor: true, nombre: true, texto: true, creadoEn: true } } },
      orderBy: { actualizadoEn: 'desc' },
      take: 50,
    });
    return { data };
  }

  @Post('tickets/:id/mensajes')
  async responder(@Instalacion() inst: InstalacionReq, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const d = validar(z.object({ nombre: z.string().max(120), texto: z.string().trim().min(1).max(5000) }), body);
    const t = await this.prisma.ticket.findFirst({ where: { id, instalacionId: inst.id } });
    if (!t) throw new NotFoundException('Ticket no encontrado');
    await this.prisma.ticketMensaje.create({ data: { ticketId: id, autor: 'cliente', nombre: d.nombre, texto: d.texto } });
    await this.prisma.ticket.update({ where: { id }, data: { estado: t.estado === 'RESUELTO' ? 'ABIERTO' : t.estado } });
    return { message: 'Mensaje enviado' };
  }

  /** Impresiones y clics de anuncios (acumulados por día). */
  @Post('anuncios/metricas')
  async metricas(@Instalacion() inst: InstalacionReq, @Body() body: unknown) {
    const { metricas } = validar(z.object({
      metricas: z.array(z.object({ anuncioId: z.number().int(), impresiones: z.number().int().min(0).max(100000), clics: z.number().int().min(0).max(100000) })).max(50),
    }), body);
    for (const m of metricas) {
      const existe = await this.prisma.anuncio.findUnique({ where: { id: m.anuncioId }, select: { id: true } });
      if (!existe) continue;
      await this.prisma.anuncioMetrica.upsert({
        where: { anuncioId_instalacionId_dia: { anuncioId: m.anuncioId, instalacionId: inst.id, dia: hoy() } },
        create: { anuncioId: m.anuncioId, instalacionId: inst.id, dia: hoy(), impresiones: m.impresiones, clics: m.clics },
        update: { impresiones: { increment: m.impresiones }, clics: { increment: m.clics } },
      });
    }
    return { ok: true };
  }
}
