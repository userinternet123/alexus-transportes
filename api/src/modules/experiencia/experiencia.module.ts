import { Module } from '@nestjs/common';
import { ExperienciaController } from './experiencia.controller';
import { ExperienciaService } from './experiencia.service';

@Module({ controllers: [ExperienciaController], providers: [ExperienciaService] })
export class ExperienciaModule {}
