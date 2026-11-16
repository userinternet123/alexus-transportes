/**
 * ANÁLISIS GUARDADOS: plantillas (consultas con períodos relativos) y tableros (varias plantillas juntas).
 * Son personales; el dueño las comparte con usuarios o roles. Se ejecutan SIN IA (gratis y al instante) y con los
 * permisos de quien las corre: si no puede ver costos, una plantilla que los use le dirá que su rol no lo permite.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { crearClienteClaude } from './agente.cliente';
import { construirContexto } from './agente.contexto';
import { explicarResultado } from './agente.explicador';
import { ContextoAgente, ErrorHerramienta, Herramientas } from './agente.herramientas';
import { limitarPorHora } from './agente.limite';
import { ErrorAgente } from './agente.orquestador';
import { Definicion, definicionZ, PeriodoToken, puedeVer, resolverDefinicion } from './agente.plantillas.logica';

type Objeto = 'PLANTILLA' | 'TABLERO';
export interface Destino { tipo: 'ROL' | 'USUARIO'; id: number }
const MAX_PLANTILLAS = 100;
const MAX_TABLEROS = 30;
const MAX_WIDGETS = 12;

@Injectable()
export class AnalisisService {
  private readonly log = new Logger('Analisis');
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ───────── Quién ve qué ─────────
  private async rolIds(ctx: Ctx): Promise<number[]> {
    if (!ctx.usuario.roles.length) return [];
    return (await this.prisma.rol.findMany({ where: { nombre: { in: ctx.usuario.roles } }, select: { id: true } })).map((r) => r.id);
  }

  /** Ids de lo que otros compartieron conmigo (directamente o por uno de mis roles). */
  private async compartidoConmigo(ctx: Ctx, objeto: Objeto): Promise<number[]> {
    const roles = await this.rolIds(ctx);
    const filas = await this.prisma.analiticaCompartida.findMany({
      where: { objeto, OR: [{ destinoTipo: 'USUARIO', destinoId: ctx.usuario.sub }, ...(roles.length ? [{ destinoTipo: 'ROL', destinoId: { in: roles } }] : [])] },
      select: { objetoId: true },
    });
    return filas.map((f) => f.objetoId);
  }

  /** A quién le compartí cada uno (con nombres, para mostrarlo). */
  private async compartidosDe(objeto: Objeto, ids: number[]) {
    const mapa = new Map<number, { tipo: 'ROL' | 'USUARIO'; id: number; nombre: string }[]>();
    if (!ids.length) return mapa;
    const filas = await this.prisma.analiticaCompartida.findMany({ where: { objeto, objetoId: { in: ids } } });
    const [roles, usuarios] = await Promise.all([
      this.prisma.rol.findMany({ where: { id: { in: filas.filter((f) => f.destinoTipo === 'ROL').map((f) => f.destinoId) } }, select: { id: true, nombre: true } }),
      this.prisma.usuario.findMany({ where: { id: { in: filas.filter((f) => f.destinoTipo === 'USUARIO').map((f) => f.destinoId) } }, select: { id: true, nombre: true } }),
    ]);
    const nombre = (t: string, id: number) => (t === 'ROL' ? roles : usuarios).find((x) => x.id === id)?.nombre ?? `#${id}`;
    for (const f of filas) mapa.set(f.objetoId, [...(mapa.get(f.objetoId) ?? []), { tipo: f.destinoTipo as 'ROL' | 'USUARIO', id: f.destinoId, nombre: nombre(f.destinoTipo, f.destinoId) }]);
    return mapa;
  }

  private async visibleOError(ctx: Ctx, objeto: Objeto, id: number, propietarioId: number) {
    const compartidos = await this.prisma.analiticaCompartida.findMany({ where: { objeto, objetoId: id }, select: { destinoTipo: true, destinoId: true } });
    if (!puedeVer({ propietarioId, compartidos }, ctx.usuario.sub, await this.rolIds(ctx))) throw noEncontrado(objeto === 'PLANTILLA' ? 'Análisis' : 'Tablero', id);
  }

  // ───────── Plantillas ─────────
  async listarPlantillas(ctx: Ctx) {
    const yo = ctx.usuario.sub;
    const conmigo = await this.compartidoConmigo(ctx, 'PLANTILLA');
    const filas = await this.prisma.plantillaAnalitica.findMany({ where: { OR: [{ propietarioId: yo }, { id: { in: conmigo } }] }, include: { propietario: { select: { id: true, nombre: true } } }, orderBy: { nombre: 'asc' } });
    const comp = await this.compartidosDe('PLANTILLA', filas.filter((f) => f.propietarioId === yo).map((f) => f.id));
    return { data: filas.map((f) => ({ id: f.id, nombre: f.nombre, descripcion: f.descripcion, definicion: f.definicion, propietario: f.propietario, esMia: f.propietarioId === yo, compartidaCon: f.propietarioId === yo ? comp.get(f.id) ?? [] : undefined, actualizadoEn: f.actualizadoEn })) };
  }

  async crearPlantilla(ctx: Ctx, d: { nombre: string; descripcion?: string | null; definicion: Definicion }) {
    if ((await this.prisma.plantillaAnalitica.count({ where: { propietarioId: ctx.usuario.sub } })) >= MAX_PLANTILLAS) throw reglaNegocio('LIMITE_PLANTILLAS', `Puede guardar hasta ${MAX_PLANTILLAS} análisis. Elimine alguno que ya no use.`);
    const p = await this.prisma.plantillaAnalitica.create({ data: { nombre: d.nombre, descripcion: d.descripcion ?? null, propietarioId: ctx.usuario.sub, definicion: d.definicion as unknown as Prisma.InputJsonValue } });
    await this.audit.registrar(ctx, { accion: 'ANALISIS_CREAR', entidad: 'PlantillaAnalitica', entidadId: p.id, despues: { nombre: p.nombre } });
    return { data: { id: p.id }, message: 'Análisis guardado' };
  }

  private async propia(ctx: Ctx, id: number) {
    const p = await this.prisma.plantillaAnalitica.findUnique({ where: { id } });
    if (!p) throw noEncontrado('Análisis', id);
    if (p.propietarioId !== ctx.usuario.sub) throw prohibido('Solo quien lo creó puede modificarlo. Puede guardar su propia copia.');
    return p;
  }

  async actualizarPlantilla(ctx: Ctx, id: number, d: { nombre?: string; descripcion?: string | null; definicion?: Definicion }) {
    await this.propia(ctx, id);
    await this.prisma.plantillaAnalitica.update({ where: { id }, data: { ...(d.nombre ? { nombre: d.nombre } : {}), ...(d.descripcion !== undefined ? { descripcion: d.descripcion } : {}), ...(d.definicion ? { definicion: d.definicion as unknown as Prisma.InputJsonValue } : {}) } });
    return { message: 'Cambios guardados' };
  }

  async eliminarPlantilla(ctx: Ctx, id: number) {
    const p = await this.propia(ctx, id);
    await this.prisma.enTransaccion(async (tx) => {
      await tx.analiticaCompartida.deleteMany({ where: { objeto: 'PLANTILLA', objetoId: id } });
      await tx.$executeRaw`UPDATE tableros_analiticos SET plantilla_ids = array_remove(plantilla_ids, ${id}::int)`;
      await tx.plantillaAnalitica.delete({ where: { id } });
      await this.audit.registrar(ctx, { accion: 'ANALISIS_ELIMINAR', entidad: 'PlantillaAnalitica', entidadId: id, antes: { nombre: p.nombre } }, tx);
    });
    return { message: 'Análisis eliminado' };
  }

  /** Reemplaza con quién se comparte. Solo el dueño. Los destinos deben existir y estar activos. */
  async compartir(ctx: Ctx, objeto: Objeto, id: number, destinos: Destino[]) {
    const dueno = objeto === 'PLANTILLA' ? await this.propia(ctx, id) : await this.propioTablero(ctx, id);
    const unicos = [...new Map(destinos.filter((d) => !(d.tipo === 'USUARIO' && d.id === ctx.usuario.sub)).map((d) => [`${d.tipo}:${d.id}`, d])).values()];
    const [roles, usuarios] = await Promise.all([
      this.prisma.rol.findMany({ where: { id: { in: unicos.filter((d) => d.tipo === 'ROL').map((d) => d.id) }, activo: true }, select: { id: true } }),
      this.prisma.usuario.findMany({ where: { id: { in: unicos.filter((d) => d.tipo === 'USUARIO').map((d) => d.id) }, activo: true }, select: { id: true } }),
    ]);
    const validos = unicos.filter((d) => (d.tipo === 'ROL' ? roles : usuarios).some((x) => x.id === d.id));
    await this.prisma.enTransaccion(async (tx) => {
      await tx.analiticaCompartida.deleteMany({ where: { objeto, objetoId: id } });
      if (validos.length) await tx.analiticaCompartida.createMany({ data: validos.map((d) => ({ objeto, objetoId: id, destinoTipo: d.tipo, destinoId: d.id })) });
      await this.audit.registrar(ctx, { accion: 'ANALISIS_COMPARTIR', entidad: objeto === 'PLANTILLA' ? 'PlantillaAnalitica' : 'TableroAnalitico', entidadId: id, despues: { nombre: dueno.nombre, destinos: validos } }, tx);
    });
    return { message: validos.length ? `Compartido con ${validos.length} ${validos.length === 1 ? 'destino' : 'destinos'}` : 'Ya no se comparte con nadie' };
  }

  // ───────── Ejecución (sin IA) ─────────
  private async correr(contexto: ContextoAgente, definicion: unknown, periodo: PeriodoToken | null, titulo?: string) {
    const parsed = definicionZ.safeParse(definicion);
    if (!parsed.success) throw new ErrorHerramienta('El análisis guardado ya no es válido. Edítelo o créelo de nuevo.');
    const { pasos, avisos } = resolverDefinicion(parsed.data, contexto.hoy, periodo);
    const h = new Herramientas(contexto);
    const id = await h.ejecutarPlan(pasos);
    const data = h.entregarPlantilla(id, titulo ?? parsed.data.titulo, parsed.data.salida.tipoGrafica, parsed.data.salida.columnasY);
    return { h, id, data: { ...data, avisos: [...data.avisos, ...avisos] } };
  }

  async ejecutarPlantilla(ctx: Ctx, id: number, o: { periodo?: PeriodoToken | null; explicar?: boolean }) {
    const p = await this.prisma.plantillaAnalitica.findUnique({ where: { id } });
    if (!p) throw noEncontrado('Análisis', id);
    await this.visibleOError(ctx, 'PLANTILLA', id, p.propietarioId);
    const contexto = await construirContexto(this.prisma, ctx);
    try {
      const r = await this.correr(contexto, p.definicion, o.periodo ?? null, p.nombre);
      let explicacion = '';
      if (o.explicar) {
        if (!tienePermiso(ctx.usuario, 'reportes.analitica.agente')) throw prohibido('Su rol no puede pedir explicaciones con IA.');
        if (!env.IA_API_KEY) throw reglaNegocio('IA_NO_CONFIGURADA', 'La explicación con IA no está configurada en este servidor.');
        limitarPorHora(ctx.usuario.sub);
        explicacion = await explicarResultado(crearClienteClaude({ apiKey: env.IA_API_KEY }), env.IA_MODELO_AGENTE, r.h.paraExplicar(r.id));
      }
      return { data: { tipo: 'respuesta', ...r.data, explicacion, plantilla: { id: p.id, nombre: p.nombre, esMia: p.propietarioId === ctx.usuario.sub }, meta: { sinIA: !o.explicar } } };
    } catch (e) {
      if (e instanceof ErrorHerramienta || e instanceof ErrorAgente) throw reglaNegocio('ANALISIS', e.message);
      throw e;
    }
  }

  // ───────── Tableros ─────────
  private async propioTablero(ctx: Ctx, id: number) {
    const t = await this.prisma.tableroAnalitico.findUnique({ where: { id } });
    if (!t) throw noEncontrado('Tablero', id);
    if (t.propietarioId !== ctx.usuario.sub) throw prohibido('Solo quien lo creó puede modificarlo.');
    return t;
  }

  /** Solo se pueden poner análisis que el dueño del tablero ya ve. */
  private async validarPlantillas(ctx: Ctx, ids: number[]) {
    const unicos = [...new Set(ids)];
    if (unicos.length > MAX_WIDGETS) throw reglaNegocio('MUCHOS_ANALISIS', `Un tablero admite hasta ${MAX_WIDGETS} análisis.`);
    const permitidas = new Set([...(await this.compartidoConmigo(ctx, 'PLANTILLA'))]);
    const mias = new Set((await this.prisma.plantillaAnalitica.findMany({ where: { propietarioId: ctx.usuario.sub, id: { in: unicos } }, select: { id: true } })).map((p) => p.id));
    const fuera = unicos.filter((i) => !mias.has(i) && !permitidas.has(i));
    if (fuera.length) throw reglaNegocio('ANALISIS_NO_DISPONIBLE', 'Algún análisis elegido no existe o no está disponible para usted.');
    return unicos;
  }

  async listarTableros(ctx: Ctx) {
    const yo = ctx.usuario.sub;
    const conmigo = await this.compartidoConmigo(ctx, 'TABLERO');
    const filas = await this.prisma.tableroAnalitico.findMany({ where: { OR: [{ propietarioId: yo }, { id: { in: conmigo } }] }, include: { propietario: { select: { id: true, nombre: true } } }, orderBy: { nombre: 'asc' } });
    const comp = await this.compartidosDe('TABLERO', filas.filter((f) => f.propietarioId === yo).map((f) => f.id));
    const nombres = new Map((await this.prisma.plantillaAnalitica.findMany({ where: { id: { in: filas.flatMap((f) => f.plantillaIds) } }, select: { id: true, nombre: true } })).map((p) => [p.id, p.nombre]));
    return { data: filas.map((f) => ({ id: f.id, nombre: f.nombre, propietario: f.propietario, esMio: f.propietarioId === yo, plantillaIds: f.plantillaIds, plantillas: f.plantillaIds.map((i) => ({ id: i, nombre: nombres.get(i) ?? '(eliminada)' })), compartidoCon: f.propietarioId === yo ? comp.get(f.id) ?? [] : undefined })) };
  }

  async crearTablero(ctx: Ctx, d: { nombre: string; plantillaIds: number[] }) {
    if ((await this.prisma.tableroAnalitico.count({ where: { propietarioId: ctx.usuario.sub } })) >= MAX_TABLEROS) throw reglaNegocio('LIMITE_TABLEROS', `Puede tener hasta ${MAX_TABLEROS} tableros.`);
    const t = await this.prisma.tableroAnalitico.create({ data: { nombre: d.nombre, propietarioId: ctx.usuario.sub, plantillaIds: await this.validarPlantillas(ctx, d.plantillaIds) } });
    await this.audit.registrar(ctx, { accion: 'TABLERO_CREAR', entidad: 'TableroAnalitico', entidadId: t.id, despues: { nombre: t.nombre } });
    return { data: { id: t.id }, message: 'Tablero guardado' };
  }

  async actualizarTablero(ctx: Ctx, id: number, d: { nombre?: string; plantillaIds?: number[] }) {
    await this.propioTablero(ctx, id);
    await this.prisma.tableroAnalitico.update({ where: { id }, data: { ...(d.nombre ? { nombre: d.nombre } : {}), ...(d.plantillaIds ? { plantillaIds: await this.validarPlantillas(ctx, d.plantillaIds) } : {}) } });
    return { message: 'Cambios guardados' };
  }

  async eliminarTablero(ctx: Ctx, id: number) {
    await this.propioTablero(ctx, id);
    await this.prisma.enTransaccion(async (tx) => {
      await tx.analiticaCompartida.deleteMany({ where: { objeto: 'TABLERO', objetoId: id } });
      await tx.tableroAnalitico.delete({ where: { id } });
    });
    return { message: 'Tablero eliminado' };
  }

  /** Corre todos los análisis del tablero con un período común opcional. Al compartir un tablero se comparten sus análisis (solo para verlos en él). */
  async ejecutarTablero(ctx: Ctx, id: number, periodo: PeriodoToken | null) {
    const t = await this.prisma.tableroAnalitico.findUnique({ where: { id } });
    if (!t) throw noEncontrado('Tablero', id);
    await this.visibleOError(ctx, 'TABLERO', id, t.propietarioId);
    const plantillas = await this.prisma.plantillaAnalitica.findMany({ where: { id: { in: t.plantillaIds } } });
    const contexto = await construirContexto(this.prisma, ctx);
    const widgets = await Promise.all(t.plantillaIds.map(async (pid) => {
      const p = plantillas.find((x) => x.id === pid);
      if (!p) return { plantillaId: pid, nombre: '(eliminado)', error: 'Este análisis ya no existe.' };
      try {
        const r = await this.correr(contexto, p.definicion, periodo, p.nombre);
        return { plantillaId: pid, nombre: p.nombre, resultado: { tipo: 'respuesta', ...r.data, explicacion: '' } };
      } catch (e) {
        if (e instanceof ErrorHerramienta) return { plantillaId: pid, nombre: p.nombre, error: e.message };
        this.log.error(`Falló el análisis ${pid} del tablero ${id}: ${(e as Error).message}`);
        return { plantillaId: pid, nombre: p.nombre, error: 'No se pudo calcular este análisis. Intente de nuevo.' };
      }
    }));
    return { data: { tablero: { id: t.id, nombre: t.nombre, esMio: t.propietarioId === ctx.usuario.sub }, periodo, widgets } };
  }

  /** Roles y usuarios con quienes se puede compartir. */
  async destinos(ctx: Ctx) {
    const [roles, usuarios] = await Promise.all([
      this.prisma.rol.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      this.prisma.usuario.findMany({ where: { activo: true, NOT: { id: ctx.usuario.sub } }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    ]);
    return { data: { roles, usuarios } };
  }
}
