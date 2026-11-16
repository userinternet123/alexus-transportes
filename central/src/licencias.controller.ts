import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Admin, AdminGuard, AdminReq, validar } from './comun';
import { MODULOS } from './licencias.catalogo';
import { emitirZ, LicenciasService } from './licencias.service';

const limiteZ = z.number().int().min(1).max(100000).nullable();

/** Licencias desde el panel de ALEXUS: planes, emisión (por Central o archivo), revocación y la llave pública. */
@Controller('panel/licencias')
@UseGuards(AdminGuard)
export class LicenciasController {
  constructor(private readonly licencias: LicenciasService) {}

  @Get() async listar() { return { ...(await this.licencias.listar()), modulos: MODULOS, planes: await this.licencias.planes() }; }

  /** Va dentro del instalador de SPVI (apps/api/src/modules/licencia/clave-publica.ts). */
  @Get('llave-publica') async llavePublica() { return { publica: (await this.licencias.llave()).publica }; }

  @Put('planes')
  guardarPlan(@Body() body: unknown) {
    return this.licencias.guardarPlan(validar(z.object({
      id: z.number().int().positive().optional(), clave: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_]+$/), nombre: z.string().trim().min(2).max(60),
      modulos: z.array(z.enum(Object.keys(MODULOS) as [string, ...string[]])).min(1), reportesConfigurables: z.boolean().default(true),
      limites: z.object({ sucursales: limiteZ, bodegas: limiteZ, cajas: limiteZ, usuarios: limiteZ }), vigenciaDias: z.number().int().min(1).max(3650).default(365), activo: z.boolean().default(true),
    }), body));
  }

  @Post() emitir(@Admin() admin: AdminReq, @Body() body: unknown) { return this.licencias.emitir(validar(emitirZ, body), admin.nombre || admin.email); }

  @Post(':id/revocar')
  revocar(@Admin() admin: AdminReq, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { motivo } = validar(z.object({ motivo: z.string().trim().min(5, 'Indique el motivo').max(200) }), body);
    return this.licencias.revocar(id, motivo, admin.nombre || admin.email);
  }

  /** Descarga del archivo .lic (para tiendas sin internet). */
  @Get(':id/archivo')
  async archivo(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { nombre, token } = await this.licencias.archivo(id);
    res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}"` });
    res.send(token);
  }
}
