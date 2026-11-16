/** Contexto de consulta del agente (y de las plantillas): sucursal, permiso de costos, fecha de hoy y acceso de solo lectura. */
import { veCostos } from '../../common/auth/ocultar-costos';
import { Ctx } from '../../common/auth/tipos';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Consulta } from './agente.consultas';
import { ContextoAgente } from './agente.herramientas';

export const hoyGuatemala = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());

/** Única puerta de entrada a la base: solo SELECT, en una transacción de solo lectura y con tope de 15 segundos. */
export function ejecutarLectura(prisma: PrismaService, c: Consulta): Promise<Record<string, unknown>[]> {
  if (!/^\s*(SELECT|WITH)\b/i.test(c.texto)) throw new Error('El agente solo puede ejecutar consultas de lectura');
  return prisma.enTransaccion(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 15000');
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return tx.$queryRawUnsafe<Record<string, unknown>[]>(c.texto, ...c.valores);
  });
}

export async function construirContexto(prisma: PrismaService, ctx: Ctx): Promise<ContextoAgente> {
  const sucursal = await prisma.sucursal.findUnique({ where: { id: ctx.sucursalId! }, select: { nombre: true } });
  return { sucursalId: ctx.sucursalId!, sucursalNombre: sucursal?.nombre ?? 'la sucursal', veCostos: veCostos(ctx), hoy: hoyGuatemala(), consultar: (c) => ejecutarLectura(prisma, c) };
}
