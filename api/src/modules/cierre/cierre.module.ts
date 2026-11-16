import { Global, Module } from '@nestjs/common';
import { CierreController } from './cierre.controller';
import { CierreService } from './cierre.service';

@Global() // CierreService.validarPeriodoAbierto lo usan Ventas, Compras y Caja
@Module({ controllers: [CierreController], providers: [CierreService], exports: [CierreService] })
export class CierreModule {}
