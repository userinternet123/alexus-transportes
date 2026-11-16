import { Module } from '@nestjs/common';
import { AgenteController } from './agente.controller';
import { AgenteService } from './agente.service';
import { AnalisisController } from './analisis.controller';
import { AnalisisService } from './analisis.service';

@Module({ controllers: [AgenteController, AnalisisController], providers: [AgenteService, AnalisisService] })
export class AgenteModule {}
