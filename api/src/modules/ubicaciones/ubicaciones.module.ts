import { Module } from '@nestjs/common';
import { UbicacionesController } from './ubicaciones.controller';

@Module({ controllers: [UbicacionesController] })
export class UbicacionesModule {}
