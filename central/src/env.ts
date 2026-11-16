import { z } from 'zod';

process.loadEnvFile?.('.env');

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  // Primer usuario del panel: se crea al arrancar si no existe ninguno
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  // Cada cuántas horas consultan los agentes (se les comunica en el latido)
  LATIDO_HORAS: z.coerce.number().min(1).max(48).default(6),
  // Dirección que usan las tiendas (CENTRAL_URL). Con Tailscale Funnel: https://<pc>.<tailnet>.ts.net
  URL_PUBLICA: z.string().url().optional(),
  // Dirección exclusiva de las tiendas (p. ej. agentes.alexusgt.com): en ese host solo se sirve /api/agente
  HOST_AGENTES: z.string().optional(),
});

export const env = esquema.parse(process.env);
