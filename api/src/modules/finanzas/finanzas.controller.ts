import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Permisos } from '../../common/auth/decoradores';
import { FinanzasService } from './finanzas.service';

/** SALUD FINANCIERA de toda la empresa. Requiere el análisis financiero y ver costos (sin costos no hay márgenes). */
@Controller('finanzas')
@Permisos('reportes.analitica.finanzas', 'finanzas.costos')
export class FinanzasController {
  constructor(private readonly finanzas: FinanzasService) {}

  @Get('salud')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  salud(@Query('comprasConIva') comprasConIva?: string) { return this.finanzas.salud(comprasConIva !== 'false'); }
}
