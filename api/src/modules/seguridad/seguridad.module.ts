import { Module } from '@nestjs/common';
import { SeguridadController } from './seguridad.controller';

@Module({ controllers: [SeguridadController] })
export class SeguridadModule {}
