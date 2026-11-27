import { Module } from '@nestjs/common';
import { LlantasController } from './llantas.controller';
import { LlantasService } from './llantas.service';

@Module({ controllers: [LlantasController], providers: [LlantasService], exports: [LlantasService] })
export class LlantasModule {}
