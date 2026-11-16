/**
 * CAMPOS PROPIOS DEL GIRO: definir campos (o aplicar una plantilla por giro).
 * Los valores de cada producto se guardan en Producto.atributos.
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { conflicto, noEncontrado, reglaNegocio } from '../../common/errors';
import { validar } from '../../common/pipes/zod';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { LicenciaService } from '../licencia/licencia.service';
import { claveDesde, DefCampo, PLANTILLAS, textoBusqueda, TIPOS } from './campos.logica';

const campoSchema = z.object({
  etiqueta: z.string().trim().min(1).max(60),
  tipo: z.enum(TIPOS as [string, ...string[]]),
  opciones: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
  unidad: z.string().trim().max(20).nullable().optional(),
  ayuda: z.string().trim().max(60).nullable().optional(),
  obligatorio: z.boolean().default(false),
  buscable: z.boolean().default(false),
  mostrarEnPos: z.boolean().default(false),
  categoriaIds: z.array(z.number().int().positive()).max(200).default([]),
  orden: z.number().int().min(0).max(10000).optional(),
  activo: z.boolean().default(true),
});

/** Recalcula el texto de búsqueda de los productos que usan esa clave (al cambiar "buscable" o "activo"). */
export async function recalcularBusqueda(db: PrismaService | Tx, clave: string) {
  const campos = (await db.campoProducto.findMany()) as unknown as DefCampo[];
  const productos = await db.$queryRaw<{ id: number; atributos: Record<string, unknown> }[]>`SELECT id, atributos FROM productos WHERE atributos ? ${clave}::text`;
  for (const p of productos) {
    await db.producto.update({ where: { id: p.id }, data: { textoBusqueda: textoBusqueda(campos, p.atributos) } });
  }
  return productos.length;
}

@Controller('campos-producto')
export class CamposController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly licencia: LicenciaService) {}

  private async contratado() {
    return (await this.licencia.estado()).modulos.includes('giros');
  }

  @Get()
  @Permisos('productos.ver')
  async listar(@Query('todos') todos?: string) {
    // Sin el paquete "Campos por giro": no hay campos (el editor y el POS no muestran nada)
    if (!(await this.contratado())) return { data: [], contratado: false };
    return { contratado: true, data: await this.prisma.campoProducto.findMany({ where: todos ? {} : { activo: true }, orderBy: [{ orden: 'asc' }, { id: 'asc' }] }) };
  }

  @Get('plantillas')
  @Permisos('giros.configurar')
  async plantillas() {
    const existentes = new Set((await this.prisma.campoProducto.findMany({ select: { clave: true } })).map((c) => c.clave));
    return {
      data: Object.entries(PLANTILLAS).map(([clave, p]) => ({
        clave, nombre: p.nombre, descripcion: p.descripcion,
        campos: p.campos.map((c) => c.etiqueta),
        aplicada: p.campos.every((c) => existentes.has(c.clave)),
        // cuántos de sus campos existen hoy (se puede quitar aunque se haya aplicado solo en parte)
        presentes: p.campos.filter((c) => existentes.has(c.clave)).length,
      })),
    };
  }

  /** Crea los campos de un giro. Los que ya existen (misma clave) se conservan como están. */
  @Post('plantillas/:clave')
  @Permisos('giros.configurar')
  async aplicar(@Contexto() ctx: Ctx, @Param('clave') clave: string, @Body() body: unknown) {
    const plantilla = PLANTILLAS[clave];
    if (!plantilla) throw noEncontrado('Plantilla', clave);
    const { categoriaIds } = validar(z.object({ categoriaIds: z.array(z.number().int().positive()).max(200).default([]) }), body ?? {});
    const resultado = await this.prisma.enTransaccion(async (tx) => {
      const max = await tx.campoProducto.aggregate({ _max: { orden: true } });
      let orden = (max._max.orden ?? 0) + 1;
      let creados = 0;
      for (const c of plantilla.campos) {
        if (await tx.campoProducto.findUnique({ where: { clave: c.clave } })) continue;
        await tx.campoProducto.create({
          data: { clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, opciones: c.opciones ?? [], unidad: c.unidad ?? null, ayuda: c.ayuda ?? null,
            obligatorio: false, buscable: c.buscable ?? false, mostrarEnPos: c.mostrarEnPos ?? false, categoriaIds, orden: orden++, plantilla: clave },
        });
        creados++;
      }
      await this.audit.registrar(ctx, { accion: 'APLICAR_PLANTILLA', entidad: 'CampoProducto', entidadId: clave, despues: { creados, categoriaIds } }, tx);
      return { creados, existentes: plantilla.campos.length - creados };
    });
    return { data: resultado, message: `${plantilla.nombre}: ${resultado.creados} campos agregados${resultado.existentes ? ` (${resultado.existentes} ya existían)` : ''}` };
  }

  @Post()
  @Permisos('giros.configurar')
  async crear(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const d = validar(campoSchema, body);
    if (d.tipo === 'LISTA' && d.opciones.length < 2) throw reglaNegocio('OPCIONES', 'Una lista necesita al menos dos opciones');
    const clave = claveDesde(d.etiqueta);
    if (!clave) throw reglaNegocio('ETIQUETA', 'La etiqueta debe tener letras o números');
    if (await this.prisma.campoProducto.findUnique({ where: { clave } })) throw conflicto('CLAVE_REPETIDA', `Ya existe un campo «${d.etiqueta}»`);
    const max = await this.prisma.campoProducto.aggregate({ _max: { orden: true } });
    const campo = await this.prisma.campoProducto.create({ data: { ...d, clave, orden: d.orden ?? (max._max.orden ?? 0) + 1 } });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'CampoProducto', entidadId: campo.id, despues: campo });
    return { data: campo, message: 'Campo creado' };
  }

  @Put(':id')
  @Permisos('giros.configurar')
  async editar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const d = validar(campoSchema.partial(), body);
    const antes = await this.prisma.campoProducto.findUnique({ where: { id } });
    if (!antes) throw noEncontrado('Campo', id);
    if (d.tipo && d.tipo !== antes.tipo) {
      const [{ usados }] = await this.prisma.$queryRaw<{ usados: number }[]>`SELECT count(*)::int AS usados FROM productos WHERE atributos ? ${antes.clave}::text`;
      if (usados > 0) throw reglaNegocio('TIPO_EN_USO', `No se puede cambiar el tipo: ${usados} productos ya tienen «${antes.etiqueta}». Cree un campo nuevo.`);
    }
    const tipo = d.tipo ?? antes.tipo;
    const opciones = d.opciones ?? antes.opciones;
    if (tipo === 'LISTA' && opciones.length < 2) throw reglaNegocio('OPCIONES', 'Una lista necesita al menos dos opciones');
    const despues = await this.prisma.campoProducto.update({ where: { id }, data: d });
    let recalculados = 0;
    if ((d.buscable !== undefined && d.buscable !== antes.buscable) || (d.activo !== undefined && d.activo !== antes.activo)) {
      recalculados = await recalcularBusqueda(this.prisma, antes.clave);
    }
    await this.audit.registrar(ctx, { accion: 'EDITAR', entidad: 'CampoProducto', entidadId: id, antes, despues });
    return { data: despues, message: recalculados ? `Cambios guardados (${recalculados} productos actualizados en el buscador)` : 'Cambios guardados' };
  }

  /** Cuántos productos tienen datos de una plantilla de giro (antes de quitarla). */
  @Get('plantillas/:clave/uso')
  @Permisos('giros.configurar')
  async usoPlantilla(@Param('clave') clave: string) {
    const plantilla = PLANTILLAS[clave];
    if (!plantilla) throw noEncontrado('Plantilla', clave);
    const claves = plantilla.campos.map((x) => x.clave);
    const campos = await this.prisma.campoProducto.count({ where: { clave: { in: claves } } });
    const [{ usados }] = await this.prisma.$queryRaw<{ usados: number }[]>`SELECT count(*)::int AS usados FROM productos WHERE atributos ?| ${claves}::text[]`;
    return { data: { campos, productos: usados } };
  }

  /**
   * Quitar una plantilla de giro: todos sus campos a la vez (en una sola operación). Si hay productos con esos
   * datos, hay que confirmarlo (quitarValores=1) y se borran de esos productos. Los campos propios no se tocan.
   */
  @Delete('plantillas/:clave')
  @Permisos('giros.configurar')
  async quitarPlantilla(@Contexto() ctx: Ctx, @Param('clave') clave: string, @Query('quitarValores') quitarValores?: string) {
    const plantilla = PLANTILLAS[clave];
    if (!plantilla) throw noEncontrado('Plantilla', clave);
    const claves = plantilla.campos.map((x) => x.clave);
    const resultado = await this.prisma.enTransaccion(async (tx) => {
      const campos = await tx.campoProducto.findMany({ where: { clave: { in: claves } } });
      if (!campos.length) return { campos: 0, productos: 0 };
      const [{ usados }] = await tx.$queryRaw<{ usados: number }[]>`SELECT count(*)::int AS usados FROM productos WHERE atributos ?| ${claves}::text[]`;
      if (usados > 0 && quitarValores !== '1') {
        throw reglaNegocio('CAMPO_EN_USO', `${usados} productos tienen datos de «${plantilla.nombre}». Confirme que desea borrar esos datos de todos ellos.`);
      }
      if (usados > 0) await tx.$executeRaw`UPDATE productos SET atributos = atributos - ${claves}::text[] WHERE atributos ?| ${claves}::text[]`;
      await tx.campoProducto.deleteMany({ where: { id: { in: campos.map((x) => x.id) } } });
      await this.recalcularBusqueda(tx);
      await this.audit.registrar(ctx, { accion: 'QUITAR_PLANTILLA', entidad: 'CampoProducto', entidadId: clave, antes: campos, despues: { productosAfectados: usados } }, tx);
      return { campos: campos.length, productos: usados };
    });
    return { data: resultado, message: resultado.campos ? `Se quitaron ${resultado.campos} campos de «${plantilla.nombre}»${resultado.productos ? ` (y sus datos de ${resultado.productos} productos)` : ''}` : 'Esa plantilla no tenía campos para quitar' };
  }

  /** El texto de búsqueda de los productos ya no debe incluir datos quitados. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async recalcularBusqueda(tx: any) {
    const campos = (await tx.campoProducto.findMany()) as unknown as DefCampo[];
    const afectados = await tx.$queryRaw`SELECT id, atributos FROM productos WHERE texto_busqueda IS NOT NULL` as { id: number; atributos: Record<string, unknown> }[];
    for (const p of afectados) await tx.producto.update({ where: { id: p.id }, data: { textoBusqueda: textoBusqueda(campos, p.atributos) } });
  }

  /** Cuántos productos tienen un valor en este campo (antes de quitarlo). */
  @Get(':id/uso')
  @Permisos('giros.configurar')
  async uso(@Param('id', ParseIntPipe) id: number) {
    const c = await this.prisma.campoProducto.findUnique({ where: { id } });
    if (!c) throw noEncontrado('Campo', id);
    const [{ usados }] = await this.prisma.$queryRaw<{ usados: number }[]>`SELECT count(*)::int AS usados FROM productos WHERE atributos ? ${c.clave}::text`;
    return { data: { productos: usados } };
  }

  /**
   * Quitar un campo. Si hay productos con ese dato, hay que confirmarlo (quitarValores=1):
   * el dato se borra de esos productos. Para conservarlos, mejor desactivar el campo.
   */
  @Delete(':id')
  @Permisos('giros.configurar')
  async quitar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Query('quitarValores') quitarValores?: string) {
    const c = await this.prisma.campoProducto.findUnique({ where: { id } });
    if (!c) throw noEncontrado('Campo', id);
    const quitados = await this.prisma.enTransaccion(async (tx) => {
      const [{ usados }] = await tx.$queryRaw<{ usados: number }[]>`SELECT count(*)::int AS usados FROM productos WHERE atributos ? ${c.clave}::text`;
      if (usados > 0 && quitarValores !== '1') {
        throw reglaNegocio('CAMPO_EN_USO', `${usados} productos tienen «${c.etiqueta}». Confirme que desea borrar ese dato de todos ellos, o desactive el campo para conservarlo.`);
      }
      if (usados > 0) {
        await tx.$executeRaw`UPDATE productos SET atributos = atributos - ${c.clave}::text WHERE atributos ? ${c.clave}::text`;
      }
      await tx.campoProducto.delete({ where: { id } });
      await this.recalcularBusqueda(tx);
      await this.audit.registrar(ctx, { accion: 'QUITAR', entidad: 'CampoProducto', entidadId: id, antes: c, despues: { productosAfectados: usados } }, tx);
      return usados;
    });
    return { message: quitados ? `Campo quitado (se borró de ${quitados} productos)` : 'Campo quitado' };
  }
}
