import { Global, Module } from '@nestjs/common';
import { CentralController } from './central.controller';
import { CentralService } from './central.service';

@Global() // el filtro global de errores informa a Central
@Module({ controllers: [CentralController], providers: [CentralService], exports: [CentralService] })
export class CentralModule {}
