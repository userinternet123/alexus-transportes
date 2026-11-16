import { Global, Module } from '@nestjs/common';
import { LicenciaController } from './licencia.controller';
import { LicenciaService } from './licencia.service';

@Global() // el guard global, la sesión y los reportes consultan la licencia
@Module({ controllers: [LicenciaController], providers: [LicenciaService], exports: [LicenciaService] })
export class LicenciaModule {}
