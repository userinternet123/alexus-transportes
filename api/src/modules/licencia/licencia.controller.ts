import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Contexto, Permisos, SinLicencia } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { validar } from '../../common/pipes/zod';
import { REPORTES } from '../reportes/reportes.registro';
import { LicenciaService } from './licencia.service';
import { MODULOS, PLANES } from './modulos';

@ApiTags('licencia')
@ApiBearerAuth()
@Controller('licencia')
export class LicenciaController {
  constructor(
    private readonly licencia: LicenciaService,
    private readonly audit: AuditService,
  ) {}

  /** Plan, módulos (incluidos o no) y vigencia. */
  @Get()
  @SinLicencia()
  @Permisos('config.parametros')
  async estado() {
    const e = await this.licencia.estado();
    return {
      data: {
        empresa: e.empresa, nit: e.nit, plan: e.plan, planNombre: PLANES[e.plan]?.nombre ?? e.plan, modo: e.modo,
        vence: e.vence, diasRestantes: e.diasRestantes, maxUsuarios: e.maxUsuarios, maxSucursales: e.maxSucursales,
        reportesConfigurables: e.reportesConfigurables,
        // Límites (null = sin límite) y el código de ESTE equipo (para licencias por archivo o transferencias)
        limites: e.limites, codigoEquipo: e.codigoEquipo, licenciaId: e.id ?? null, entrega: e.entrega ?? null, atadaAEquipo: Boolean(e.equipo),
        modulos: Object.entries(MODULOS).map(([clave, m]) => ({
          clave, ...m, incluido: e.modulos.includes(clave),
          disponibleEn: Object.entries(PLANES).find(([, p]) => p.modulos.includes(clave))?.[1].nombre,
        })),
      },
    };
  }

  @Put()
  @SinLicencia()
  @Permisos('config.parametros')
  async cargar(@Body() body: unknown, @Contexto() ctx: Ctx) {
    const { token } = validar(z.object({ token: z.string().trim().min(40).max(5000) }), body);
    const e = await this.licencia.guardarLicencia(token);
    await this.audit.registrar(ctx, { accion: 'LICENCIA', entidad: 'ParametroSistema', entidadId: 'licencia.token', despues: { plan: e.plan, empresa: e.empresa, vence: e.vence } });
    return { data: { plan: e.plan, vence: e.vence }, message: `Licencia ${PLANES[e.plan]?.nombre ?? e.plan} activada hasta ${e.vence}. Los usuarios verán los cambios al recargar.` };
  }

  /** Todos los reportes del sistema con su estado para esta empresa. */
  @Get('reportes')
  @Permisos('config.parametros')
  async reportes() {
    const e = await this.licencia.estado();
    const ocultos = await this.licencia.reportesOcultos();
    const data = await Promise.all(REPORTES.map(async (r) => {
      const moduloOk = await this.licencia.permisoHabilitado(r.permiso);
      const contratado = moduloOk && (e.reportes === '*' || e.reportes.includes(r.clave));
      return { clave: r.clave, titulo: r.titulo, categoria: r.categoria, descripcion: r.descripcion, contratado, visible: contratado && !ocultos.includes(r.clave) };
    }));
    return { data, configurable: e.reportesConfigurables };
  }

  /** La empresa elige qué reportes contratados ven sus usuarios (plan Profesional o superior). */
  @Put('reportes')
  @Permisos('config.parametros')
  async configurarReportes(@Body() body: unknown, @Contexto() ctx: Ctx) {
    const { ocultos } = validar(z.object({ ocultos: z.array(z.string().max(60)).max(200) }), body);
    await this.licencia.guardarReportesOcultos(ocultos);
    await this.audit.registrar(ctx, { accion: 'CONFIGURAR_REPORTES', entidad: 'ParametroSistema', entidadId: 'reportes.ocultos', despues: ocultos });
    return { message: 'Reportes actualizados' };
  }
}
