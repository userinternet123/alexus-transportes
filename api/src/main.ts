import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from './config/env';

// BigInt (ids del kardex/auditoría) serializable a JSON
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // Fotos de comprobantes/logos viajan en base64 (≤ 3 MB => ~4 MB en JSON)
  app.useBodyParser('json', { limit: '6mb' });
  app.useLogger(app.get(Logger));
  app.use(
    helmet({
      // Red local por http (sin certificado): no forzar https ni HSTS
      hsts: false,
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'], // vistas previas de fotos y comprobantes
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'x-request-id'],
  });
  app.setGlobalPrefix('api/v1');

  // Instalación empaquetada: el mismo servidor publica el portal (un solo puerto, sin CORS)
  if (env.WEB_DIR && existsSync(join(env.WEB_DIR, 'index.html'))) {
    const indice = join(env.WEB_DIR, 'index.html');
    app.useStaticAssets(env.WEB_DIR, { index: false, maxAge: '7d', immutable: true });
    // Rutas del portal (React Router): todo GET que no sea del API devuelve index.html
    app.use((req: { method: string; path: string }, res: { sendFile: (f: string) => void }, next: () => void) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(indice);
      next();
    });
  }
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ALEXUS Transportes API')
      .setDescription('Punto de venta, inventario, caja, cierre, reportería y RRHH — multi-sucursal')
      .setVersion('2.0')
      .addBearerAuth()
      .addGlobalParameters({ name: 'X-Sucursal-Id', in: 'header', required: false, schema: { type: 'integer' } })
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(env.PORT);
  app.get(Logger).log(`ALEXUS Transportes API escuchando en :${env.PORT} (docs: /api/docs)`);
}

void bootstrap();
