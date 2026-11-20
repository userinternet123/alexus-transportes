import { LicenciaGuard } from './modules/licencia/licencia.guard';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { OcultarCostosInterceptor } from './common/auth/ocultar-costos';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { env } from './config/env';
import { AuditModule } from './common/audit/audit.service';
import { AuthGuard } from './common/auth/auth.guard';
import { ErroresFilter } from './common/filters/errores.filter';
import { ParametrosModule } from './common/parametros/parametros.service';
import { CargasLaboralesModule } from './common/costos/cargas-laborales';
import { PrismaModule } from './common/prisma/prisma.module';
import { ArchivosModule } from './modules/archivos/archivos.module';
import { LicenciaModule } from './modules/licencia/licencia.module';
import { CentralModule } from './modules/central/central.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { GastosModule } from './modules/gastos/gastos.module';
import { ViajesModule } from './modules/viajes/viajes.module';
import { CombustibleModule } from './modules/combustible/combustible.module';
import { InspeccionesModule } from './modules/inspecciones/inspecciones.module';
import { CasosModule } from './modules/casos/casos.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogosModule } from './modules/catalogos/catalogos.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { RrhhModule } from './modules/rrhh/rrhh.module';
import { SeguridadModule } from './modules/seguridad/seguridad.module';
import { SistemaModule } from './modules/sistema/sistema.module';

/**
 * MONOLITO MODULAR: cada módulo = un bounded context con fronteras claras.
 * Plataforma heredada de SPVI 2.0 (seguridad, licencias, Central, RRHH, gastos,
 * reportes) + dominio de transporte: flota, pilotos, viajes, combustible,
 * llantas y mantenimiento. Los catálogos (cabezales, remolques, rutas, tarifas,
 * pilotos, llantas, repuestos, planes) nacen del CRUD genérico; las operaciones
 * con reglas propias tienen su módulo: viajes (con cotizador y liquidación),
 * combustible e inspección pre viaje (fase 1); órdenes de trabajo y montajes de
 * llantas en las fases siguientes.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.NODE_ENV === 'production' ? 'info' : 'debug',
        genReqId: (req, res) => {
          const id = (req.headers['x-request-id'] as string) ?? randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'],
        transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    JwtModule.register({ global: true, secret: env.JWT_ACCESS_SECRET, signOptions: { expiresIn: env.JWT_ACCESS_TTL_SEG } }),
    // Infraestructura transversal
    PrismaModule,
    AuditModule,
    ParametrosModule,
    CargasLaboralesModule,
    ArchivosModule,
    LicenciaModule,
    CentralModule,
    NotificacionesModule,
    // Plataforma
    AuthModule,
    SeguridadModule,
    SistemaModule,
    CatalogosModule,
    // Operación de transporte
    ViajesModule,
    CombustibleModule,
    InspeccionesModule,
    CasosModule,
    // Gestión
    GastosModule,
    ReportesModule,
    RrhhModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    // Después de la sesión: sin licencia válida no se atiende nada salvo activarla
    { provide: APP_GUARD, useClass: LicenciaGuard },
    { provide: APP_INTERCEPTOR, useClass: OcultarCostosInterceptor },
    { provide: APP_FILTER, useClass: ErroresFilter },
  ],
})
export class AppModule {}
