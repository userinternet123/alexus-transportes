import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DescuentosService } from './descuentos.service';
import { SecuenciasService } from './secuencias.service';
import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';

@Module({
  imports: [AuthModule],
  controllers: [VentasController],
  providers: [VentasService, DescuentosService, SecuenciasService],
  exports: [DescuentosService],
})
export class VentasModule {}
