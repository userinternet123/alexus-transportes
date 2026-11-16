import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { DefCampo, ErrorAtributo, normalizarAtributos } from './campos.logica';
import { construirInterno } from './codigo-barra';
import { LicenciaService } from '../licencia/licencia.service';
import { D } from '../../common/money';
import { validar, zBool, zIdOpt, zIdReq, zMonto, zNum, zPaginacion } from '../../common/pipes/zod';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { DescuentosService } from '../ventas/descuentos.service';
import { ArchivosService } from '../archivos/archivos.service';
import { fechaContable, sumarDias } from '../../common/fecha';

const productoSchema = z.object({
  sku: z.string().trim().toUpperCase().min(1).max(40),
  codigoBarra: z.string().trim().max(60).optional().nullable(),
  codigoProveedor: z.string().trim().max(60).optional().nullable(),
  nombre: z.string().trim().min(2).max(200),
  descripcion: z.string().trim().max(500).optional().nullable(),
  subgrupoId: zIdReq,
  marcaId: zIdOpt,
  presentacionId: zIdReq,
  precioVenta: zMonto,
  stockMinimo: zNum(z.number().nonnegative().optional()),
  manejaInventario: zBool.optional(),
  exentoIva: zBool.optional(),
  activo: zBool.optional(),
  imagenId: z.string().uuid().nullable().optional(),
  atributos: z.record(z.unknown()).optional(), // campos del giro: { medida: '205/55R16', rin: 16 }
});

const includeLista = {
  marca: { select: { id: true, nombre: true } },
  presentacion: { select: { id: true, nombre: true, permiteDecimales: true } },
  subgrupo: { select: { id: true, nombre: true, grupo: { select: { id: true, nombre: true, categoria: { select: { id: true, nombre: true } } } } } },
} satisfies Prisma.ProductoInclude;

@ApiTags('productos')
@ApiBearerAuth()
@Controller('productos')
export class ProductosController {
  /**
   * Valida los campos del giro según la categoría del producto. Los obligatorios se exigen solo
   * cuando el formulario envía los atributos (las altas rápidas del POS o de una factura no los frenan).
   */
  private async atributosPara(db: PrismaService | Tx, subgrupoId: number, atributos: Record<string, unknown> | undefined) {
    // Sin el paquete "Campos por giro" no se validan ni se modifican (los datos existentes se conservan)
    if (!(await this.licencia.estado()).modulos.includes('giros')) return null;
    const [campos, sg] = await Promise.all([
      db.campoProducto.findMany(),
      db.subgrupo.findUnique({ where: { id: subgrupoId }, select: { grupo: { select: { categoriaId: true } } } }),
    ]);
    try {
      return normalizarAtributos(campos as unknown as DefCampo[], sg?.grupo.categoriaId ?? null, atributos, atributos !== undefined);
    } catch (e) {
      if (e instanceof ErrorAtributo) throw reglaNegocio('ATRIBUTO_INVALIDO', e.message);
      throw e;
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly descuentos: DescuentosService,
    private readonly archivos: ArchivosService,
    private readonly licencia: LicenciaService,
  ) {}

  @Get()
  @Permisos('productos.ver')
  async listar(@Query() query: Record<string, string>, @Contexto() ctx: Ctx) {
    const { page, limit, q } = validar(zPaginacion, query);
    const where: Prisma.ProductoWhereInput = {
      ...(query.activo === 'todos' ? {} : { activo: query.activo !== 'false' }),
      ...(query.subgrupoId ? { subgrupoId: Number(query.subgrupoId) } : {}),
      ...(query.marcaId ? { marcaId: Number(query.marcaId) } : {}),
      ...(q
        ? { OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { codigoBarra: q }, { descripcion: { contains: q, mode: 'insensitive' } }, { textoBusqueda: { contains: q, mode: 'insensitive' } }] }
        : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.producto.count({ where }),
      this.prisma.producto.findMany({
        where,
        include: {
          ...includeLista,
          // Sin sucursal activa => filtro imposible (-1) para mantener un tipo de resultado estable
          existencias: { where: { bodega: { sucursalId: ctx.sucursalId ?? -1 } }, select: { cantidad: true } },
        },
        orderBy: { nombre: 'asc' },
        skip: limit > 0 ? (page - 1) * limit : 0,
        take: limit > 0 ? limit : 5000,
      }),
    ]);
    const data = filas.map(({ existencias, ...p }) => ({
      ...p,
      existencia: ctx.sucursalId ? existencias.reduce((acc, e) => acc.plus(D(e.cantidad)), D(0)) : null,
    }));
    return { data, meta: { page, limit, total } };
  }

  /**
   * Búsqueda optimizada para el POS / lector de código de barras:
   * coincidencia exacta (barra/SKU) primero, luego por nombre.
   * Devuelve precio, existencia en la sucursal y tope de descuento del usuario.
   */
  @Get('pos/buscar')
  @Permisos('ventas.crear')
  async buscarPos(@Query('q') q: string, @Contexto() ctx: Ctx, @Query('ids') ids?: string) {
    const texto = (q ?? '').trim();
    // ?ids=1,2,3: los productos de una cotización que pasa a venta, con precio y existencia de HOY
    const porIds = [...new Set((ids ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 300);
    if (texto.length < 1 && !porIds.length) return { data: [] };
    const select = {
      id: true, sku: true, codigoBarra: true, nombre: true, precioVenta: true, manejaInventario: true, exentoIva: true, subgrupoId: true, imagenId: true, atributos: true,
      marca: { select: { nombre: true } },
      presentacion: { select: { nombre: true, permiteDecimales: true } },
      existencias: { where: { bodega: { sucursalId: ctx.sucursalId ?? -1 } }, select: { cantidad: true } },
    } satisfies Prisma.ProductoSelect;

    let productos = porIds.length
      ? await this.prisma.producto.findMany({ where: { activo: true, id: { in: porIds } }, select })
      : await this.prisma.producto.findMany({
        where: { activo: true, OR: [{ codigoBarra: texto }, { sku: texto.toUpperCase() }] },
        select, take: 1,
      });
    if (!productos.length && !porIds.length) {
      productos = await this.prisma.producto.findMany({
        // Por nombre o por los campos buscables del giro ("205/55R16", un autor, un ISBN…)
        where: { activo: true, OR: [{ nombre: { contains: texto, mode: 'insensitive' } }, { textoBusqueda: { contains: texto, mode: 'insensitive' } }] },
        select, orderBy: { nombre: 'asc' }, take: 20,
      });
    }
    const topes = await this.descuentos.topesPara(this.prisma, ctx, productos);
    const data = productos.map(({ existencias, ...p }) => ({
      ...p,
      existencia: existencias.reduce((acc, e) => acc.plus(D(e.cantidad)), D(0)),
      descuentoMaximo: topes.get(p.id)?.porcentajeMax ?? 0,
    }));
    return { data };
  }

  /**
   * Accesos rápidos del POS: los más vendidos de los últimos 30 días en la
   * sucursal, con existencia. Si aún no hay ventas, los últimos creados.
   */
  @Get('pos/frecuentes')
  @Permisos('ventas.crear')
  async frecuentes(@Contexto() ctx: Ctx) {
    const desde = sumarDias(fechaContable(), -30);
    const top = await this.prisma.ventaDetalle.groupBy({
      by: ['productoId'],
      where: { venta: { sucursalId: ctx.sucursalId ?? -1, tipo: 'VENTA', estado: 'CONFIRMADA', fechaContable: { gte: desde } } },
      _sum: { cantidad: true },
      orderBy: { _sum: { cantidad: 'desc' } },
      take: 48,
    });
    const ids = top.map((t) => t.productoId);
    const select = {
      id: true, sku: true, codigoBarra: true, nombre: true, precioVenta: true, manejaInventario: true, exentoIva: true, subgrupoId: true, imagenId: true,
      marca: { select: { nombre: true } },
      presentacion: { select: { nombre: true, permiteDecimales: true } },
      existencias: { where: { bodega: { sucursalId: ctx.sucursalId ?? -1 } }, select: { cantidad: true } },
    } satisfies Prisma.ProductoSelect;
    const productos = ids.length
      ? await this.prisma.producto.findMany({ where: { id: { in: ids }, activo: true }, select })
      : await this.prisma.producto.findMany({ where: { activo: true }, select, orderBy: { id: 'desc' }, take: 48 });
    const orden = new Map(ids.map((id, i) => [id, i]));
    const topes = await this.descuentos.topesPara(this.prisma, ctx, productos);
    const data = productos
      .map(({ existencias, ...p }) => ({ ...p, existencia: existencias.reduce((a, e) => a.plus(D(e.cantidad)), D(0)), descuentoMaximo: topes.get(p.id)?.porcentajeMax ?? 0 }))
      .filter((p) => !p.manejaInventario || p.existencia.gt(0))
      .sort((a, b) => (orden.get(a.id) ?? 999) - (orden.get(b.id) ?? 999))
      .slice(0, 24);
    return { data };
  }

  @Get(':id')
  @Permisos('productos.ver')
  async obtener(@Param('id', ParseIntPipe) id: number) {
    const data = await this.prisma.producto.findUnique({
      where: { id },
      include: { ...includeLista, existencias: { include: { bodega: { select: { nombre: true, sucursal: { select: { nombre: true } } } } } } },
    });
    if (!data) throw noEncontrado('Producto', id);
    return { data };
  }

  @Get(':id/precios')
  @Permisos('productos.ver')
  async historialPrecios(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.prisma.historialPrecio.findMany({ where: { productoId: id }, orderBy: { id: 'desc' }, take: 100 }) };
  }

  /** Siguiente código de barras interno libre (EAN-13 de uso interno, prefijo 29), para productos que no traen uno. */
  @Post('codigo-barra/generar')
  @Permisos('productos.ver')
  async generarCodigoBarra(@Contexto() ctx: Ctx) {
    if (!tienePermiso(ctx.usuario, 'productos.crear') && !tienePermiso(ctx.usuario, 'productos.editar')) throw prohibido('No tiene permiso para crear códigos de barras');
    const [{ n }] = await this.prisma.$queryRaw<{ n: number }[]>`SELECT COALESCE(MAX(substr(codigo_barra, 3, 10)::bigint), 0)::float8 AS n FROM productos WHERE codigo_barra ~ '^29[0-9]{11}$'`;
    let siguiente = Number(n) + 1;
    for (let intento = 0; intento < 50; intento++, siguiente++) {
      const codigo = construirInterno(siguiente);
      if (!(await this.prisma.producto.findFirst({ where: { codigoBarra: codigo }, select: { id: true } }))) return { data: { codigo } };
    }
    throw reglaNegocio('CODIGO_NO_DISPONIBLE', 'No se pudo generar un código libre. Intente de nuevo.');
  }

  @Post()
  @Permisos('productos.crear')
  async crear(@Body() body: unknown, @Contexto() ctx: Ctx) {
    const dto = validar(productoSchema, body);
    const data = await this.prisma.enTransaccion(async (tx) => {
      const { atributos: enviados, ...resto } = dto;
      const giro = await this.atributosPara(tx, dto.subgrupoId, enviados);
      const p = await tx.producto.create({ data: { ...resto, ...(giro ?? {}) }, include: includeLista });
      await this.archivos.marcarPublico([dto.imagenId]);
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Producto', entidadId: p.id, despues: p }, tx);
      return p;
    });
    return { data, message: 'Producto creado' };
  }

  @Put(':id')
  @Permisos('productos.editar')
  async actualizar(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Contexto() ctx: Ctx) {
    const dto = validar(productoSchema.partial(), body);
    const data = await this.prisma.enTransaccion(async (tx) => {
      const antes = await tx.producto.findUnique({ where: { id } });
      if (!antes) throw noEncontrado('Producto', id);
      const cambiaPrecio = dto.precioVenta !== undefined && !D(antes.precioVenta).equals(D(dto.precioVenta));
      if (cambiaPrecio) {
        if (!tienePermiso(ctx.usuario, 'productos.precios')) throw prohibido('No tiene permiso para cambiar precios');
        await tx.historialPrecio.create({
          data: { productoId: id, precioAnterior: antes.precioVenta, precioNuevo: dto.precioVenta!, usuarioId: ctx.usuario.sub },
        });
      }
      // Campos del giro: solo si el formulario los envía (si no, se conservan los actuales)
      const { atributos: enviados, ...resto } = dto; // a la base solo llega el valor ya validado
      const extra = enviados !== undefined ? await this.atributosPara(tx, dto.subgrupoId ?? antes.subgrupoId, enviados) : null;
      const despues = await tx.producto.update({ where: { id }, data: { ...resto, ...(extra ?? {}) }, include: includeLista });
      await this.archivos.marcarPublico([dto.imagenId]);
      await this.audit.registrar(ctx, { accion: 'ACTUALIZAR', entidad: 'Producto', entidadId: id, antes, despues }, tx);
      return despues;
    });
    return { data, message: 'Producto actualizado' };
  }

  @Delete(':id')
  @Permisos('productos.eliminar')
  async desactivar(@Param('id', ParseIntPipe) id: number, @Contexto() ctx: Ctx) {
    await this.prisma.producto.update({ where: { id }, data: { activo: false } });
    await this.audit.registrar(ctx, { accion: 'DESACTIVAR', entidad: 'Producto', entidadId: id });
    return { message: 'Producto desactivado' };
  }
}
