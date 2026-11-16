import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Contexto } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { ReportesService } from './reportes.service';

@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  /** Catálogo de reportes disponibles para el usuario (metadata para el portal). */
  @Get()
  catalogo(@Contexto() ctx: Ctx) {
    return this.reportes.catalogo(ctx);
  }

  /** GET /reportes/ventas-por-dia?desde=2026-10-01&hasta=2026-10-09 */
  @Get(':clave')
  ejecutar(@Contexto() ctx: Ctx, @Param('clave') clave: string, @Query() q: Record<string, string>) {
    return this.reportes.ejecutar(ctx, clave, q);
  }

  @Get(':clave/excel')
  async excel(@Contexto() ctx: Ctx, @Param('clave') clave: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const { nombre, buffer } = await this.reportes.excel(ctx, clave, q);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(buffer);
  }
}
