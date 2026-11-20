/**
 * REPORTE EN VIVO: el piloto reporta desde el camino (salida, carga, colas, aduana, entrega, incidentes) con hora,
 * ubicación y fotos. El despacho lo ve en la bitácora del viaje y en «En ruta ahora».
 *  - Funciona sin señal: el móvil guarda el reporte con su hora y un uuid; al reenviarlo no se duplica.
 *  - Un INCIDENTE puede abrir un caso con prioridad (y avisar al despacho).
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { reglaNegocio } from '../../common/errors';
import { evidenciaSalida, evidenciasZ, ligarEvidencias, validarHoraEquipo, zLatitud, zLongitud } from '../../common/evidencias';
import { zNum } from '../../common/pipes/zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { validar } from '../../common/pipes/zod';
import { CasosService } from '../casos/casos.service';
import { PRIORIDADES, TIPOS } from '../casos/casos.logica';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ViajesService } from './viajes.service';

export const TIPOS_EVENTO = ['SALIDA', 'LLEGADA_CARGA', 'CARGANDO', 'EN_RUTA', 'EN_COLA', 'ADUANA', 'PARADA', 'LLEGADA_DESTINO', 'DESCARGANDO', 'ENTREGADO', 'INCIDENTE', 'NOTA'] as const;
export const ETIQUETA_EVENTO: Record<(typeof TIPOS_EVENTO)[number], string> = {
  SALIDA: 'Salida', LLEGADA_CARGA: 'Llegó a cargar', CARGANDO: 'Cargando', EN_RUTA: 'En ruta', EN_COLA: 'En cola', ADUANA: 'En aduana', PARADA: 'Parada',
  LLEGADA_DESTINO: 'Llegó al destino', DESCARGANDO: 'Descargando', ENTREGADO: 'Entregado', INCIDENTE: 'Incidente', NOTA: 'Nota',
};

const eventoZ = z.object({
  tipo: z.enum(TIPOS_EVENTO, { errorMap: () => ({ message: 'Elija qué está pasando' }) }),
  texto: z.string().trim().max(500).nullish().transform((v) => v || null),
  latitud: zLatitud,
  longitud: zLongitud,
  precisionM: zNum(z.number().int().nonnegative().max(100_000).nullable().optional()),
  odometro: zNum(z.number().nonnegative().max(9_999_999).nullable().optional()),
  ocurridoEn: z.coerce.date().optional(),
  uuidCliente: z.string().uuid().nullish(),
  evidencias: evidenciasZ,
  caso: z.object({
    tipo: z.enum(TIPOS).default('MECANICO'),
    prioridad: z.enum(PRIORIDADES, { errorMap: () => ({ message: 'Elija la prioridad del incidente' }) }),
    titulo: z.string().trim().min(5, 'Describa el incidente (al menos 5 letras)').max(150),
    impideSalir: z.boolean().default(false),
  }).nullish(),
}).superRefine((d, ctx) => {
  if (d.caso && d.tipo !== 'INCIDENTE') ctx.addIssue({ code: 'custom', path: ['caso'], message: 'Solo un incidente abre un caso' });
  if (d.tipo === 'INCIDENTE' && !d.texto && !d.caso) ctx.addIssue({ code: 'custom', path: ['texto'], message: 'Describa el incidente' });
  if ((d.latitud == null) !== (d.longitud == null)) ctx.addIssue({ code: 'custom', path: ['latitud'], message: 'La ubicación llegó incompleta' });
});

const INCLUIR = { evidencias: { include: { archivo: { select: { mime: true, nombre: true } } } }, registradoPor: { select: { nombre: true } }, caso: { select: { id: true, numero: true, prioridad: true, estado: true } } } as const;

@Injectable()
export class EventosViajeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly viajes: ViajesService,
    private readonly casos: CasosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private salida(e: { id: number; tipo: (typeof TIPOS_EVENTO)[number]; texto: string | null; latitud: unknown; longitud: unknown; precisionM: number | null; odometro: unknown; ocurridoEn: Date; recibidoEn: Date; registradoPor: { nombre: string }; caso: { id: number; numero: string; prioridad: string; estado: string } | null; evidencias: Parameters<typeof evidenciaSalida>[0][] }) {
    return {
      id: e.id, tipo: e.tipo, etiqueta: ETIQUETA_EVENTO[e.tipo], texto: e.texto, latitud: e.latitud, longitud: e.longitud, precisionM: e.precisionM, odometro: e.odometro,
      ocurridoEn: e.ocurridoEn, recibidoEn: e.recibidoEn, sinSenalMin: Math.max(0, Math.round((e.recibidoEn.getTime() - e.ocurridoEn.getTime()) / 60_000)),
      reporto: e.registradoPor.nombre, caso: e.caso, evidencias: e.evidencias.map(evidenciaSalida),
    };
  }

  async listar(ctx: Ctx, viajeId: number) {
    await this.viajes.cargar(ctx, viajeId);
    const filas = await this.prisma.eventoViaje.findMany({ where: { viajeId }, orderBy: { ocurridoEn: 'desc' }, include: INCLUIR });
    return { data: filas.map((e) => this.salida(e)) };
  }

  async reportar(ctx: Ctx, viajeId: number, body: unknown) {
    const d = validar(eventoZ, body);
    const ocurridoEn = d.ocurridoEn ?? new Date();
    validarHoraEquipo(ocurridoEn);
    // Reenvío desde el móvil (sin señal): devuelve lo ya registrado
    if (d.uuidCliente) {
      const ya = await this.prisma.eventoViaje.findUnique({ where: { uuidCliente: d.uuidCliente }, include: INCLUIR });
      if (ya) {
        if (ya.viajeId !== viajeId) throw reglaNegocio('UUID_REPETIDO', 'Ese identificador ya se usó en otro viaje');
        return { data: this.salida(ya), message: 'Reporte ya recibido' };
      }
    }
    const plazos = d.caso ? await this.casos.todosLosPlazos() : null;
    const r = await this.prisma.enTransaccion(async (tx) => {
      const v = await this.viajes.cargar(ctx, viajeId, tx);
      if (v.estado === 'CANCELADO' || v.estado === 'LIQUIDADO') throw reglaNegocio('ESTADO_VIAJE', `El viaje ${v.numero} ya está ${v.estado === 'CANCELADO' ? 'cancelado' : 'liquidado'}: no admite reportes`);
      let casoId: number | null = null;
      let caso: { numero: string; prioridad: string } | null = null;
      if (d.caso) {
        const [c] = await this.casos.crearEn(tx, ctx, [{
          sucursalId: v.sucursalId, origen: 'VIAJE', tipo: d.caso.tipo, prioridad: d.caso.prioridad, titulo: d.caso.titulo, descripcion: d.texto,
          impideSalir: d.caso.impideSalir, cabezalId: v.cabezalId, remolqueId: v.remolqueId, viajeId: v.id,
        }], plazos!);
        await tx.caso.update({ where: { id: c.id }, data: { latitud: d.latitud ?? null, longitud: d.longitud ?? null } });
        await ligarEvidencias(tx, ctx, d.evidencias, { casoId: c.id });
        casoId = c.id; caso = c;
      }
      const e = await tx.eventoViaje.create({ data: {
        viajeId, tipo: d.tipo, texto: d.texto, latitud: d.latitud ?? null, longitud: d.longitud ?? null, precisionM: d.precisionM ?? null, odometro: d.odometro ?? null,
        ocurridoEn, uuidCliente: d.uuidCliente ?? null, casoId, registradoPorId: ctx.usuario.sub,
      } });
      await ligarEvidencias(tx, ctx, d.evidencias, { eventoViajeId: e.id });
      await this.audit.registrar(ctx, { accion: 'REPORTAR', entidad: 'EventoViaje', entidadId: e.id, despues: { viajeId, tipo: d.tipo, fotos: d.evidencias.length, caso: caso?.numero ?? null } }, tx);
      return { v, e, caso };
    });
    if (d.tipo === 'INCIDENTE') {
      await this.notificaciones.evento({
        sucursalId: r.v.sucursalId, permiso: 'viajes.crear', tipo: 'viaje-incidente', nivel: r.caso?.prioridad === 'URGENTE' || d.caso?.impideSalir ? 'critico' : 'aviso',
        titulo: `Incidente en el viaje ${r.v.numero}`, detalle: `${d.caso?.titulo ?? d.texto ?? ''}${r.caso ? ` · caso ${r.caso.numero}` : ''}`.slice(0, 300), ruta: `/home/viajes?id=${r.v.id}`,
      });
    }
    const e = await this.prisma.eventoViaje.findUniqueOrThrow({ where: { id: r.e.id }, include: INCLUIR });
    return { data: this.salida(e), message: `${ETIQUETA_EVENTO[d.tipo]} reportado${d.evidencias.length ? ` con ${d.evidencias.length} foto(s)` : ''}${r.caso ? ` · caso ${r.caso.numero}` : ''}` };
  }

  /** Viajes en ruta con su último reporte: qué está pasando y desde cuándo no se sabe de cada uno. */
  async enVivo(ctx: Ctx) {
    if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo');
    const propio = await this.viajes.pilotoPropio(ctx);
    const viajes = await this.prisma.viaje.findMany({
      where: { sucursalId: ctx.sucursalId, estado: 'EN_RUTA', ...(propio != null ? { pilotoId: propio } : {}) },
      orderBy: { iniciadoEn: 'asc' },
      include: {
        cabezal: { select: { codigo: true } }, piloto: { select: { empleado: { select: { nombres: true, apellidos: true, telefono: true } } } },
        cliente: { select: { nombreComercial: true, razonSocial: true } },
        eventos: { orderBy: { ocurridoEn: 'desc' }, take: 1, include: INCLUIR },
        casos: { where: { estado: { in: ['ABIERTO', 'EN_PROCESO'] } }, select: { numero: true, prioridad: true } },
      },
    });
    const ahora = Date.now();
    return { data: viajes.map((v) => {
      const u = v.eventos[0];
      const desde = u?.ocurridoEn ?? v.iniciadoEn ?? v.fechaSalida;
      return {
        id: v.id, numero: v.numero, cabezal: v.cabezal.codigo, piloto: `${v.piloto.empleado.nombres} ${v.piloto.empleado.apellidos}`, telefono: v.piloto.empleado.telefono,
        cliente: v.cliente.nombreComercial || v.cliente.razonSocial, destino: v.destino, salio: v.iniciadoEn, compromiso: v.fechaCompromiso,
        ultimo: u ? this.salida(u) : null, minutosSinReporte: Math.round((ahora - desde.getTime()) / 60_000),
        atrasado: v.fechaCompromiso ? v.fechaCompromiso.getTime() < ahora : false, casosAbiertos: v.casos,
      };
    }) };
  }
}
