import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { validar } from '../../common/pipes/zod';
import { ExperienciaService } from './experiencia.service';

/** EXPERIENCIA: consentimiento, uso del sistema, opiniones y perfil del negocio (para mejorar SPVI). */
@Controller('experiencia')
export class ExperienciaController {
  constructor(private readonly experiencia: ExperienciaService) {}

  @Get('estado') estado(@Contexto() ctx: Ctx) { return this.experiencia.estado(ctx); }

  @Put('consentimiento')
  @Permisos('config.parametros')
  consentimiento(@Contexto() ctx: Ctx, @Body() body: unknown) { return this.experiencia.consentimiento(ctx, validar(z.object({ acepta: z.boolean() }), body).acepta); }

  @Post('uso')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  uso(@Contexto() ctx: Ctx, @Body() body: unknown) { return this.experiencia.registrarUso(ctx, body); }

  @Post('opinion')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  opinion(@Contexto() ctx: Ctx, @Body() body: unknown) { return this.experiencia.opinar(ctx, body); }

  @Put('perfil')
  @Permisos('config.parametros')
  perfil(@Contexto() ctx: Ctx, @Body() body: unknown) { return this.experiencia.perfil(ctx, body); }
}
