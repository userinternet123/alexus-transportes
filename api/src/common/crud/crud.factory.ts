import { LicenciaService } from '../../modules/licencia/licencia.service';
import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Put, Query, Type } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z, ZodObject, ZodRawShape } from 'zod';
import { AuditService } from '../audit/audit.service';
import { Contexto, Permisos } from '../auth/decoradores';
import type { Ctx } from '../auth/tipos';
import { noEncontrado, reglaNegocio } from '../errors';
import { validar, zPaginacion } from '../pipes/zod';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CRUD GENÉRICO — la contraparte en el backend del motor de formularios JSON
 *  del portal React. Un catálogo nuevo = UNA entrada de configuración, sin
 *  escribir controlador ni servicio. (Antes: un *UI.cs + *BLL.cs + *DAL.cs
 *  de ~600 líneas por cada catálogo.)
 *
 *  Contrato (compatible con FormActions / ListBase del portal):
 *    GET    /<ruta>?page=1&limit=25&q=texto&activo=true&<filtro>=valor
 *           -> { data: [...], meta: { page, limit, total } }
 *    GET    /<ruta>/:id          -> { data }
 *    POST   /<ruta>              -> { data, message }
 *    PUT    /<ruta>/:id          -> { data, message }
 *    DELETE /<ruta>/:id          -> baja lógica (activo=false)
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface GanchoCrud {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any;
  ctx: Ctx;
  licencia: LicenciaService;
}

export interface OpcionesCrud {
  /** Ruta REST, ej. 'catalogos/marcas' */
  ruta: string;
  /** Delegate de Prisma, ej. 'marca' (prisma.marca) */
  modelo: string;
  /** Prefijo de permiso: genera <permiso>.ver/.crear/.editar/.eliminar */
  permiso: string;
  /** Nombre legible para mensajes */
  entidad: string;
  /** Schema de creación (zod). La edición usa .partial() */
  schema: ZodObject<ZodRawShape>;
  /** Campos de texto para búsqueda ?q= (contains, case-insensitive) */
  busqueda?: string[];
  /** Campos numéricos filtrables por igualdad ?campo=valor */
  filtros?: string[];
  include?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'> | Record<string, unknown>[];
  /** Restringe y asigna sucursalId según el contexto */
  porSucursal?: boolean;
  /** Filtro fijo, ej. { esProveedor: true } */
  whereBase?: Record<string, unknown>;
  /** Valores fijos al crear, ej. { esProveedor: true } */
  datosBase?: Record<string, unknown>;
  /** Antes de crear (dentro de la transacción): validar límites o completar datos. */
  antesDeCrear?: (dto: Record<string, unknown>, h: GanchoCrud) => Promise<void>;
  /** Después de crear (misma transacción): crear lo que depende del registro nuevo. */
  despuesDeCrear?: (creado: { id: number } & Record<string, unknown>, h: GanchoCrud) => Promise<void>;
  /** Reglas adicionales al crear/editar. Retorna mensaje de error o null. */
  reglas?: (dto: Record<string, unknown>) => string | null;
  /** Campo de baja lógica (por defecto activo=true/false) */
  bajaLogica?: { campo: string; activo: unknown; inactivo: unknown };
}

const filtroActivo = z.enum(['true', 'false', 'todos']).optional();

export function crearCrudController(o: OpcionesCrud): Type<unknown> {
  const esquemaEdicion = o.schema.partial();
  const baja = o.bajaLogica ?? { campo: 'activo', activo: true, inactivo: false };
  const aplicarReglas = (dto: Record<string, unknown>) => {
    const error = o.reglas?.(dto);
    if (error) throw reglaNegocio('VALIDACION', error);
  };

  @ApiTags(o.ruta.split('/')[0])
  @ApiBearerAuth()
  @Controller(o.ruta)
  class CrudController {
    constructor(
      @Inject(PrismaService) private readonly prisma: PrismaService,
      @Inject(AuditService) private readonly audit: AuditService,
      @Inject(LicenciaService) private readonly licencia: LicenciaService,
    ) {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private get repo(): any {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.prisma as any)[o.modelo];
    }

    private whereBase(ctx: Ctx): Record<string, unknown> {
      const w: Record<string, unknown> = { ...(o.whereBase ?? {}) };
      if (o.porSucursal) {
        if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Seleccione sucursal');
        w.sucursalId = ctx.sucursalId;
      }
      return w;
    }

    @Get()
    @Permisos(`${o.permiso}.ver`)
    async listar(@Query() query: Record<string, string>, @Contexto() ctx: Ctx) {
      const { page, limit, q } = validar(zPaginacion, query);
      const activo = validar(filtroActivo, query.activo);
      const where: Record<string, unknown> = this.whereBase(ctx);

      if (activo !== 'todos') where[baja.campo] = activo === 'false' ? baja.inactivo : baja.activo;
      if (q && o.busqueda?.length) {
        where.OR = o.busqueda.map((campo) => ({ [campo]: { contains: q, mode: 'insensitive' } }));
      }
      for (const f of o.filtros ?? []) {
        if (query[f] !== undefined && query[f] !== '') where[f] = Number(query[f]);
      }

      const [total, data] = await this.prisma.$transaction([
        this.repo.count({ where }),
        this.repo.findMany({
          where,
          include: o.include,
          orderBy: o.orderBy ?? { id: 'desc' },
          ...(limit > 0 ? { skip: (page - 1) * limit, take: limit } : { take: 5000 }),
        }),
      ]);
      return { data, meta: { page, limit, total } };
    }

    @Get(':id')
    @Permisos(`${o.permiso}.ver`)
    async obtener(@Param('id', ParseIntPipe) id: number, @Contexto() ctx: Ctx) {
      const data = await this.repo.findFirst({ where: { id, ...this.whereBase(ctx) }, include: o.include });
      if (!data) throw noEncontrado(o.entidad, id);
      return { data };
    }

    @Post()
    @Permisos(`${o.permiso}.crear`)
    async crear(@Body() body: unknown, @Contexto() ctx: Ctx) {
      const dto = validar(o.schema, body);
      aplicarReglas(dto);
      if (o.porSucursal && !ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', `Elija la sucursal de trabajo (arriba, junto a su nombre) antes de crear: ${o.entidad.toLowerCase()} pertenece a una sucursal.`);
      const data = await this.prisma.enTransaccion(async (tx) => {
        const gancho = { tx, ctx, licencia: this.licencia };
        if (o.antesDeCrear) await o.antesDeCrear(dto as Record<string, unknown>, gancho);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const creado = await (tx as any)[o.modelo].create({
          data: { ...dto, ...(o.datosBase ?? {}), ...(o.porSucursal ? { sucursalId: ctx.sucursalId } : {}) },
          include: o.include,
        });
        if (o.despuesDeCrear) await o.despuesDeCrear(creado, gancho);
        await this.audit.registrar(ctx, { accion: 'CREAR', entidad: o.entidad, entidadId: creado.id, despues: creado }, tx);
        return creado;
      });
      return { data, message: `${o.entidad} creado(a) correctamente` };
    }

    @Put(':id')
    @Permisos(`${o.permiso}.editar`)
    async actualizar(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Contexto() ctx: Ctx) {
      const dto = validar(esquemaEdicion, body);
      const data = await this.prisma.enTransaccion(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const repo = (tx as any)[o.modelo];
        const antes = await repo.findFirst({ where: { id, ...this.whereBase(ctx) } });
        if (!antes) throw noEncontrado(o.entidad, id);
        aplicarReglas({ ...antes, ...dto });
        const despues = await repo.update({ where: { id }, data: dto, include: o.include });
        await this.audit.registrar(ctx, { accion: 'ACTUALIZAR', entidad: o.entidad, entidadId: id, antes, despues }, tx);
        return despues;
      });
      return { data, message: `${o.entidad} actualizado(a) correctamente` };
    }

    @Delete(':id')
    @Permisos(`${o.permiso}.eliminar`)
    async eliminar(@Param('id', ParseIntPipe) id: number, @Contexto() ctx: Ctx) {
      await this.prisma.enTransaccion(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const repo = (tx as any)[o.modelo];
        const antes = await repo.findFirst({ where: { id, ...this.whereBase(ctx) } });
        if (!antes) throw noEncontrado(o.entidad, id);
        // Baja lógica: nunca DELETE físico de datos maestros (integridad histórica)
        await repo.update({ where: { id }, data: { [baja.campo]: baja.inactivo } });
        await this.audit.registrar(ctx, { accion: 'DESACTIVAR', entidad: o.entidad, entidadId: id, antes }, tx);
      });
      return { message: `${o.entidad} desactivado(a) correctamente` };
    }
  }

  // Nombre único por catálogo (Nest y Swagger lo usan como identificador)
  const nombre = o.ruta.replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''));
  Object.defineProperty(CrudController, 'name', { value: `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}CrudController` });
  return CrudController;
}
