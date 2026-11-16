/**
 * UBICACIONES FÍSICAS: árbol por bodega (Pasillo › Estante › División › Posición),
 * asignación a productos y a clasificaciones (herencia) y consulta de la ubicación efectiva.
 */
import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { conflicto, noEncontrado, reglaNegocio } from '../../common/errors';
import { validar } from '../../common/pipes/zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Arbol, CODIGO_VALIDO, codigoCompleto, descendientes, normalizarCodigo, UbicacionRef, ubicacionEfectiva } from './ubicaciones.logica';

const zId = z.coerce.number().int().positive();
const codigo = z.string().transform(normalizarCodigo).refine((c) => CODIGO_VALIDO.test(c), 'Código de 1 a 10 letras, números o guiones (por ejemplo P2, E2, D2, P15)');

@Controller('ubicaciones')
export class UbicacionesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async arbolClasificacion(): Promise<Arbol> {
    const [sg, g, c] = await Promise.all([
      this.prisma.subgrupo.findMany({ select: { id: true, padreId: true, grupoId: true, nombre: true } }),
      this.prisma.grupo.findMany({ select: { id: true, categoriaId: true, nombre: true } }),
      this.prisma.categoria.findMany({ select: { id: true, nombre: true } }),
    ]);
    return {
      subgrupos: new Map(sg.map((x) => [x.id, { padreId: x.padreId, grupoId: x.grupoId, nombre: x.nombre }])),
      grupos: new Map(g.map((x) => [x.id, { categoriaId: x.categoriaId, nombre: x.nombre }])),
      categorias: new Map(c.map((x) => [x.id, x.nombre])),
    };
  }

  /** Árbol de ubicaciones de una bodega, con cuántos productos tienen ubicación propia en cada una. */
  @Get()
  @Permisos('inventario.ver')
  async listar(@Query('bodegaId') bodegaId: string) {
    const id = Number(bodegaId);
    if (!id) throw reglaNegocio('BODEGA', 'Indique la bodega');
    const [ubicaciones, conteo, asignaciones] = await Promise.all([
      this.prisma.ubicacion.findMany({ where: { bodegaId: id }, orderBy: { codigoCompleto: 'asc' } }),
      this.prisma.existencia.groupBy({ by: ['ubicacionId'], where: { bodegaId: id, ubicacionId: { not: null } }, _count: true }),
      this.prisma.ubicacionClasificacion.findMany({ where: { bodegaId: id } }),
    ]);
    const productos = new Map(conteo.map((x) => [x.ubicacionId, x._count]));
    return { data: ubicaciones.map((u) => ({ ...u, productos: productos.get(u.id) ?? 0, clasificaciones: asignaciones.filter((a) => a.ubicacionId === u.id).map((a) => ({ tipo: a.tipo, refId: a.refId })) })) };
  }

  @Post()
  @Permisos('inventario.ubicaciones')
  async crear(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const d = validar(z.object({ bodegaId: zId, padreId: zId.nullable().optional(), codigo, nombre: z.string().trim().max(60).nullable().optional() }), body);
    const padre = d.padreId ? await this.prisma.ubicacion.findUnique({ where: { id: d.padreId } }) : null;
    if (d.padreId && (!padre || padre.bodegaId !== d.bodegaId)) throw reglaNegocio('PADRE', 'La ubicación superior debe ser de la misma bodega');
    const completo = codigoCompleto(padre?.codigoCompleto, d.codigo);
    if (await this.prisma.ubicacion.findUnique({ where: { bodegaId_codigoCompleto: { bodegaId: d.bodegaId, codigoCompleto: completo } } })) {
      throw conflicto('UBICACION_REPETIDA', `Ya existe la ubicación ${completo} en esta bodega`);
    }
    const u = await this.prisma.ubicacion.create({ data: { bodegaId: d.bodegaId, padreId: d.padreId ?? null, codigo: d.codigo, nombre: d.nombre ?? null, codigoCompleto: completo } });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Ubicacion', entidadId: u.id, despues: u });
    return { data: u, message: `Ubicación ${completo} creada` };
  }

  /** Ubicación propia de un producto en una bodega (null = quitar: vuelve a heredar de su clasificación). */
  @Put('producto')
  @Permisos('inventario.ubicaciones')
  async asignarProducto(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const d = validar(z.object({ productoId: zId, bodegaId: zId, ubicacionId: zId.nullable() }), body);
    if (d.ubicacionId) {
      const u = await this.prisma.ubicacion.findUnique({ where: { id: d.ubicacionId } });
      if (!u || u.bodegaId !== d.bodegaId) throw reglaNegocio('UBICACION', 'La ubicación no pertenece a esa bodega');
    }
    await this.prisma.existencia.upsert({
      where: { productoId_bodegaId: { productoId: d.productoId, bodegaId: d.bodegaId } },
      create: { productoId: d.productoId, bodegaId: d.bodegaId, ubicacionId: d.ubicacionId },
      update: { ubicacionId: d.ubicacionId },
    });
    await this.audit.registrar(ctx, { accion: 'UBICAR', entidad: 'Producto', entidadId: d.productoId, despues: d });
    return { message: d.ubicacionId ? 'Ubicación asignada' : 'Ubicación quitada: hereda la de su clasificación' };
  }

  /** Ubicación de una clasificación en una bodega: sus productos la heredan. */
  @Put('clasificacion')
  @Permisos('inventario.ubicaciones')
  async asignarClasificacion(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const d = validar(z.object({ bodegaId: zId, tipo: z.enum(['CATEGORIA', 'GRUPO', 'SUBGRUPO']), refId: zId, ubicacionId: zId.nullable() }), body);
    const clave = { bodegaId_tipo_refId: { bodegaId: d.bodegaId, tipo: d.tipo, refId: d.refId } };
    if (!d.ubicacionId) {
      await this.prisma.ubicacionClasificacion.deleteMany({ where: { bodegaId: d.bodegaId, tipo: d.tipo, refId: d.refId } });
    } else {
      const u = await this.prisma.ubicacion.findUnique({ where: { id: d.ubicacionId } });
      if (!u || u.bodegaId !== d.bodegaId) throw reglaNegocio('UBICACION', 'La ubicación no pertenece a esa bodega');
      await this.prisma.ubicacionClasificacion.upsert({ where: clave, create: { ...d, ubicacionId: d.ubicacionId }, update: { ubicacionId: d.ubicacionId } });
    }
    await this.audit.registrar(ctx, { accion: 'UBICAR_CLASIFICACION', entidad: d.tipo, entidadId: d.refId, despues: d });
    return { message: d.ubicacionId ? 'Ubicación asignada: sus productos la heredan' : 'Asignación quitada' };
  }

  /** Renombrar, cambiar el código (recalcula los códigos de todo lo que tiene dentro) o desactivar. */
  @Put(':id')
  @Permisos('inventario.ubicaciones')
  async editar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const d = validar(z.object({ codigo: codigo.optional(), nombre: z.string().trim().max(60).nullable().optional(), activo: z.boolean().optional() }), body);
    const antes = await this.prisma.ubicacion.findUnique({ where: { id }, include: { padre: true } });
    if (!antes) throw noEncontrado('Ubicación', id);
    await this.prisma.enTransaccion(async (tx) => {
      if (d.codigo && d.codigo !== antes.codigo) {
        const todas = await tx.ubicacion.findMany({ where: { bodegaId: antes.bodegaId }, select: { id: true, padreId: true, codigoCompleto: true } });
        const subarbol = descendientes(todas, id);
        const viejo = antes.codigoCompleto;
        const nuevo = codigoCompleto(antes.padre?.codigoCompleto, d.codigo);
        const cambios = todas.filter((u) => subarbol.has(u.id)).map((u) => ({ id: u.id, codigo: nuevo + u.codigoCompleto.slice(viejo.length) }));
        const ocupados = new Set(todas.filter((u) => !subarbol.has(u.id)).map((u) => u.codigoCompleto));
        const choque = cambios.find((c) => ocupados.has(c.codigo));
        if (choque) throw conflicto('UBICACION_REPETIDA', `Ya existe la ubicación ${choque.codigo} en esta bodega`);
        // Primero a un valor temporal (evita choques del índice único entre hermanos), luego al definitivo
        for (const c of cambios) await tx.ubicacion.update({ where: { id: c.id }, data: { codigoCompleto: `~${c.id}` } });
        for (const c of cambios) await tx.ubicacion.update({ where: { id: c.id }, data: { codigoCompleto: c.codigo } });
      }
      await tx.ubicacion.update({ where: { id }, data: { codigo: d.codigo, nombre: d.nombre, activo: d.activo } });
      await this.audit.registrar(ctx, { accion: 'EDITAR', entidad: 'Ubicacion', entidadId: id, antes, despues: d }, tx);
    });
    return { message: 'Cambios guardados' };
  }

  /** Dónde está un producto en cada bodega activa (propia o heredada). */
  @Get('producto/:id')
  @Permisos('productos.ver')
  async deProducto(@Param('id', ParseIntPipe) id: number) {
    const p = await this.prisma.producto.findUnique({ where: { id }, select: { subgrupoId: true } });
    if (!p) throw noEncontrado('Producto', id);
    const [bodegas, propias, asign, arbol] = await Promise.all([
      this.prisma.bodega.findMany({ where: { activo: true }, select: { id: true, nombre: true, sucursal: { select: { nombre: true } } } }),
      this.prisma.existencia.findMany({ where: { productoId: id, ubicacionId: { not: null } }, select: { bodegaId: true, ubicacion: { select: { id: true, codigoCompleto: true } } } }),
      this.prisma.ubicacionClasificacion.findMany({ include: { ubicacion: { select: { id: true, codigoCompleto: true, bodegaId: true } } } }),
      this.arbolClasificacion(),
    ]);
    const data = bodegas.map((b) => {
      const mapa = new Map<string, UbicacionRef>(asign.filter((a) => a.bodegaId === b.id).map((a) => [`${a.tipo}:${a.refId}`, a.ubicacion]));
      const propia = propias.find((x) => x.bodegaId === b.id)?.ubicacion ?? null;
      return { bodegaId: b.id, bodega: b.nombre, sucursal: b.sucursal.nombre, ubicacion: ubicacionEfectiva(p, propia, mapa, arbol) };
    }).filter((x) => x.ubicacion);
    return { data };
  }

  /** Qué productos están en una ubicación (incluye lo que tiene dentro y lo heredado). */
  @Get(':id/productos')
  @Permisos('inventario.ver')
  async productos(@Param('id', ParseIntPipe) id: number) {
    const raiz = await this.prisma.ubicacion.findUnique({ where: { id } });
    if (!raiz) throw noEncontrado('Ubicación', id);
    const todas = await this.prisma.ubicacion.findMany({ where: { bodegaId: raiz.bodegaId }, select: { id: true, padreId: true, codigoCompleto: true } });
    const dentro = descendientes(todas, id);
    const [existencias, asign, arbol] = await Promise.all([
      this.prisma.existencia.findMany({ where: { bodegaId: raiz.bodegaId }, select: { productoId: true, cantidad: true, ubicacion: { select: { id: true, codigoCompleto: true } }, producto: { select: { id: true, sku: true, nombre: true, subgrupoId: true, activo: true } } } }),
      this.prisma.ubicacionClasificacion.findMany({ where: { bodegaId: raiz.bodegaId }, include: { ubicacion: { select: { id: true, codigoCompleto: true } } } }),
      this.arbolClasificacion(),
    ]);
    const mapa = new Map<string, UbicacionRef>(asign.map((a) => [`${a.tipo}:${a.refId}`, a.ubicacion]));
    const data = existencias
      .filter((e) => e.producto.activo)
      .map((e) => ({ ...e.producto, cantidad: e.cantidad, ubicacion: ubicacionEfectiva(e.producto, e.ubicacion, mapa, arbol) }))
      .filter((x) => x.ubicacion && dentro.has(x.ubicacion.ubicacionId))
      .sort((a, b) => a.ubicacion!.codigo.localeCompare(b.ubicacion!.codigo) || a.nombre.localeCompare(b.nombre));
    return { data };
  }
}
