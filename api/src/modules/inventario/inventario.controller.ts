import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Contexto, Permisos, RequiereSucursal } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { parseFecha, sumarDias } from '../../common/fecha';
import { validar, zCantidad, zFecha, zId } from '../../common/pipes/zod';
import { InventarioService } from './inventario.service';
import { ConteosService } from './conteos.service';

const ajusteSchema = z.object({
  bodegaId: zId,
  motivo: z.enum(['CONTEO_FISICO', 'MERMA', 'VENCIMIENTO', 'DANIO', 'OTRO']),
  observacion: z.string().max(300).optional(),
  lineas: z.array(z.object({ productoId: zId, cantidadFisica: z.coerce.number().min(0) })).min(1).max(2000),
});
const inicialSchema = z.object({
  bodegaId: zId,
  lineas: z.array(z.object({ productoId: zId, cantidad: zCantidad, costoUnitario: z.coerce.number().min(0).optional() })).min(1).max(10_000),
});
const trasladoSchema = z.object({
  bodegaOrigenId: zId,
  bodegaDestinoId: zId,
  observacion: z.string().max(300).optional(),
  lineas: z.array(z.object({ productoId: zId, cantidad: zCantidad })).min(1).max(1000),
});

@ApiTags('inventario')
@ApiBearerAuth()
@RequiereSucursal()
@Controller('inventario')
export class InventarioController {
  constructor(
    private readonly inventario: InventarioService,
    private readonly conteos: ConteosService,
  ) {}

  // ── Conteo físico por sesiones ──────────────────────────────────────────
  @Get('conteos')
  @Permisos('inventario.contar')
  listarConteos(@Contexto() ctx: Ctx) {
    return this.conteos.listar(ctx);
  }

  @Post('conteos')
  @Permisos('inventario.ajustar')
  abrirConteo(@Contexto() ctx: Ctx, @Body() body: unknown) {
    return this.conteos.crear(ctx, validar(z.object({
      bodegaId: zId, nombre: z.string().trim().min(3).max(120), ciego: z.boolean().default(true),
      alcance: z.object({ tipo: z.enum(['CATEGORIA', 'GRUPO', 'SUBGRUPO']), id: zId }).optional(), // vacío = toda la bodega
    }), body));
  }

  @Get('conteos/:id')
  @Permisos('inventario.contar')
  conteo(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    return this.conteos.obtener(ctx, id);
  }

  @Get('conteos/:id/lista')
  @Permisos('inventario.contar')
  listaConteo(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Query('estado') estado?: string, @Query('q') q?: string) {
    const e = estado === 'contados' || estado === 'pendientes' ? estado : 'todos';
    return this.conteos.lista(ctx, id, { estado: e, q });
  }

  /** Gerencia: marcar que lo físico coincide con el sistema. */
  @Post('conteos/:id/cuadra')
  @Permisos('inventario.cuadre')
  cuadra(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { productoId } = validar(z.object({ productoId: zId }), body);
    return this.conteos.cuadra(ctx, id, productoId);
  }

  @Post('conteos/:id/lineas')
  @Permisos('inventario.contar')
  contar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.conteos.contar(ctx, id, validar(z.object({ productoId: zId, cantidad: z.coerce.number().min(0).max(1_000_000), modo: z.enum(['sumar', 'reemplazar']).default('reemplazar') }), body));
  }

  @Delete('conteos/:id/lineas/:productoId')
  @Permisos('inventario.contar')
  quitarDeConteo(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Param('productoId', ParseIntPipe) productoId: number) {
    return this.conteos.quitar(ctx, id, productoId);
  }

  @Post('conteos/:id/aprobar')
  @Permisos('inventario.ajustar')
  aprobarConteo(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { observacion } = validar(z.object({ observacion: z.string().max(300).optional() }), body);
    return this.conteos.aprobar(ctx, id, observacion);
  }

  @Post('conteos/:id/cancelar')
  @Permisos('inventario.ajustar')
  cancelarConteo(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { motivo } = validar(z.object({ motivo: z.string().trim().min(5).max(300) }), body);
    return this.conteos.cancelar(ctx, id, motivo);
  }

  @Get('existencias')
  @Permisos('inventario.ver')
  existencias(@Contexto() ctx: Ctx, @Query() q: Record<string, string>) {
    return this.inventario.existencias(ctx, {
      bodegaId: q.bodegaId ? Number(q.bodegaId) : undefined,
      q: q.q,
      bajoMinimo: q.bajoMinimo === 'true',
    });
  }

  @Get('kardex/:productoId')
  @Permisos('inventario.kardex')
  kardex(@Contexto() ctx: Ctx, @Param('productoId', ParseIntPipe) productoId: number, @Query() q: Record<string, string>) {
    const desde = q.desde ? parseFecha(validar(zFecha, q.desde)) : undefined;
    const hasta = q.hasta ? sumarDias(parseFecha(validar(zFecha, q.hasta)), 1) : undefined;
    return this.inventario.kardexProducto(ctx, productoId, q.bodegaId ? Number(q.bodegaId) : undefined, desde, hasta);
  }

  @Post('ajustes')
  @Permisos('inventario.ajustar')
  ajustar(@Contexto() ctx: Ctx, @Body() body: unknown) {
    return this.inventario.ajustar(ctx, validar(ajusteSchema, body));
  }

  @Post('inicial')
  @Permisos('inventario.ajustar')
  inicial(@Contexto() ctx: Ctx, @Body() body: unknown) {
    return this.inventario.inventarioInicial(ctx, validar(inicialSchema, body));
  }

  // ── Traslados entre bodegas y sucursales ───────────────────────────────
  @Get('traslados')
  @Permisos('inventario.ver')
  traslados(@Contexto() ctx: Ctx, @Query('vista') vista?: string, @Query('estado') estado?: string) {
    const v = vista === 'por-recibir' || vista === 'enviados' ? vista : 'todos';
    return this.inventario.traslados(ctx, { vista: v, estado: estado || undefined });
  }

  @Get('traslados/destinos')
  @Permisos('inventario.trasladar')
  destinos() {
    return this.inventario.destinos();
  }

  @Get('traslados/pendientes')
  @Permisos('inventario.ver')
  pendientes(@Contexto() ctx: Ctx) {
    return this.inventario.pendientes(ctx);
  }

  @Post('traslados')
  @Permisos('inventario.trasladar')
  enviar(@Contexto() ctx: Ctx, @Body() body: unknown) {
    return this.inventario.enviarTraslado(ctx, validar(trasladoSchema, body));
  }

  @Post('traslados/:id/recibir')
  @Permisos('inventario.trasladar')
  recibir(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const dto = validar(z.object({
      lineas: z.array(z.object({ productoId: zId, cantidadRecibida: z.coerce.number().min(0).max(1_000_000) })).max(1000).optional(),
      observacion: z.string().max(300).optional(),
    }), body ?? {});
    return this.inventario.recibirTraslado(ctx, id, dto);
  }

  @Post('traslados/:id/anular')
  @Permisos('inventario.trasladar')
  anular(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { motivo } = validar(z.object({ motivo: z.string().trim().min(5).max(300) }), body);
    return this.inventario.anularTraslado(ctx, id, motivo);
  }
}
