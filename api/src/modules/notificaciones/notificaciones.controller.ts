/**
 * NOTIFICACIONES: todo lo pendiente en un solo lugar (la campana del portal).
 * No se guardan: se calculan al consultar, según los permisos de cada usuario.
 * El "id" cambia cuando hay algo nuevo (otro traslado, otra respuesta), para volver a avisar.
 */
import { Body, Put } from '@nestjs/common';
import { z } from 'zod';
import { NotificacionesService } from './notificaciones.service';
import { Controller, Get } from '@nestjs/common';
import { Contexto } from '../../common/auth/decoradores';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CentralService } from '../central/central.service';
import { LicenciaService } from '../licencia/licencia.service';
import { TemporadasService } from '../temporadas/temporadas.service';

export interface Notificacion {
  id: string;
  tipo: 'actualizacion' | 'soporte' | 'aviso' | 'traslado' | 'conteo' | 'licencia' | 'cobro' | 'temporada' | string;
  nivel: 'info' | 'aviso' | 'critico';
  titulo: string;
  detalle: string;
  ruta?: string; // pantalla del portal
  accion?: 'ayuda'; // abrir el panel de soporte
  enlace?: string | null; // enlace externo (avisos del proveedor)
  fecha?: string; // los eventos (hechos) traen su fecha; las situaciones vigentes no
  visto?: boolean;
}

@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly central: CentralService,
    private readonly licencia: LicenciaService,
    private readonly temporadas: TemporadasService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Get()
  async listar(@Contexto() ctx: Ctx) {
    const puede = (p: string) => tienePermiso(ctx.usuario, p);
    const lista: Notificacion[] = [];
    const c = await this.central.estado();

    if (c.actualizacion && puede('config.parametros')) {
      const v = c.actualizacion.version;
      lista.push({
        id: `actualizacion:${v}`, tipo: 'actualizacion', nivel: c.actualizacion.critica ? 'critico' : 'info',
        titulo: c.actualizacion.critica ? `Actualización de seguridad ${v}` : `Nueva versión ${v} disponible`,
        detalle: 'Instálela fuera del horario de ventas desde la pantalla de Inicio.', ruta: '/home',
      });
    }
    if (c.ticketsConRespuesta > 0) {
      lista.push({
        id: `soporte:${c.ticketsConRespuesta}`, tipo: 'soporte', nivel: 'info',
        titulo: 'Soporte le respondió', detalle: `${c.ticketsConRespuesta} reporte(s) con respuesta del equipo de soporte.`, accion: 'ayuda',
      });
    }
    for (const a of c.anuncios.filter((x) => x.tipo === 'aviso' && x.ubicaciones.includes('inicio'))) {
      lista.push({ id: `aviso:${a.id}`, tipo: 'aviso', nivel: 'info', titulo: a.titulo, detalle: a.texto, enlace: a.enlace });
    }
    if (ctx.sucursalId && puede('inventario.trasladar')) {
      const t = await this.prisma.traslado.findMany({ where: { sucursalDestinoId: ctx.sucursalId, estado: 'EN_TRANSITO' }, select: { id: true }, orderBy: { id: 'desc' } });
      if (t.length) {
        lista.push({
          id: `traslados:${t[0].id}`, tipo: 'traslado', nivel: 'aviso',
          titulo: t.length === 1 ? 'Un traslado en tránsito hacia su sucursal' : `${t.length} traslados en tránsito hacia su sucursal`,
          detalle: 'Regístrelo al recibir la mercadería para que entre a sus existencias.', ruta: '/home/traslados?vista=por-recibir',
        });
      }
    }
    if (ctx.sucursalId && puede('inventario.contar')) {
      const abiertos = await this.prisma.conteo.findMany({ where: { sucursalId: ctx.sucursalId, estado: 'ABIERTO' }, select: { id: true, nombre: true }, orderBy: { id: 'desc' } });
      if (abiertos.length) {
        lista.push({ id: `conteos:${abiertos[0].id}`, tipo: 'conteo', nivel: 'info', titulo: `Conteo físico en curso: ${abiertos[0].nombre}`, detalle: abiertos.length > 1 ? `Hay ${abiertos.length} conteos abiertos.` : 'Continúe contando o apruébelo al terminar.', ruta: '/home/conteos' });
      }
    }
    if (ctx.sucursalId && puede('caja.conciliar')) {
      const limite = new Date(Date.now() - 2 * 86_400_000);
      const pendientes = await this.prisma.ventaPago.findMany({
        where: { estado: 'PENDIENTE', medioPago: { in: ['TARJETA', 'TRANSFERENCIA', 'CHEQUE'] }, venta: { sucursalId: ctx.sucursalId, tipo: 'VENTA', estado: 'CONFIRMADA', fecha: { lt: limite } } },
        select: { id: true }, orderBy: { id: 'desc' }, take: 500,
      });
      if (pendientes.length) {
        lista.push({ id: `cobros:${pendientes[0].id}`, tipo: 'cobro', nivel: 'aviso', titulo: `${pendientes.length} cobros sin verificar`, detalle: 'Vouchers, transferencias o cheques de hace más de 2 días sin confirmar contra el banco.', ruta: '/home/cobros' });
      }
    }
    if (puede('config.parametros')) {
      const lic = await this.licencia.estado();
      if (lic.diasRestantes != null && lic.diasRestantes <= 30) {
        lista.push({
          id: `licencia:${lic.vence}:${lic.diasRestantes <= 7 ? 'semana' : 'mes'}`, tipo: 'licencia', nivel: lic.diasRestantes <= 7 ? 'critico' : 'aviso',
          titulo: lic.diasRestantes <= 0 ? 'La licencia venció' : `La licencia vence en ${lic.diasRestantes} días`,
          detalle: 'Comuníquese con ALEXUS para renovarla.', ruta: '/home/licencia',
        });
      }
    }
    // Temporadas por empezar: SIEMPRE se avisa (aunque no falte nada o el motor analítico esté apagado)
    if (puede('reportes.analitica.temporadas') && ctx.sucursalId) {
      for (const a of this.temporadas.alertasEnCache(ctx)) {
        const faltan = a.productosPorComprar;
        lista.push({
          id: `temporada:${a.temporadaId}:${a.inicio}:${faltan ?? 'x'}`, tipo: 'temporada', nivel: faltan ? 'aviso' : 'info',
          titulo: `«${a.nombre}» empieza ${a.diasParaInicio <= 0 ? 'hoy' : `en ${a.diasParaInicio} ${a.diasParaInicio === 1 ? 'día' : 'días'}`}`,
          detalle: faltan === null ? 'No se pudo calcular qué comprar (el motor analítico no respondió). Revise la temporada.'
            : faltan > 0 ? `${faltan} productos no alcanzarían según lo vendido en temporadas anteriores. Revise qué comprar.`
              : 'Con la existencia actual alcanzaría, según temporadas anteriores.',
          ruta: `/home/que-comprar?temporada=${a.temporadaId}`,
        });
      }
    }

    // Hechos de la última semana (pedido enviado, recibido…)
    lista.push(...(await this.notificaciones.eventosRecientes(ctx, puede)));
    // Visto / no visto (por usuario): las no vistas primero; las vistas siguen abajo, en gris
    const vistas = await this.notificaciones.vistas(ctx.usuario.sub, lista.map((n) => n.id));
    for (const n of lista) n.visto = vistas.has(n.id);
    lista.sort((x, y) => Number(x.visto) - Number(y.visto) || String(y.fecha ?? '9').localeCompare(String(x.fecha ?? '9')));
    return { data: lista };
  }

  /** Marcar como vistas (o no vistas) una o varias notificaciones. */
  @Put('vistas')
  async marcar(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const { claves, visto } = z.object({ claves: z.array(z.string().min(1).max(200)).min(1).max(300), visto: z.boolean().default(true) }).parse(body);
    await this.notificaciones.marcar(ctx.usuario.sub, claves, visto);
    return { message: visto ? 'Marcadas como vistas' : 'Marcadas como no vistas' };
  }
}
