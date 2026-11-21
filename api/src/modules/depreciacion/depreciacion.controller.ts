import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Permisos } from '../../common/auth/decoradores';
import { DepreciacionService } from '../../common/costos/depreciacion.service';
import { validar } from '../../common/pipes/zod';
import { parseFecha } from '../../common/fecha';

const consulta = z.object({
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

@ApiTags('finanzas')
@ApiBearerAuth()
@Controller('finanzas/depreciacion')
export class DepreciacionController {
  constructor(private readonly depreciacion: DepreciacionService) {}

  /** Valor en libros, acumulada, cuota del año, depreciación del período y por km de cada unidad, más la fiscal. */
  @Get()
  @Permisos('finanzas.costos')
  async tabla(@Query() q: unknown) {
    const f = validar(consulta, q);
    // «hasta» incluye todo ese día
    const hasta = f.hasta ? new Date(parseFecha(f.hasta).getTime() + 86_400_000 - 1) : undefined;
    return { data: await this.depreciacion.calcular({ hasta, desde: f.desde ? parseFecha(f.desde) : undefined }) };
  }
}

@Module({ controllers: [DepreciacionController] })
export class DepreciacionApiModule {}
