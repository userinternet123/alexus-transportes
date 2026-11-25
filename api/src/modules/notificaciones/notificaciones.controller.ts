/**
 * NOTIFICACIONES: todo lo pendiente en un solo lugar (la campana del portal).
 * No se guardan: se calculan al consultar, según los permisos de cada usuario.
 * El "id" cambia cuando hay algo nuevo (otro traslado, otra respuesta), para volver a avisar.
 */
import { Body, Put } from '@nestjs/common';
import { z } from 'zod';
import { NotificacionesService } from './notificaciones.service';
import { Controller, Get } from '@nestjs/common';
import { Contexto } from '../../common/auth/decoradores';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CentralService } from '../central/central.service';
import { LicenciaService } from '../licencia/licencia.service';
import { CobrosService } from '../cobros/cobros.service';
import { TallerService } from '../taller/taller.service';
import { IncidentesService } from '../incidentes/incidentes.service';
import { LlantasService } from '../llantas/llantas.service';

export interface Notificacion {
  id: string;
  tipo: 'actualizacion' | 'soporte' | 'aviso' | 'licencia' | 'documento' | 'mantenimiento' | 'combustible' | string;
  nivel: 'info' | 'aviso' | 'critico';
  titulo: string;
  detalle: string;
  ruta?: string; // pantalla del portal
  accion?: 'ayuda'; // abrir el panel de soporte
  enlace?: string | null; // enlace externo (avisos del proveedor)
  fecha?: string; // los eventos (hechos) traen su fecha; las situaciones vigentes no
  visto?: boolean;
}

@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly central: CentralService,
    private readonly licencia: LicenciaService,
    private readonly notificaciones: NotificacionesService,
    private readonly cobros: CobrosService,
    private readonly taller: TallerService,
    private readonly incidentes: IncidentesService,
    private readonly llantas: LlantasService,
  ) {}

  @Get()
  async listar(@Contexto() ctx: Ctx) {
    const puede = (p: string) => tienePermiso(ctx.usuario, p);
    const lista: Notificacion[] = [];
    const c = await this.central.estado();

    if (c.actualizacion && puede('config.parametros')) {
      const v = c.actualizacion.version;
      lista.push({
        id: `actualizacion:${v}`, tipo: 'actualizacion', nivel: c.actualizacion.critica ? 'critico' : 'info',
        titulo: c.actualizacion.critica ? `Actualización de seguridad ${v}` : `Nueva versión ${v} disponible`,
        detalle: 'Instálela fuera del horario de operación desde la pantalla de Inicio.', ruta: '/home',
      });
    }
    if (c.ticketsConRespuesta > 0) {
      lista.push({
        id: `soporte:${c.ticketsConRespuesta}`, tipo: 'soporte', nivel: 'info',
        titulo: 'Soporte le respondió', detalle: `${c.ticketsConRespuesta} reporte(s) con respuesta del equipo de soporte.`, accion: 'ayuda',
      });
    }
    for (const a of c.anuncios.filter((x) => x.tipo === 'aviso' && x.ubicaciones.includes('inicio'))) {
      lista.push({ id: `aviso:${a.id}`, tipo: 'aviso', nivel: 'info', titulo: a.titulo, detalle: a.texto, enlace: a.enlace });
    }
    if (puede('config.parametros')) {
      const lic = await this.licencia.estado();
      if (lic.diasRestantes != null && lic.diasRestantes <= 30) {
        lista.push({
          id: `licencia:${lic.vence}:${lic.diasRestantes <= 7 ? 'semana' : 'mes'}`, tipo: 'licencia', nivel: lic.diasRestantes <= 7 ? 'critico' : 'aviso',
          titulo: lic.diasRestantes <= 0 ? 'La licencia venció' : `La licencia vence en ${lic.diasRestantes} días`,
          detalle: 'Comuníquese con ALEXUS para renovarla.', ruta: '/home/licencia',
        });
      }
    }
    // Casos: vencidos y urgentes abiertos de la sede
    if (puede('casos.ver') && ctx.sucursalId) {
      const abiertos = { sucursalId: ctx.sucursalId, estado: { in: ['ABIERTO', 'EN_PROCESO'] as ('ABIERTO' | 'EN_PROCESO')[] } };
      const [vencidos, urgentes] = await Promise.all([
        this.prisma.caso.findMany({ where: { ...abiertos, venceEn: { lte: new Date() } }, select: { id: true }, orderBy: { id: 'desc' } }),
        this.prisma.caso.count({ where: { ...abiertos, prioridad: 'URGENTE' } }),
      ]);
      if (vencidos.length) lista.push({ id: `casos-vencidos:${vencidos[0].id}:${vencidos.length}`, tipo: 'caso', nivel: 'critico', titulo: `${vencidos.length} caso(s) con el plazo vencido`, detalle: 'Atiéndalos o cambie su prioridad.', ruta: '/home/casos' });
      if (urgentes) lista.push({ id: `casos-urgentes:${urgentes}`, tipo: 'caso', nivel: 'aviso', titulo: `${urgentes} caso(s) urgente(s) abiertos`, detalle: 'Revise los casos de la flota.', ruta: '/home/casos' });
    }
    // Cuentas por cobrar: por vencer, vencidas, promesas incumplidas y viajes sin facturar
    if (puede('cobros.ver') && ctx.sucursalId) lista.push(...(await this.cobros.avisos(ctx.sucursalId)));
    // Taller: mantenimiento vencido o próximo y órdenes olvidadas
    if (puede('mantenimiento.ver') && ctx.sucursalId) lista.push(...(await this.taller.avisos(ctx)));
    // Incidentes: multas por vencer o vencidas, reclamos al seguro sin respuesta
    if (puede('incidentes.ver') && ctx.sucursalId) lista.push(...(await this.incidentes.avisos(ctx)));
    // Llantas: labrado en el mínimo o cerca, km excedidos y sin medir
    if (puede('llantas.ver')) lista.push(...(await this.llantas.avisos()));
    // Hechos de la última semana (pedido enviado, recibido…)
    lista.push(...(await this.notificaciones.eventosRecientes(ctx, puede)));
    // Visto / no visto (por usuario): las no vistas primero; las vistas siguen abajo, en gris
    const vistas = await this.notificaciones.vistas(ctx.usuario.sub, lista.map((n) => n.id));
    for (const n of lista) n.visto = vistas.has(n.id);
    lista.sort((x, y) => Number(x.visto) - Number(y.visto) || String(y.fecha ?? '9').localeCompare(String(x.fecha ?? '9')));
    return { data: lista };
  }

  /** Marcar como vistas (o no vistas) una o varias notificaciones. */
  @Put('vistas')
  async marcar(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const { claves, visto } = z.object({ claves: z.array(z.string().min(1).max(200)).min(1).max(300), visto: z.boolean().default(true) }).parse(body);
    await this.notificaciones.marcar(ctx.usuario.sub, claves, visto);
    return { message: visto ? 'Marcadas como vistas' : 'Marcadas como no vistas' };
  }
}
