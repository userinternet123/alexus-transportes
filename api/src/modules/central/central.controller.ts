import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Contexto, Publico } from '../../common/auth/decoradores';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { reglaNegocio } from '../../common/errors';
import { validar } from '../../common/pipes/zod';
import { CentralService } from './central.service';

const sinCentral = () => reglaNegocio('CENTRAL_NO_CONFIGURADO', 'El soporte en línea no está configurado en este servidor. Comuníquese con su proveedor.');
const ofrecer = async <T>(fn: () => Promise<T>) => {
  try { return await fn(); } catch { throw reglaNegocio('CENTRAL_SIN_CONEXION', 'No hay conexión con el servicio de soporte. Revise el internet del servidor e intente de nuevo.'); }
};

@ApiTags('central')
@Controller('central')
export class CentralController {
  constructor(private readonly central: CentralService) {}

  /** Para el portal: anuncios del inicio, versión nueva (solo administradores) y respuestas de soporte. */
  @Get('estado')
  async estado(@Contexto() ctx: Ctx) {
    const e = await this.central.estado();
    return {
      data: {
        habilitado: this.central.habilitado,
        version: this.central.version,
        anuncios: e.anuncios.filter((a) => a.ubicaciones.includes('inicio')),
        actualizacion: tienePermiso(ctx.usuario, 'config.parametros') ? e.actualizacion : null,
        ticketsConRespuesta: e.ticketsConRespuesta,
      },
    };
  }

  /** Anuncios de la pantalla de ingreso (sin sesión). */
  @Publico()
  @Get('anuncios-publicos')
  async anunciosPublicos(@Query('ubicacion') ubicacion = 'login') {
    const e = await this.central.estado();
    return { data: e.anuncios.filter((a) => a.ubicaciones.includes(ubicacion)) };
  }

  @Publico()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('anuncios/:id/:tipo')
  metrica(@Param('id', ParseIntPipe) id: number, @Param('tipo') tipo: string) {
    if (tipo === 'impresion' || tipo === 'clic') this.central.registrarMetrica(id, tipo);
    return { ok: true };
  }

  /** Errores del portal (navegador) → se agrupan y se envían a Central. */
  @Post('errores-web')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  erroresWeb(@Body() body: unknown) {
    const e = validar(z.object({ mensaje: z.string().max(1000), stack: z.string().max(8000).optional(), ruta: z.string().max(300).optional() }), body);
    this.central.reportarError({ origen: 'web', ...e });
    return { ok: true };
  }

  @Post('soporte/tickets')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async crearTicket(@Contexto() ctx: Ctx, @Body() body: unknown) {
    if (!this.central.habilitado) throw sinCentral();
    const d = validar(z.object({
      asunto: z.string().trim().min(3).max(150), descripcion: z.string().trim().min(5).max(5000),
      captura: z.string().max(2_000_000).optional(),
      contexto: z.object({ pantalla: z.string().max(300).optional(), navegador: z.string().max(300).optional(), errores: z.array(z.string().max(500)).max(10).optional() }).optional(),
    }), body);
    return ofrecer(() => this.central.crearTicket({
      usuario: ctx.usuario.username, usuarioNombre: ctx.usuario.nombre, asunto: d.asunto, descripcion: d.descripcion, captura: d.captura,
      contexto: { ...d.contexto, sucursalId: ctx.sucursalId },
    }));
  }

  @Get('soporte/tickets')
  async tickets(@Contexto() ctx: Ctx) {
    if (!this.central.habilitado) return { data: [], habilitado: false };
    return ofrecer(() => this.central.tickets(ctx.usuario.username));
  }

  @Post('soporte/tickets/:id/mensajes')
  async responder(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    if (!this.central.habilitado) throw sinCentral();
    const { texto } = validar(z.object({ texto: z.string().trim().min(1).max(5000) }), body);
    return ofrecer(() => this.central.responder(id, ctx.usuario.nombre, texto));
  }
}
