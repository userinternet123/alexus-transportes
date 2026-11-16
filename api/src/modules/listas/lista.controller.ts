import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Contexto, Permisos, RequiereSucursal } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { validar } from '../../common/pipes/zod';
import { ListaService } from './lista.service';

/** LISTAS DE ÚTILES: foto o PDF → renglones → productos del catálogo (para cotizar). */
@Controller('listas')
@RequiereSucursal()
export class ListaController {
  constructor(private readonly listas: ListaService) {}

  @Get('capacidades')
  @Permisos('ventas.cotizar')
  capacidades() {
    return this.listas.capacidades();
  }

  @Post('leer')
  @Permisos('ventas.cotizar')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  leer(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const { base64, mime } = validar(z.object({
      base64: z.string().min(100).max(6_000_000),
      mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    }), body);
    return this.listas.leer(ctx, base64, mime);
  }

  @Post('aprender')
  @Permisos('ventas.cotizar')
  aprender(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const { asignaciones } = validar(z.object({ asignaciones: z.array(z.object({ texto: z.string().min(2).max(200), productoId: z.coerce.number().int().positive() })).min(1).max(200) }), body);
    return this.listas.aprender(ctx, asignaciones);
  }
}
