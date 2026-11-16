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
