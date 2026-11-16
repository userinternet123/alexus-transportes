import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { prohibido, reglaNegocio } from '../../common/errors';
import { D } from '../../common/money';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { crearClienteClaude } from '../agente/agente.cliente';
import { ErrorAgente, LlamarClaude } from '../agente/agente.orquestador';
import { LicenciaService } from '../licencia/licencia.service';
import { DescuentosService } from '../ventas/descuentos.service';
import { consultaCandidatos, consultaMemoria } from './lista.consultas';
import {
  Candidato, Duda, ErrorLista, HERRAMIENTA_ELECCION, HERRAMIENTA_EXTRACCION, interpretarEleccion, interpretarExtraccion, normalizarTexto,
  promptEleccion, resolver, SISTEMA_ELECCION, SISTEMA_EXTRACCION,
} from './lista.logica';

const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

@Injectable()
export class ListaService {
  private readonly log = new Logger('Listas');
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly licencia: LicenciaService,
    private readonly descuentos: DescuentosService,
  ) {}

  async capacidades() {
    const iaEnPlan = (await this.licencia.estado()).modulos.includes('ia');
    return { data: { ia: iaEnPlan && Boolean(env.IA_API_KEY), iaEnPlan, iaConfigurada: Boolean(env.IA_API_KEY) } };
  }

  private async verificar() {
    if (!(await this.licencia.estado()).modulos.includes('ia')) throw prohibido('Su plan no incluye la lectura de listas con IA.');
    if (!env.IA_API_KEY) throw reglaNegocio('IA_NO_CONFIGURADA', 'La lectura con IA no está configurada en este servidor (falta IA_API_KEY).');
  }

  async leer(ctx: Ctx, base64: string, mime: (typeof MIMES)[number]) {
    await this.verificar();
    const llamar: LlamarClaude = crearClienteClaude({ apiKey: env.IA_API_KEY! });
    const datos = base64.replace(/^data:[^;]+;base64,/, '');
    const adjunto = mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mime, data: datos } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: datos } };
    try {
      // 1. Visión: la IA lee los renglones
      const lectura = await llamar({
        model: env.IA_MODELO, max_tokens: 6000, system: SISTEMA_EXTRACCION, tools: [HERRAMIENTA_EXTRACCION], tool_choice: { type: 'tool', name: HERRAMIENTA_EXTRACCION.name },
        messages: [{ role: 'user', content: [adjunto, { type: 'text', text: 'Lee esta lista y regístrala.' }] }],
      });
      const lista = interpretarExtraccion(lectura.content as never);
      const textos = lista.renglones.map((r) => normalizarTexto(r.texto));

      // 2. Memoria y recuperación de candidatos del catálogo (solo lectura)
      const m = consultaMemoria(textos); const c = consultaCandidatos(textos);
      const [filasMem, filasCand] = await Promise.all([
        this.prisma.$queryRawUnsafe<{ texto: string; producto_id: number }[]>(m.texto, ...m.valores),
        this.prisma.$queryRawUnsafe<{ idx: number; id: number; puntaje: number }[]>(c.texto, ...c.valores),
      ]);
      const memoria = new Map(filasMem.map((f) => [f.texto, f.producto_id]));
      const candidatos = new Map<number, Candidato[]>();
      for (const f of filasCand) candidatos.set(f.idx, [...(candidatos.get(f.idx) ?? []), { id: f.id, puntaje: f.puntaje }]);

      // 3. Solo los renglones dudosos pasan a la IA, que elige ENTRE los candidatos
      const previo = resolver({ renglones: lista.renglones, memoria, candidatos, eleccion: new Map(), iaDisponible: true });
      // Sin IA y sin memoria, los ambiguos salen como DUDOSO: esos (y solo esos) se le consultan a la IA
      const aConsultar = previo.filter((x) => x.estado === 'DUDOSO' && (candidatos.get(x.indice) ?? []).length > 0);
      let eleccion = new Map<number, { productoId: number | null; confianza: 'alta' | 'media' | 'baja' }>();
      if (aConsultar.length) {
        const ids = [...new Set(aConsultar.flatMap((x) => (candidatos.get(x.indice) ?? []).map((k) => k.id)))];
        const prods = new Map((await this.prisma.producto.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, precioVenta: true } })).map((p) => [p.id, p]));
        const dudas: Duda[] = aConsultar.map((x) => ({
          indice: x.indice, texto: x.renglon.texto, nota: x.renglon.nota,
          candidatos: (candidatos.get(x.indice) ?? []).map((k) => ({ id: k.id, nombre: prods.get(k.id)!.nombre, precio: Number(prods.get(k.id)!.precioVenta) })),
        }));
        try {
          const r = await llamar({
            model: env.IA_MODELO, max_tokens: 3000, system: SISTEMA_ELECCION, tools: [HERRAMIENTA_ELECCION], tool_choice: { type: 'tool', name: HERRAMIENTA_ELECCION.name },
            messages: [{ role: 'user', content: promptEleccion(dudas) }],
          });
          eleccion = interpretarEleccion(r.content as never, dudas);
        } catch (e) {
          // Si la elección falla, la persona decide: la lectura de la lista no se pierde
          this.log.warn(`No se pudo consultar la elección de productos: ${(e as Error).message}`);
        }
      }
      const items = resolver({ renglones: lista.renglones, memoria, candidatos, eleccion, iaDisponible: eleccion.size > 0 });

      // 4. Datos completos de los productos, con la misma forma que el buscador del POS
      const idsFinal = [...new Set(items.flatMap((x) => [x.seleccionadoId, ...x.alternativasIds].filter((v): v is number => v != null)))];
      const productos = await this.prisma.producto.findMany({
        where: { id: { in: idsFinal }, activo: true },
        select: {
          id: true, sku: true, codigoBarra: true, nombre: true, precioVenta: true, manejaInventario: true, exentoIva: true, subgrupoId: true, imagenId: true, atributos: true,
          marca: { select: { nombre: true } }, presentacion: { select: { nombre: true, permiteDecimales: true } },
          existencias: { where: { bodega: { sucursalId: ctx.sucursalId ?? -1 } }, select: { cantidad: true } },
        } satisfies Prisma.ProductoSelect,
      });
      const topes = await this.descuentos.topesPara(this.prisma, ctx, productos);
      const porId = new Map(productos.map(({ existencias, ...p }) => [p.id, { ...p, existencia: existencias.reduce((a, e) => a.plus(D(e.cantidad)), D(0)), descuentoMaximo: topes.get(p.id)?.porcentajeMax ?? 0 }]));

      const data = items.map((x) => ({
        indice: x.indice, texto: x.renglon.texto, cantidad: x.renglon.cantidad, unidad: x.renglon.unidad, nota: x.renglon.nota,
        estado: x.seleccionadoId && !porId.has(x.seleccionadoId) ? 'NO_ENCONTRADO' : x.estado, origen: x.origen, confianza: x.confianza,
        seleccionado: x.seleccionadoId ? porId.get(x.seleccionadoId) ?? null : null,
        alternativas: x.alternativasIds.map((id) => porId.get(id)).filter(Boolean),
      }));
      const cuenta = (e: string) => data.filter((x) => x.estado === e).length;
      await this.audit.registrar(ctx, { accion: 'LISTA_LEIDA', entidad: 'Lista', entidadId: 'lectura', despues: { renglones: data.length, encontrados: cuenta('ENCONTRADO'), dudosos: cuenta('DUDOSO'), noEncontrados: cuenta('NO_ENCONTRADO'), consultaIA: aConsultar.length } });
      return { data: { titulo: lista.titulo, observaciones: lista.observaciones, recortada: lista.recortada, items: data, resumen: { total: data.length, encontrados: cuenta('ENCONTRADO'), dudosos: cuenta('DUDOSO'), noEncontrados: cuenta('NO_ENCONTRADO') } } };
    } catch (e) {
      if (e instanceof ErrorAgente || e instanceof ErrorLista) throw reglaNegocio('LECTURA_LISTA', (e as Error).message);
      throw e;
    }
  }

  /** El vendedor confirmó la lista: se recuerda qué producto corresponde a cada renglón. */
  async aprender(ctx: Ctx, asignaciones: { texto: string; productoId: number }[]) {
    const unicas = new Map<string, number>();
    for (const a of asignaciones) { const t = normalizarTexto(a.texto).slice(0, 150); if (t.length >= 2) unicas.set(t, a.productoId); }
    const existentes = new Set((await this.prisma.producto.findMany({ where: { id: { in: [...unicas.values()] }, activo: true }, select: { id: true } })).map((p) => p.id));
    let guardados = 0;
    for (const [texto, productoId] of unicas) {
      if (!existentes.has(productoId)) continue;
      await this.prisma.productoAlias.upsert({ where: { texto }, create: { texto, productoId }, update: { productoId, usos: { increment: 1 } } });
      guardados++;
    }
    return { data: { guardados } };
  }
}
