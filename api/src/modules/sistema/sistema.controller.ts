import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Contexto, Permisos, Publico } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { PARAMETROS_DEFECTO, ParametrosService } from '../../common/parametros/parametros.service';
import { validar } from '../../common/pipes/zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';

@ApiTags('sistema')
@Controller()
export class SistemaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    private readonly audit: AuditService,
    private readonly archivos: ArchivosService,
  ) {}

  /** Liveness/readiness para Docker/Kubernetes/balanceador. */
  @Publico()
  @Get('health')
  async health() {
    const inicio = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok', latenciaDbMs: Date.now() - inicio, version: process.env.npm_package_version ?? '2.0.0' };
  }

  /**
   * MARCA DEL NEGOCIO (pública: la usa la pantalla de login antes de iniciar sesión).
   * Las imágenes se sirven desde /archivos/publico/:id.
   */
  @Publico()
  @Get('sistema/marca')
  async marca() {
    const filas = await this.prisma.parametroSistema.findMany({ where: { modulo: 'Negocio' } });
    const v = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
    const url = (id?: string) => (id ? `/archivos/publico/${id}` : null);
    return {
      data: {
        nombre: v['negocio.nombre'] ?? 'SPVI 2.0',
        eslogan: v['negocio.eslogan'] ?? 'Punto de venta e inventario',
        logoUrl: url(v['negocio.logo']),
        fondoLoginUrl: url(v['negocio.fondo_login']),
        imagenInicioUrl: url(v['negocio.imagen_inicio']),
        logoId: v['negocio.logo'] ?? null,
        fondoLoginId: v['negocio.fondo_login'] ?? null,
        imagenInicioId: v['negocio.imagen_inicio'] ?? null,
        tema: v['negocio.tema'] ?? 'tienda',
        modo: v['negocio.modo'] ?? 'claro',
      },
    };
  }

  @ApiBearerAuth()
  @Put('sistema/marca')
  @Permisos('config.parametros')
  async guardarMarca(@Body() body: unknown, @Contexto() ctx: Ctx) {
    const id = z.string().uuid().nullable().optional();
    const dto = validar(
      z.object({
        nombre: z.string().trim().min(2).max(80), eslogan: z.string().trim().max(120).optional(), logoId: id, fondoLoginId: id, imagenInicioId: id,
        tema: z.enum(['tienda', 'oceano', 'mandarina', 'uva', 'grafito']).optional(),
        modo: z.enum(['claro', 'oscuro', 'automatico']).optional(),
      }),
      body,
    );
    const valores: Record<string, string | null | undefined> = {
      'negocio.nombre': dto.nombre, 'negocio.eslogan': dto.eslogan ?? '',
      'negocio.logo': dto.logoId, 'negocio.fondo_login': dto.fondoLoginId, 'negocio.imagen_inicio': dto.imagenInicioId,
      'negocio.tema': dto.tema, 'negocio.modo': dto.modo,
    };
    for (const [clave, valor] of Object.entries(valores)) {
      if (valor === undefined) continue;
      if (valor === null || valor === '') {
        if (clave !== 'negocio.eslogan') { await this.prisma.parametroSistema.deleteMany({ where: { clave } }); continue; }
      }
      await this.prisma.parametroSistema.upsert({
        where: { clave },
        create: { clave, valor: valor ?? '', tipo: 'string', modulo: 'Negocio', descripcion: 'Marca del negocio' },
        update: { valor: valor ?? '' },
      });
    }
    await this.archivos.marcarPublico([dto.logoId, dto.fondoLoginId, dto.imagenInicioId]);
    await this.audit.registrar(ctx, { accion: 'MARCA_NEGOCIO', entidad: 'ParametroSistema', entidadId: 'negocio', despues: dto });
    return this.marca();
  }

  @ApiBearerAuth()
  @Get('config/parametros')
  @Permisos('config.parametros')
  async listar() {
    const guardados = await this.prisma.parametroSistema.findMany();
    const porClave = new Map(guardados.map((p) => [p.clave, p]));
    const data = Object.entries(PARAMETROS_DEFECTO).map(([clave, def]) => ({
      clave, ...def, valor: porClave.get(clave)?.valor ?? def.valor, personalizado: porClave.has(clave),
    }));
    return { data };
  }

  @ApiBearerAuth()
  @Put('config/parametros/:clave')
  @Permisos('config.parametros')
  async actualizar(@Param('clave') clave: string, @Body() body: unknown, @Contexto() ctx: Ctx) {
    const def = PARAMETROS_DEFECTO[clave];
    if (!def) throw noEncontrado('Parámetro', clave);
    const { valor } = validar(z.object({ valor: z.string().trim().min(1).max(500) }), body);
    if (def.tipo === 'number' && Number.isNaN(Number(valor))) throw reglaNegocio('VALOR_INVALIDO', 'Se esperaba un número');
    if (def.tipo === 'boolean' && !['true', 'false'].includes(valor)) throw reglaNegocio('VALOR_INVALIDO', 'Se esperaba true/false');
    const antes = await this.prisma.parametroSistema.findUnique({ where: { clave } });
    const data = await this.prisma.parametroSistema.upsert({
      where: { clave },
      create: { clave, valor, tipo: def.tipo, modulo: def.modulo, descripcion: def.descripcion },
      update: { valor },
    });
    this.parametros.invalidar(clave);
    await this.audit.registrar(ctx, { accion: 'PARAMETRO', entidad: 'ParametroSistema', entidadId: clave, antes, despues: data });
    return { data, message: 'Parámetro actualizado' };
  }
}
