import { LicenciasController } from './licencias.controller';
import { LicenciasService } from './licencias.service';
import { ExperienciaAgenteController, ExperienciaPanelController } from './experiencia.controller';
import { LlavesService } from './llaves.service';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AgenteController } from './agente.controller';
import { AdminGuard, InstalacionGuard } from './comun';
import { env } from './env';
import { AccesoController, PanelController } from './panel.controller';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    JwtModule.register({ global: true, secret: env.JWT_SECRET }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [AgenteController, AccesoController, PanelController, ExperienciaAgenteController, ExperienciaPanelController, LicenciasController],
  providers: [LlavesService, LicenciasService, PrismaService, InstalacionGuard, AdminGuard, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
