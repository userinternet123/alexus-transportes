import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Contexto, Permisos, RequiereSucursal } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { validar } from '../../common/pipes/zod';
import { AgenteService } from './agente.service';

const esquema = z.object({
  pregunta: z.string().trim().min(3, 'Escriba su pregunta').max(500, 'La pregunta es demasiado larga (máximo 500 letras)'),
  historial: z.array(z.object({ pregunta: z.string().max(500), respuesta: z.string().max(2000) })).max(6).default([]),
});

/** PREGUNTAR A LOS DATOS (IA con function calling). Módulo "Dashboard analítico": permiso reportes.analitica.agente. */
@Controller('agente')
@RequiereSucursal()
export class AgenteController {
  constructor(private readonly agente: AgenteService) {}

  @Get('capacidades')
  @Permisos('reportes.analitica.agente')
  capacidades(@Contexto() ctx: Ctx) {
    return this.agente.capacidades(ctx);
  }

  @Post('preguntar')
  @Permisos('reportes.analitica.agente')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  preguntar(@Contexto() ctx: Ctx, @Body() body: unknown) {
    return this.agente.preguntar(ctx, validar(esquema, body));
  }
}
