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
import { PrismaModule } from './common/prisma/prisma.module';
import { ArchivosModule } from './modules/archivos/archivos.module';
import { LicenciaModule } from './modules/licencia/licencia.module';
import { CentralModule } from './modules/central/central.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { UbicacionesModule } from './modules/ubicaciones/ubicaciones.module';
import { CobrosModule } from './modules/cobros/cobros.module';
import { AgenteModule } from './modules/agente/agente.module';
import { ListaModule } from './modules/listas/lista.module';
import { DocumentosModule } from './modules/documentos/documentos.module';
import { TemporadasModule } from './modules/temporadas/temporadas.module';
import { FinanzasModule } from './modules/finanzas/finanzas.module';
import { ExperienciaModule } from './modules/experiencia/experiencia.module';
import { PedidosModule } from './modules/pedidos/pedidos.module';
import { GastosModule } from './modules/gastos/gastos.module';
import { AuthModule } from './modules/auth/auth.module';
import { CajaModule } from './modules/caja/caja.module';
import { CatalogosModule } from './modules/catalogos/catalogos.module';
import { CierreModule } from './modules/cierre/cierre.module';
import { ComprasModule } from './modules/compras/compras.module';
import { FelModule } from './modules/fel/fel.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { ProductosModule } from './modules/productos/productos.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { RrhhModule } from './modules/rrhh/rrhh.module';
import { SeguridadModule } from './modules/seguridad/seguridad.module';
import { SistemaModule } from './modules/sistema/sistema.module';
import { VentasModule } from './modules/ventas/ventas.module';

/**
 * MONOLITO MODULAR: cada módulo = un bounded context con fronteras claras.
 * Si mañana "Ventas/POS" necesita escalar aparte, se extrae a un servicio
 * sin reescribir el dominio (ver docs/02-arquitectura-objetivo.md).
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
    ArchivosModule,
    LicenciaModule,
    CentralModule,
    NotificacionesModule,
    UbicacionesModule,
    CobrosModule,
    AgenteModule,
    ListaModule,
    DocumentosModule,
    TemporadasModule,
    FinanzasModule,
    ExperienciaModule,
    PedidosModule,
    GastosModule,
    // Plataforma
    AuthModule,
    SeguridadModule,
    SistemaModule,
    CatalogosModule,
    // Operación
    InventarioModule,
    CierreModule,
    FelModule,
    ProductosModule,
    ComprasModule,
    VentasModule,
    CajaModule,
    // Gestión
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
