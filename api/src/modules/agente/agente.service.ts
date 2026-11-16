import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { reglaNegocio } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { crearClienteClaude } from './agente.cliente';
import { construirContexto } from './agente.contexto';
import { limitarPorHora } from './agente.limite';
import { Herramientas } from './agente.herramientas';
import { ejecutarAgente, ErrorAgente, promptSistema, Turno } from './agente.orquestador';

export const EJEMPLOS = [
  '¿Cómo han ido las ventas de los últimos 12 meses?',
  '¿Cuáles son los 10 productos más vendidos este año?',
  '¿Cuánto venderé en los próximos 3 meses?',
  'Compara este mes contra el mismo mes del año pasado por categoría',
  '¿Qué día de la semana y a qué hora vendemos más?',
  '¿Qué productos están por agotarse?',
  '¿Qué mercadería lleva más de 90 días sin venderse?',
];
const EJEMPLOS_COSTOS = ['¿Cuánto ganamos cada mes este año?', '¿Cuánto compramos a cada proveedor este año?'];

@Injectable()
export class AgenteService {
  private readonly log = new Logger('Agente');

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  capacidades(ctx: Ctx) {
    return { data: { disponible: Boolean(env.IA_API_KEY), ejemplos: [...EJEMPLOS, ...(tienePermiso(ctx.usuario, 'finanzas.costos') ? EJEMPLOS_COSTOS : [])], limitePorHora: env.IA_AGENTE_LIMITE_HORA } };
  }

  async preguntar(ctx: Ctx, dto: { pregunta: string; historial: Turno[] }) {
    if (!env.IA_API_KEY) throw reglaNegocio('IA_NO_CONFIGURADA', 'Preguntar a los datos no está configurado en este servidor (falta IA_API_KEY). Comuníquese con su proveedor.');
    limitarPorHora(ctx.usuario.sub);
    const contexto = await construirContexto(this.prisma, ctx);
    const herramientas = new Herramientas(contexto);
    try {
      const s = await ejecutarAgente({
        pregunta: dto.pregunta, historial: dto.historial, modelo: env.IA_MODELO_AGENTE, herramientas,
        sistema: promptSistema({ hoy: contexto.hoy, sucursal: contexto.sucursalNombre, veCostos: contexto.veCostos }),
        llamar: crearClienteClaude({ apiKey: env.IA_API_KEY }),
      });
      // Auditoría: qué se preguntó y qué herramientas se usaron (no los datos devueltos)
      await this.audit.registrar(ctx, { accion: 'AGENTE_PREGUNTA', entidad: 'Agente', entidadId: String(ctx.usuario.sub), despues: { pregunta: dto.pregunta.slice(0, 300), herramientas: s.herramientas, uso: s.uso, modelo: env.IA_MODELO_AGENTE } });
      const meta = { herramientas: s.herramientas, uso: s.uso, modelo: env.IA_MODELO_AGENTE };
      return { data: s.tipo === 'respuesta' ? { tipo: 'respuesta', ...s.data, pregunta: dto.pregunta, meta, plantillaSugerida: herramientas.plantillaSugerida(contexto.hoy) } : { tipo: 'texto', explicacion: s.texto, pregunta: dto.pregunta, meta } };
    } catch (e) {
      if (e instanceof ErrorAgente) throw reglaNegocio('AGENTE', e.message);
      this.log.error(`Fallo del agente: ${(e as Error).message}`);
      throw e;
    }
  }
}
