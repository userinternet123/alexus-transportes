/**
 * Paquete de experiencia para SPVI Central (lo arma el agente de Central después de cada latido).
 * Solo lo que no se ha enviado; el uso, solo con consentimiento y de días ya cerrados.
 */
import { PrismaService } from '../../common/prisma/prisma.service';

export interface PaqueteExperiencia {
  consentimiento: boolean;
  uso: { fecha: string; evento: string; rol: string; dispositivo: string; veces: number }[];
  opiniones: { tipo: string; puntaje: number | null; texto: string | null; pantalla: string | null; contacto: string | null; rol: string | null; fecha: string }[];
  perfil: unknown | null;
}

export async function armarPaquete(prisma: PrismaService, hoy: string) {
  const params = Object.fromEntries((await prisma.parametroSistema.findMany({ where: { clave: { in: ['privacidad.uso', 'negocio.perfil', 'experiencia.enviado.perfil', 'experiencia.enviado.consentimiento'] } } })).map((p) => [p.clave, p.valor]));
  const consentimiento = params['privacidad.uso'] === 'si';
  const uso = consentimiento ? await prisma.usoDiario.findMany({ where: { enviado: false, fecha: { lt: new Date(`${hoy}T00:00:00Z`) } }, orderBy: { fecha: 'asc' }, take: 5000 }) : [];
  const opiniones = await prisma.opinion.findMany({ where: { enviado: false }, orderBy: { id: 'asc' }, take: 500 });
  const perfil = params['negocio.perfil'] && params['negocio.perfil'] !== params['experiencia.enviado.perfil'] ? params['negocio.perfil'] : null;
  const consentimientoCambio = (params['privacidad.uso'] ?? '') !== (params['experiencia.enviado.consentimiento'] ?? '') && params['privacidad.uso'] !== undefined;
  const paquete: PaqueteExperiencia = {
    consentimiento,
    uso: uso.map((u) => ({ fecha: u.fecha.toISOString().slice(0, 10), evento: u.evento, rol: u.rol, dispositivo: u.dispositivo, veces: u.veces })),
    opiniones: opiniones.map((o) => ({ tipo: o.tipo, puntaje: o.puntaje, texto: o.texto, pantalla: o.pantalla, contacto: o.contacto, rol: o.rol, fecha: o.creadoEn.toISOString() })),
    perfil: perfil ? JSON.parse(perfil) : null,
  };
  const hayAlgo = paquete.uso.length > 0 || paquete.opiniones.length > 0 || paquete.perfil !== null || consentimientoCambio;
  return {
    hayAlgo, paquete,
    /** Marcar como enviado SOLO después de que Central confirmó. */
    marcar: async () => {
      if (uso.length) await prisma.usoDiario.updateMany({ where: { id: { in: uso.map((u) => u.id) } }, data: { enviado: true } });
      if (opiniones.length) await prisma.opinion.updateMany({ where: { id: { in: opiniones.map((o) => o.id) } }, data: { enviado: true } });
      const guardar = (clave: string, valor: string) => prisma.parametroSistema.upsert({ where: { clave }, create: { clave, valor, tipo: 'texto', modulo: 'Privacidad', descripcion: 'Control de envío a SPVI Central' }, update: { valor } });
      if (perfil) await guardar('experiencia.enviado.perfil', perfil);
      if (params['privacidad.uso'] !== undefined) await guardar('experiencia.enviado.consentimiento', params['privacidad.uso']);
    },
  };
}
