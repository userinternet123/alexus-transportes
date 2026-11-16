import { z } from 'zod';

// Carga .env si existe (Node >= 21.7). En contenedores se usan variables reales.
try {
  process.loadEnvFile();
} catch {
  /* sin archivo .env */
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL_SEG: z.coerce.number().int().positive().default(900), // 15 min
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  LOGIN_MAX_INTENTOS: z.coerce.number().int().positive().default(5),
  LOGIN_BLOQUEO_MINUTOS: z.coerce.number().int().positive().default(15),
  TZ_NEGOCIO: z.string().default('America/Guatemala'),
  // Instalación empaquetada: carpeta con el portal compilado (el API lo sirve en el mismo puerto)
  WEB_DIR: z.string().optional(),
  // Lectura de facturas con IA (foto o PDF). Sin clave, la función queda deshabilitada.
  IA_API_KEY: z.string().optional(),
  IA_MODELO: z.string().default('claude-haiku-5-5'), // alternativa más precisa: claude-sonnet-5-5
  IA_MODELO_AGENTE: z.string().default('claude-sonnet-5-5'), // agente de datos (necesita razonar y usar herramientas)
  IA_AGENTE_LIMITE_HORA: z.coerce.number().int().min(1).max(500).default(30), // preguntas por usuario por hora (controla el gasto)
  // Motor analítico en Python (temporadas, demanda). Corre en ESTE servidor o en la red de la empresa: los datos no salen.
  ANALITICA_URL: z.string().url().default('http://127.0.0.1:4100').refine((u) => {
    const h = new URL(u).hostname.replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '::1' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h);
  }, 'ANALITICA_URL debe estar en este equipo o en la red de la empresa: los datos del negocio no salen de ella'),
  ANALITICA_TOKEN: z.string().min(24, 'ANALITICA_TOKEN debe tener al menos 24 caracteres').optional(),
  // ALEXUS Central (panel del proveedor). Sin estos valores, el agente queda inactivo.
  CENTRAL_URL: z.string().url().optional(),
  CENTRAL_TOKEN: z.string().optional(),
  APP_VERSION: z.string().optional(), // lo escribe el instalador; si no, se lee del package.json
  FEL_PROVEEDOR: z.enum(['mock', 'infile', 'digifact']).default('mock'),
  FEL_URL: z.string().optional(),
  FEL_USUARIO: z.string().optional(),
  FEL_LLAVE: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fallar rápido: nunca arrancar con configuración inválida.
  console.error('❌ Variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
