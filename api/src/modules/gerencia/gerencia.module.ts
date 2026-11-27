import { Module } from '@nestjs/common';
import { GerenciaController } from './gerencia.controller';
import { GerenciaService } from './gerencia.service';

@Module({ controllers: [GerenciaController], providers: [GerenciaService], exports: [GerenciaService] })
export class GerenciaModule {}
