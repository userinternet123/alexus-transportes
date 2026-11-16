/**
 * CLASIFICACIÓN CON NIVELES ILIMITADOS
 * Categoría › Grupo › Sub-agrupación › Sub-agrupación › … (sin límite).
 * El árbol completo se entrega en una sola llamada (son pocos cientos de nodos).
 */
import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { conflicto, noEncontrado, reglaNegocio } from '../../common/errors';
import { validar } from '../../common/pipes/zod';
import { PrismaService } from '../../common/prisma/prisma.service';

const nombre = z.string().trim().min(1).max(120);

@Controller('clasificacion')
export class ClasificacionController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Árbol completo con la cantidad de productos de cada nodo. */
  @Get('arbol')
  @Permisos('productos.ver')
  async arbol() {
    const [categorias, grupos, subgrupos, conteo] = await Promise.all([
      this.prisma.categoria.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, activo: true } }),
      this.prisma.grupo.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, activo: true, categoriaId: true } }),
      this.prisma.subgrupo.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, activo: true, grupoId: true, padreId: true } }),
      this.prisma.producto.groupBy({ by: ['subgrupoId'], where: { activo: true }, _count: true }),
    ]);
    const productos = new Map(conteo.map((c) => [c.subgrupoId, c._count]));
    return { data: { categorias, grupos, subgrupos: subgrupos.map((s) => ({ ...s, productos: productos.get(s.id) ?? 0 })) } };
  }

  /** Nueva sub-agrupación en cualquier nivel (padreId opcional, siempre dentro del mismo grupo). */
  @Post('subgrupos')
  @Permisos('catalogos.crear')
  async crear(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const d = validar(z.object({ grupoId: z.coerce.number().int().positive(), padreId: z.coerce.number().int().positive().nullable().optional(), nombre }), body);
    if (d.padreId) await this.validarPadre(d.grupoId, d.padreId);
    if (await this.prisma.subgrupo.findUnique({ where: { grupoId_nombre: { grupoId: d.grupoId, nombre: d.nombre } } })) {
      throw conflicto('NOMBRE_REPETIDO', `Ya existe «${d.nombre}» en este grupo. Use un nombre más específico (por ejemplo, agregue el nombre de la madre).`);
    }
    const sg = await this.prisma.subgrupo.create({ data: { grupoId: d.grupoId, padreId: d.padreId ?? null, nombre: d.nombre } });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'Subgrupo', entidadId: sg.id, despues: sg });
    return { data: sg, message: 'Sub-agrupación creada' };
  }

  /** Renombrar, mover (cambiar de madre dentro del grupo) o activar/desactivar. */
  @Put('subgrupos/:id')
  @Permisos('catalogos.editar')
  async editar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const d = validar(z.object({ nombre: nombre.optional(), padreId: z.coerce.number().int().positive().nullable().optional(), activo: z.boolean().optional() }), body);
    const actual = await this.prisma.subgrupo.findUnique({ where: { id } });
    if (!actual) throw noEncontrado('Sub-agrupación', id);
    if (d.padreId !== undefined && d.padreId !== null) {
      if (d.padreId === id) throw reglaNegocio('CICLO', 'Una sub-agrupación no puede estar dentro de sí misma');
      await this.validarPadre(actual.grupoId, d.padreId);
      // ¿La nueva madre es descendiente de esta? Sube desde la madre: si llega a "id", sería un ciclo
      const arbol = new Map((await this.prisma.subgrupo.findMany({ where: { grupoId: actual.grupoId }, select: { id: true, padreId: true } })).map((x) => [x.id, x.padreId]));
      for (let n: number | null | undefined = d.padreId, pasos = 0; n != null && pasos < 1000; n = arbol.get(n), pasos++) {
        if (n === id) throw reglaNegocio('CICLO', 'No se puede mover dentro de una de sus propias sub-agrupaciones');
      }
    }
    if (d.nombre && d.nombre !== actual.nombre && (await this.prisma.subgrupo.findUnique({ where: { grupoId_nombre: { grupoId: actual.grupoId, nombre: d.nombre } } }))) {
      throw conflicto('NOMBRE_REPETIDO', `Ya existe «${d.nombre}» en este grupo`);
    }
    const sg = await this.prisma.subgrupo.update({ where: { id }, data: d });
    await this.audit.registrar(ctx, { accion: 'EDITAR', entidad: 'Subgrupo', entidadId: id, antes: actual, despues: sg });
    return { data: sg, message: 'Cambios guardados' };
  }

  private async validarPadre(grupoId: number, padreId: number) {
    const padre = await this.prisma.subgrupo.findUnique({ where: { id: padreId }, select: { grupoId: true } });
    if (!padre) throw noEncontrado('Sub-agrupación madre', padreId);
    if (padre.grupoId !== grupoId) throw reglaNegocio('OTRO_GRUPO', 'La sub-agrupación madre debe pertenecer al mismo grupo');
  }
}
