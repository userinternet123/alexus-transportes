/**
 * TEMPORADAS: las define el dueño o las propone el motor analítico (Python, local). Con ellas se avisa qué comprar
 * con anticipación y se marca en "baja rotación" lo que solo está fuera de temporada.
 * Los cálculos los hace el motor; aquí se consulta la base (con permisos) y se le envían solo series de ventas.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { noEncontrado } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hoyGuatemala } from '../agente/agente.contexto';
import { llamarAnalitica } from './analitica.cliente';
import {
  armarSeries, debeAlertar, depurarPropuestas, desdeMeses, describirFechas, FilaVenta, Jerarquia, mesesDe, Propuesta, seSolapan, situacion, TemporadaDto, ventanasAnteriores,
} from './temporada.logica';

const MESES_HISTORIA = 36;
const AÑOS_DEMANDA = 3;
interface RespuestaDeteccion { series: { clave: string; nombre: string; motivo: string | null; indices: number[]; temporadas: { meses: number[]; factor: number; participacion: number; confianza: string; descripcion: string }[] }[] }
interface RespuestaDemanda { productos: { id: number; esperado: number | null; sugerido: number; cobertura: number | null; confianza: string; tendencia: string }[] }
export interface AlertaTemporada { temporadaId: number; nombre: string; inicio: string; diasParaInicio: number; productosPorComprar: number | null; unidadesSugeridas: number | null }

@Injectable()
export class TemporadasService {
  private readonly log = new Logger('Temporadas');
  private readonly cache = new Map<string, { hasta: number; datos: AlertaTemporada[] }>();
  private readonly calculando = new Set<string>();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private limpiarCache() { this.cache.clear(); }

  // ───────── Lista y edición ─────────
  async listar() {
    const hoy = hoyGuatemala();
    const filas = await this.prisma.temporada.findMany({ include: { alcance: true }, orderBy: [{ estado: 'asc' }, { inicioMes: 'asc' }, { inicioDia: 'asc' }] });
    const ids = (t: string) => [...new Set(filas.flatMap((f) => f.alcance.filter((a) => a.tipo === t).map((a) => a.refId)))];
    const [cats, grupos, subs, prods] = await Promise.all([
      this.prisma.categoria.findMany({ where: { id: { in: ids('CATEGORIA') } }, select: { id: true, nombre: true } }),
      this.prisma.grupo.findMany({ where: { id: { in: ids('GRUPO') } }, select: { id: true, nombre: true } }),
      this.prisma.subgrupo.findMany({ where: { id: { in: ids('SUBGRUPO') } }, select: { id: true, nombre: true } }),
      this.prisma.producto.findMany({ where: { id: { in: ids('PRODUCTO') } }, select: { id: true, nombre: true } }),
    ]);
    const nombres: Record<string, Map<number, string>> = { CATEGORIA: new Map(cats.map((x) => [x.id, x.nombre])), GRUPO: new Map(grupos.map((x) => [x.id, x.nombre])), SUBGRUPO: new Map(subs.map((x) => [x.id, x.nombre])), PRODUCTO: new Map(prods.map((x) => [x.id, x.nombre])) };
    return {
      data: filas.map((t) => ({
        ...t, factor: t.factor === null ? null : Number(t.factor), fechas: describirFechas(t), situacion: situacion(t, hoy), meses: mesesDe(t),
        alcance: t.alcance.map((a) => ({ tipo: a.tipo, refId: a.refId, nombre: nombres[a.tipo]?.get(a.refId) ?? `#${a.refId}` })),
      })),
    };
  }

  async crear(ctx: Ctx, d: TemporadaDto) {
    this.cache.clear(); // la campana debe enterarse del cambio al instante
    const t = await this.prisma.temporada.create({ data: { nombre: d.nombre, inicioMes: d.inicioMes, inicioDia: d.inicioDia, finMes: d.finMes, finDia: d.finDia, anticipacionDias: d.anticipacionDias, notas: d.notas ?? null, alcance: { createMany: { data: d.alcance, skipDuplicates: true } } } });
    await this.audit.registrar(ctx, { accion: 'TEMPORADA_CREAR', entidad: 'Temporada', entidadId: t.id, despues: { nombre: t.nombre } });
    this.limpiarCache();
    return { data: { id: t.id }, message: 'Temporada guardada' };
  }

  async actualizar(ctx: Ctx, id: number, d: TemporadaDto) {
    this.cache.clear(); // la campana debe enterarse del cambio al instante
    await this.existe(id);
    await this.prisma.enTransaccion(async (tx) => {
      await tx.temporada.update({ where: { id }, data: { nombre: d.nombre, inicioMes: d.inicioMes, inicioDia: d.inicioDia, finMes: d.finMes, finDia: d.finDia, anticipacionDias: d.anticipacionDias, notas: d.notas ?? null } });
      await tx.temporadaAlcance.deleteMany({ where: { temporadaId: id } });
      await tx.temporadaAlcance.createMany({ data: d.alcance.map((a) => ({ ...a, temporadaId: id })), skipDuplicates: true });
      await this.audit.registrar(ctx, { accion: 'TEMPORADA_EDITAR', entidad: 'Temporada', entidadId: id, despues: { nombre: d.nombre } }, tx);
    });
    this.limpiarCache();
    return { message: 'Cambios guardados' };
  }

  /** Confirmar una propuesta (ACTIVA), descartarla (no se vuelve a proponer) o pausar una temporada (INACTIVA). */
  async cambiarEstado(ctx: Ctx, id: number, estado: 'ACTIVA' | 'DESCARTADA' | 'INACTIVA') {
    this.cache.clear(); // la campana debe enterarse del cambio al instante
    const t = await this.existe(id);
    await this.prisma.temporada.update({ where: { id }, data: { estado } });
    await this.audit.registrar(ctx, { accion: 'TEMPORADA_ESTADO', entidad: 'Temporada', entidadId: id, antes: { estado: t.estado }, despues: { estado } });
    this.limpiarCache();
    return { message: estado === 'ACTIVA' ? 'Temporada activa' : estado === 'DESCARTADA' ? 'Propuesta descartada: no se volverá a proponer' : 'Temporada en pausa' };
  }

  async eliminar(ctx: Ctx, id: number) {
    this.cache.clear(); // la campana debe enterarse del cambio al instante
    const t = await this.existe(id);
    await this.prisma.temporada.delete({ where: { id } });
    await this.audit.registrar(ctx, { accion: 'TEMPORADA_ELIMINAR', entidad: 'Temporada', entidadId: id, antes: { nombre: t.nombre } });
    this.limpiarCache();
    return { message: 'Temporada eliminada' };
  }

  private async existe(id: number) {
    const t = await this.prisma.temporada.findUnique({ where: { id } });
    if (!t) throw noEncontrado('Temporada', id);
    return t;
  }

  // ───────── Detección (motor analítico) ─────────
  async detectar(ctx: Ctx) {
    this.cache.clear(); // la campana debe enterarse del cambio al instante
    const hoy = hoyGuatemala();
    const actual = hoy.slice(0, 7);
    const finExclusivo = `${actual}-01`; // el mes en curso está incompleto: no se usa
    const inicio = new Date(Date.UTC(Number(actual.slice(0, 4)), Number(actual.slice(5, 7)) - 1 - MESES_HISTORIA, 1)).toISOString().slice(0, 7); // 36 meses completos
    // Toda la empresa (todas las sucursales): la temporada es del negocio; la demanda se calcula por sucursal
    const filas = await this.prisma.$queryRaw<FilaVenta[]>`
      SELECT to_char(date_trunc('month', v.fecha_contable), 'YYYY-MM') AS mes, sg.id AS subgrupo_id, sg.nombre AS subgrupo,
             gr.id AS grupo_id, gr.nombre AS grupo, c.id AS categoria_id, c.nombre AS categoria, SUM(d.subtotal)::float8 AS total
      FROM ventas_detalle d JOIN ventas v ON v.id = d.venta_id JOIN productos p ON p.id = d.producto_id
      JOIN subgrupos sg ON sg.id = p.subgrupo_id JOIN grupos gr ON gr.id = sg.grupo_id JOIN categorias c ON c.id = gr.categoria_id
      WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA' AND v.fecha_contable >= ${`${inicio}-01`}::date AND v.fecha_contable < ${finExclusivo}::date
      GROUP BY 1, 2, 3, 4, 5, 6, 7`;
    const series = armarSeries(filas, inicio, MESES_HISTORIA);
    if (!series.length) return { data: { analizadas: 0, nuevas: 0, actualizadas: 0, omitidas: 0, sinHistoria: 0 }, message: 'No hay ventas suficientes para buscar temporadas.' };
    const r = await llamarAnalitica<RespuestaDeteccion>('/v1/temporadas/detectar', { series, umbral: 1.4, minimo_mensual: 200 }, 60_000);
    const propuestas: Propuesta[] = r.series.flatMap((s) => s.temporadas.map((t) => {
      const [tipo, id] = s.clave.split(':');
      return { tipo: tipo as Propuesta['tipo'], refId: Number(id), nombre: s.nombre.split(' › ').pop()!, meses: t.meses, factor: t.factor, participacion: t.participacion, confianza: t.confianza, descripcion: t.descripcion, indices: s.indices };
    }));
    const j: Jerarquia = { grupoDeSubgrupo: new Map(filas.map((f) => [f.subgrupo_id, f.grupo_id])), categoriaDeGrupo: new Map(filas.map((f) => [f.grupo_id, f.categoria_id])) };
    const existentes = await this.prisma.temporada.findMany({ include: { alcance: true } });
    let nuevas = 0; let actualizadas = 0; let omitidas = 0;
    for (const p of depurarPropuestas(propuestas, j)) {
      const igual = existentes.find((t) => t.alcance.some((a) => a.tipo === p.tipo && a.refId === p.refId) && seSolapan(mesesDe(t), p.meses));
      const datos = { factor: new Prisma.Decimal(p.factor), confianza: p.confianza, indices: p.indices as unknown as Prisma.InputJsonValue, notas: p.descripcion };
      if (igual?.estado === 'PROPUESTA') { await this.prisma.temporada.update({ where: { id: igual.id }, data: datos }); actualizadas += 1; continue; }
      if (igual) { omitidas += 1; continue; } // ya existe (confirmada, en pausa o descartada por el dueño)
      await this.prisma.temporada.create({ data: { ...datos, ...desdeMeses(p.meses), nombre: `Temporada de ${p.nombre}`.slice(0, 80), estado: 'PROPUESTA', origen: 'DETECTADA', anticipacionDias: 45, alcance: { create: [{ tipo: p.tipo, refId: p.refId }] } } });
      nuevas += 1;
    }
    await this.audit.registrar(ctx, { accion: 'TEMPORADA_DETECTAR', entidad: 'Temporada', entidadId: 0, despues: { analizadas: series.length, nuevas, actualizadas } });
    return {
      data: { analizadas: series.length, nuevas, actualizadas, omitidas, sinHistoria: r.series.filter((s) => s.motivo?.startsWith('historia')).length },
      message: nuevas ? `Se encontraron ${nuevas} temporadas nuevas para revisar` : 'No se encontraron temporadas nuevas',
    };
  }

  // ───────── Compras sugeridas (motor analítico) ─────────
  async compras(ctx: Ctx, id: number) {
    const t = await this.prisma.temporada.findUnique({ where: { id } });
    if (!t) throw noEncontrado('Temporada', id);
    const hoy = hoyGuatemala();
    const ventanas = ventanasAnteriores(t, hoy, AÑOS_DEMANDA);
    const s = situacion(t, hoy);
    if (!ventanas.length) return { data: { temporada: { id: t.id, nombre: t.nombre, ...s }, ventanas, productos: [] } };
    const hist = await this.prisma.$queryRaw<{ id: number; n: number; unidades: number }[]>`
      WITH prod AS (
        SELECT p.id FROM productos p JOIN subgrupos sg ON sg.id = p.subgrupo_id JOIN grupos gr ON gr.id = sg.grupo_id
        WHERE p.activo AND EXISTS (SELECT 1 FROM temporadas_alcance ta WHERE ta.temporada_id = ${id}
          AND ((ta.tipo = 'PRODUCTO' AND ta.ref_id = p.id) OR (ta.tipo = 'SUBGRUPO' AND ta.ref_id = sg.id) OR (ta.tipo = 'GRUPO' AND ta.ref_id = gr.id) OR (ta.tipo = 'CATEGORIA' AND ta.ref_id = gr.categoria_id)))
        LIMIT 10000
      )
      SELECT prod.id, w.n::int AS n, COALESCE(SUM(d.cantidad), 0)::float8 AS unidades
      FROM prod CROSS JOIN unnest(${ventanas.map((v) => v.inicio)}::date[], ${ventanas.map((v) => v.fin)}::date[]) WITH ORDINALITY AS w(desde, hasta, n)
      LEFT JOIN (ventas_detalle d JOIN ventas v ON v.id = d.venta_id AND v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA' AND v.sucursal_id = ${ctx.sucursalId!})
        ON d.producto_id = prod.id AND v.fecha_contable BETWEEN w.desde AND w.hasta
      GROUP BY 1, 2`;
    const ids = [...new Set(hist.map((h) => h.id))];
    if (!ids.length) return { data: { temporada: { id: t.id, nombre: t.nombre, ...s }, ventanas, productos: [] } };
    const existencias = await this.prisma.$queryRaw<{ producto_id: number; existencia: number }[]>`
      SELECT e.producto_id, SUM(e.cantidad)::float8 AS existencia FROM existencias e JOIN bodegas b ON b.id = e.bodega_id
      WHERE b.sucursal_id = ${ctx.sucursalId!} AND e.producto_id = ANY(${ids}::int[]) GROUP BY 1`;
    const ex = new Map(existencias.map((e) => [e.producto_id, Number(e.existencia)]));
    const porProducto = new Map<number, number[]>();
    for (const h of hist) { const a = porProducto.get(h.id) ?? new Array(ventanas.length).fill(0); a[h.n - 1] = Number(h.unidades); porProducto.set(h.id, a); }
    const r = await llamarAnalitica<RespuestaDemanda>('/v1/temporadas/demanda', { productos: [...porProducto].map(([pid, historial]) => ({ id: pid, historial, existencia: ex.get(pid) ?? 0 })), seguridad: 0.15 }, 60_000);
    const conVentas = r.productos.filter((p) => p.esperado !== null).slice(0, 300);
    const info = new Map((await this.prisma.producto.findMany({ where: { id: { in: conVentas.map((p) => p.id) } }, select: { id: true, nombre: true, sku: true } })).map((p) => [p.id, p]));
    return {
      data: {
        temporada: { id: t.id, nombre: t.nombre, fechas: describirFechas(t), ...s }, ventanas,
        productos: conVentas.map((p) => ({ ...p, nombre: info.get(p.id)?.nombre ?? `#${p.id}`, sku: info.get(p.id)?.sku ?? '', existencia: ex.get(p.id) ?? 0, historial: porProducto.get(p.id) })),
      },
    };
  }

  // ───────── Avisos (campana) ─────────
  async alertas(ctx: Ctx): Promise<AlertaTemporada[]> {
    const hoy = hoyGuatemala();
    const salida: AlertaTemporada[] = [];
    for (const t of await this.prisma.temporada.findMany({ where: { estado: 'ACTIVA' } })) {
      if (!debeAlertar(t, hoy)) continue;
      const s = situacion(t, hoy);
      // Si el motor analítico no responde, igual se avisa que la temporada viene (sin el cálculo de compras)
      const c = await this.compras(ctx, t.id).catch((e) => { this.log.warn(`Compras de «${t.nombre}» sin calcular: ${(e as Error).message}`); return null; });
      if (!c) { salida.push({ temporadaId: t.id, nombre: t.nombre, inicio: s.ventana.inicio, diasParaInicio: s.diasParaInicio, productosPorComprar: null, unidadesSugeridas: null }); continue; }
      const faltan = c.data.productos.filter((p) => p.sugerido > 0);
      salida.push({ temporadaId: t.id, nombre: t.nombre, inicio: s.ventana.inicio, diasParaInicio: s.diasParaInicio, productosPorComprar: faltan.length, unidadesSugeridas: faltan.reduce((a, p) => a + p.sugerido, 0) });
    }
    return salida;
  }

  /** Para la campana: responde al instante con lo calculado (válido 6 horas); si no hay, lo calcula en segundo plano. */
  alertasEnCache(ctx: Ctx): AlertaTemporada[] {
    const clave = `${ctx.sucursalId}:${hoyGuatemala()}`;
    const c = this.cache.get(clave);
    if (c && c.hasta > Date.now()) return c.datos;
    if (!this.calculando.has(clave)) {
      this.calculando.add(clave);
      this.alertas(ctx).then((datos) => this.cache.set(clave, { hasta: Date.now() + 6 * 3_600_000, datos }))
        .catch((e) => this.log.warn(`Avisos de temporada no calculados: ${(e as Error).message}`))
        .finally(() => this.calculando.delete(clave));
    }
    return c?.datos ?? [];
  }
}
