import { Module } from '@nestjs/common';
import { VentasModule } from '../ventas/ventas.module';
import { ProductosController } from './productos.controller';
import { CamposController } from './campos.controller';

@Module({ imports: [VentasModule], controllers: [ProductosController, CamposController] })
export class ProductosModule {}
