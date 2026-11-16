import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Contexto, Permisos, RequiereSucursal } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { validar } from '../../common/pipes/zod';
import { AnalisisService } from './analisis.service';
import { CONTRA, definicionZ, PERIODOS, TOKENS } from './agente.plantillas.logica';

const nombre = z.string().trim().min(1, 'Escriba un nombre').max(80);
const destinos = z.object({ destinos: z.array(z.object({ tipo: z.enum(['ROL', 'USUARIO']), id: z.coerce.number().int().positive() })).max(100) });
const periodo = z.enum(TOKENS).nullish();

/** ANÁLISIS GUARDADOS: plantillas y tableros de Pregunta a tus datos. Requieren el Dashboard analítico. */
@Controller('analisis')
@RequiereSucursal()
@Permisos('reportes.analitica')
export class AnalisisController {
  constructor(private readonly analisis: AnalisisService) {}

  @Get('periodos')
  periodos() {
    return { data: { periodos: Object.entries(PERIODOS).map(([token, etiqueta]) => ({ token, etiqueta })), contra: Object.entries(CONTRA).map(([token, etiqueta]) => ({ token, etiqueta })) } };
  }

  @Get('destinos')
  destinos(@Contexto() ctx: Ctx) { return this.analisis.destinos(ctx); }

  // ── Plantillas ──
  @Get('plantillas')
  listar(@Contexto() ctx: Ctx) { return this.analisis.listarPlantillas(ctx); }

  @Post('plantillas')
  crear(@Contexto() ctx: Ctx, @Body() body: unknown) {
    return this.analisis.crearPlantilla(ctx, validar(z.object({ nombre, descripcion: z.string().trim().max(300).nullish(), definicion: definicionZ }), body));
  }

  @Put('plantillas/:id')
  actualizar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.analisis.actualizarPlantilla(ctx, id, validar(z.object({ nombre: nombre.optional(), descripcion: z.string().trim().max(300).nullish(), definicion: definicionZ.optional() }), body));
  }

  @Delete('plantillas/:id')
  eliminar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.analisis.eliminarPlantilla(ctx, id); }

  @Put('plantillas/:id/compartir')
  compartir(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.analisis.compartir(ctx, 'PLANTILLA', id, validar(destinos, body).destinos);
  }

  @Post('plantillas/:id/ejecutar')
  ejecutar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const o = validar(z.object({ periodo, explicar: z.boolean().default(false) }), body ?? {});
    return this.analisis.ejecutarPlantilla(ctx, id, o);
  }

  // ── Tableros ──
  @Get('tableros')
  tableros(@Contexto() ctx: Ctx) { return this.analisis.listarTableros(ctx); }

  @Post('tableros')
  crearTablero(@Contexto() ctx: Ctx, @Body() body: unknown) {
    return this.analisis.crearTablero(ctx, validar(z.object({ nombre, plantillaIds: z.array(z.coerce.number().int().positive()).max(12) }), body));
  }

  @Put('tableros/:id')
  actualizarTablero(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.analisis.actualizarTablero(ctx, id, validar(z.object({ nombre: nombre.optional(), plantillaIds: z.array(z.coerce.number().int().positive()).max(12).optional() }), body));
  }

  @Delete('tableros/:id')
  eliminarTablero(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.analisis.eliminarTablero(ctx, id); }

  @Put('tableros/:id/compartir')
  compartirTablero(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.analisis.compartir(ctx, 'TABLERO', id, validar(destinos, body).destinos);
  }

  @Post('tableros/:id/ejecutar')
  ejecutarTablero(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.analisis.ejecutarTablero(ctx, id, validar(z.object({ periodo }), body ?? {}).periodo ?? null);
  }
}
