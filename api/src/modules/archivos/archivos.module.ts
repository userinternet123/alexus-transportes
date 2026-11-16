import { Global, Module } from '@nestjs/common';
import { ArchivosController } from './archivos.controller';
import { ArchivosService } from './archivos.service';

@Global()
@Module({ controllers: [ArchivosController], providers: [ArchivosService], exports: [ArchivosService] })
export class ArchivosModule {}
