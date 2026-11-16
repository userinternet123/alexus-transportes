import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import helmet from 'helmet';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { env } from './env';
import { PrismaService } from './prisma.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1); // detrás de Caddy (HTTPS)
  app.use(helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'blob:', 'https:'] } } }));
  app.useBodyParser('json', { limit: '4mb' }); // capturas de pantalla de los tickets
  // Dos direcciones hacia el mismo servicio: el panel (privado, detrás de Cloudflare Access) y las
  // tiendas. En la dirección de las tiendas solo existe /api/agente: el panel no se alcanza por ahí.
  const hostAgentes = env.HOST_AGENTES?.toLowerCase();
  if (hostAgentes) {
    app.use((req: { hostname?: string; path: string }, res: { status: (c: number) => { json: (b: unknown) => void } }, next: () => void) => {
      if ((req.hostname ?? '').toLowerCase() === hostAgentes && !req.path.startsWith('/api/agente/')) {
        res.status(404).json({ message: 'No encontrado' });
        return;
      }
      next();
    });
  }
  app.setGlobalPrefix('api');
  app.useStaticAssets(join(__dirname, '..', 'public')); // panel del proveedor

  // Primer usuario del panel
  const prisma = app.get(PrismaService);
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD && (await prisma.adminUsuario.count()) === 0) {
    await prisma.adminUsuario.create({ data: { email: env.ADMIN_EMAIL.toLowerCase(), nombre: 'Administrador', passwordHash: await argon2.hash(env.ADMIN_PASSWORD) } });
    Logger.log(`Usuario del panel creado: ${env.ADMIN_EMAIL}`, 'Central');
  }

  await app.listen(env.PORT);
  Logger.log(`SPVI Central escuchando en :${env.PORT}`, 'Central');
}
bootstrap();
