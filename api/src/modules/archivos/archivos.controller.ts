import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { Contexto, Publico } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { validar } from '../../common/pipes/zod';
import { ArchivosService } from './archivos.service';

@ApiTags('archivos')
@Controller('archivos')
export class ArchivosController {
  constructor(private readonly archivos: ArchivosService) {}

  /** Subida en JSON base64 (fotos de comprobantes, logos). */
  @ApiBearerAuth()
  @Post()
  subir(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const dto = validar(z.object({ nombre: z.string().min(1).max(200), mime: z.string().max(60), base64: z.string().min(10) }), body);
    return this.archivos.subir(ctx, dto);
  }

  /** Imágenes públicas del negocio (logo, fondo del login). */
  @Publico()
  @Get('publico/:id')
  async publico(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.archivos.obtener(id, true);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // helmet pone "same-origin" por defecto y el navegador bloquearía la imagen si el portal está en otro puerto
    // (desarrollo: 5173 vs 4000). Son archivos públicos por diseño (logo, fondo, fotos de producto).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(a.datos));
  }

  /** Archivos privados (comprobantes): requieren sesión. */
  @ApiBearerAuth()
  @Get(':id')
  async obtener(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.archivos.obtener(id);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.nombre)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(a.datos));
  }
}
