import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Contexto, Permisos, RequiereSucursal } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { aYmd, fechaContable, parseFecha, sumarDias } from '../../common/fecha';
import { validar, zFecha } from '../../common/pipes/zod';
import { CierreService } from './cierre.service';

@ApiTags('cierre')
@ApiBearerAuth()
@RequiereSucursal()
@Controller('cierres')
export class CierreController {
  constructor(private readonly cierre: CierreService) {}

  @Get()
  @Permisos('cierre.ver')
  listar(@Contexto() ctx: Ctx, @Query() q: Record<string, string>) {
    const hasta = q.hasta ? parseFecha(validar(zFecha, q.hasta)) : fechaContable();
    const desde = q.desde ? parseFecha(validar(zFecha, q.desde)) : sumarDias(hasta, -31);
    return this.cierre.listar(ctx, desde, hasta);
  }

  /** Pre-cierre: GET /cierres/2026-10-09/preview */
  @Get(':fecha/preview')
  @Permisos('cierre.ver')
  async preview(@Contexto() ctx: Ctx, @Param('fecha') fecha: string) {
    return { data: await this.cierre.previsualizar(ctx.sucursalId!, parseFecha(validar(zFecha, fecha))) };
  }

  @Post(':fecha')
  @Permisos('cierre.ejecutar')
  cerrar(@Contexto() ctx: Ctx, @Param('fecha') fecha: string, @Body() body: unknown) {
    const { observacion } = validar(z.object({ observacion: z.string().max(500).optional() }), body ?? {});
    return this.cierre.cerrar(ctx, parseFecha(validar(zFecha, fecha)), observacion);
  }

  @Post(':fecha/reabrir')
  @Permisos('cierre.reabrir')
  reabrir(@Contexto() ctx: Ctx, @Param('fecha') fecha: string, @Body() body: unknown) {
    const { motivo } = validar(z.object({ motivo: z.string().min(15, 'Explique el motivo (mín. 15 caracteres)').max(500) }), body);
    return this.cierre.reabrir(ctx, parseFecha(validar(zFecha, fecha)), motivo);
  }

  @Get('hoy')
  @Permisos('cierre.ver')
  hoy() {
    return { data: { fechaContable: aYmd(fechaContable()) } };
  }
}
