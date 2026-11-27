import { Injectable } from '@nestjs/common';
import { TipoAusencia } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import type { Ctx } from '../../common/auth/tipos';
import { conflicto, noEncontrado, reglaNegocio } from '../../common/errors';
import { parseFecha } from '../../common/fecha';
import { D, Decimal, r2, suma } from '../../common/money';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { repartirDescuentos } from '../incidentes/incidentes.logica';
import { calcularLineaPlanilla, diasEnPeriodo, TasasPlanilla } from './planilla.calculo';

const AUSENCIAS_NO_PAGADAS: TipoAusencia[] = ['PERMISO_SIN_GOCE', 'FALTA_INJUSTIFICADA', 'SUSPENSION_IGSS'];

@Injectable()
export class RrhhService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────────── ASISTENCIA ─────────────────────────────
  async registrarAsistencia(ctx: Ctx, dto: { empleadoId: number; fecha: string; entrada?: string; salida?: string; origen?: string; horasNormales?: number; horasExtra?: number }) {
    const jornada = D(await this.parametros.numero('rrhh.horas_jornada'));
    let horasNormales = D(0);
    let horasExtra = D(0);
    // Pilotos en ruta: no marcan entrada y salida; se registran las horas del día (normales y extra) directamente
    if (dto.horasNormales != null || dto.horasExtra != null) {
      horasNormales = D(dto.horasNormales ?? jornada);
      horasExtra = D(dto.horasExtra ?? 0);
    } else if (dto.entrada && dto.salida) {
      const horas = D(new Date(dto.salida).getTime() - new Date(dto.entrada).getTime()).div(3_600_000);
      if (horas.lte(0)) throw reglaNegocio('ASISTENCIA_INVALIDA', 'La salida debe ser posterior a la entrada');
      horasNormales = horas.gt(jornada) ? jornada : horas;
      horasExtra = horas.gt(jornada) ? horas.minus(jornada) : D(0);
    }
    const fecha = parseFecha(dto.fecha);
    const data = await this.prisma.asistencia.upsert({
      where: { empleadoId_fecha: { empleadoId: dto.empleadoId, fecha } },
      create: {
        empleadoId: dto.empleadoId, fecha, entrada: dto.entrada ? new Date(dto.entrada) : null, salida: dto.salida ? new Date(dto.salida) : null,
        horasNormales: r2(horasNormales), horasExtra: r2(horasExtra), origen: dto.origen ?? 'MANUAL',
      },
      update: {
        entrada: dto.entrada ? new Date(dto.entrada) : undefined, salida: dto.salida ? new Date(dto.salida) : undefined,
        horasNormales: r2(horasNormales), horasExtra: r2(horasExtra), origen: dto.origen ?? 'MANUAL',
      },
    });
    await this.audit.registrar(ctx, { accion: 'ASISTENCIA', entidad: 'Asistencia', entidadId: data.id, despues: data });
    return { data };
  }

  async asistencias(desde: Date, hasta: Date, empleadoId?: number) {
    const data = await this.prisma.asistencia.findMany({
      where: { fecha: { gte: desde, lte: hasta }, ...(empleadoId ? { empleadoId } : {}) },
      include: { empleado: { select: { codigo: true, nombres: true, apellidos: true } } },
      orderBy: [{ fecha: 'desc' }],
      take: 5000,
    });
    return { data };
  }

  // ───────────────────────────── AUSENCIAS ──────────────────────────────
  async solicitarAusencia(ctx: Ctx, dto: { empleadoId: number; tipo: TipoAusencia; desde: string; hasta: string; observacion?: string }) {
    const desde = parseFecha(dto.desde);
    const hasta = parseFecha(dto.hasta);
    if (hasta < desde) throw reglaNegocio('RANGO_INVALIDO', 'Rango de fechas inválido');
    const dias = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1;
    const traslape = await this.prisma.ausencia.findFirst({
      where: { empleadoId: dto.empleadoId, estado: { not: 'RECHAZADA' }, desde: { lte: hasta }, hasta: { gte: desde } },
    });
    if (traslape) throw conflicto('AUSENCIA_TRASLAPE', 'Ya existe una ausencia en ese rango');
    const data = await this.prisma.ausencia.create({ data: { empleadoId: dto.empleadoId, tipo: dto.tipo, desde, hasta, dias, observacion: dto.observacion } });
    await this.audit.registrar(ctx, { accion: 'SOLICITAR_AUSENCIA', entidad: 'Ausencia', entidadId: data.id, despues: data });
    return { data, message: 'Ausencia registrada' };
  }

  async resolverAusencia(ctx: Ctx, id: number, aprobar: boolean) {
    const a = await this.prisma.ausencia.findUnique({ where: { id } });
    if (!a) throw noEncontrado('Ausencia', id);
    if (a.estado !== 'SOLICITADA') throw reglaNegocio('AUSENCIA_ESTADO', `La ausencia ya está ${a.estado}`);
    const data = await this.prisma.ausencia.update({ where: { id }, data: { estado: aprobar ? 'APROBADA' : 'RECHAZADA', aprobadaPor: ctx.usuario.sub } });
    await this.audit.registrar(ctx, { accion: aprobar ? 'APROBAR_AUSENCIA' : 'RECHAZAR_AUSENCIA', entidad: 'Ausencia', entidadId: id });
    return { data };
  }

  async ausencias(estado?: string) {
    const data = await this.prisma.ausencia.findMany({
      where: estado ? { estado } : {},
      include: { empleado: { select: { codigo: true, nombres: true, apellidos: true } } },
      orderBy: { id: 'desc' },
      take: 1000,
    });
    return { data };
  }

  // ───────────────────────────── PLANILLA ───────────────────────────────
  /** Tasas de la planilla. Lo que la empresa no paga hoy (parámetros rrhh.paga_*) queda en cero. */
  private async tasas(): Promise<TasasPlanilla> {
    const n = (k: string) => this.parametros.numero(k);
    const si = (k: string) => this.parametros.booleano(k);
    const [igss, irtra, intecap, prestaciones] = await Promise.all([si('rrhh.paga_igss'), si('rrhh.paga_irtra'), si('rrhh.paga_intecap'), si('rrhh.provisiona_prestaciones')]);
    return {
      igssLaboral: igss ? await n('rrhh.igss_laboral') : 0,
      igssPatronal: igss ? await n('rrhh.igss_patronal') : 0,
      irtra: irtra ? await n('rrhh.irtra') : 0,
      intecap: intecap ? await n('rrhh.intecap') : 0,
      factorHoraExtra: await n('rrhh.factor_hora_extra'),
      horasJornada: await n('rrhh.horas_jornada'),
      provisionAguinaldo: prestaciones ? await n('rrhh.provision_aguinaldo') : 0,
      provisionBono14: prestaciones ? await n('rrhh.provision_bono14') : 0,
      provisionIndemnizacion: prestaciones ? await n('rrhh.provision_indemnizacion') : 0,
    };
  }

  /** Genera (o regenera si está en BORRADOR) la planilla del período. */
  async generarPlanilla(ctx: Ctx, dto: { anio: number; mes: number; tipo: 'MENSUAL' | 'QUINCENAL'; quincena?: 1 | 2 }) {
    const quincenal = dto.tipo === 'QUINCENAL';
    const q = quincenal ? (dto.quincena ?? 1) : 0;
    const ultimoDia = new Date(Date.UTC(dto.anio, dto.mes, 0)).getUTCDate();
    const inicio = new Date(Date.UTC(dto.anio, dto.mes - 1, quincenal && q === 2 ? 16 : 1));
    const fin = new Date(Date.UTC(dto.anio, dto.mes - 1, quincenal && q === 1 ? 15 : ultimoDia));
    const periodo = `${dto.anio}-${String(dto.mes).padStart(2, '0')}${quincenal ? `-Q${q}` : ''}`;
    const diasPeriodo = quincenal ? 15 : 30;
    const fraccion = quincenal ? 0.5 : 1;
    const tasas = await this.tasas();

    const resultado = await this.prisma.enTransaccion(async (tx) => {
      const existente = await tx.planilla.findUnique({ where: { periodo_tipo: { periodo, tipo: dto.tipo } } });
      if (existente && existente.estado !== 'BORRADOR') throw conflicto('PLANILLA_CERRADA', `La planilla ${periodo} ya está ${existente.estado}`);
      if (existente) {
        await tx.planillaDetalle.deleteMany({ where: { planillaId: existente.id } });
        await tx.descuentoIncidente.deleteMany({ where: { planillaId: existente.id } });
      }
      const topeCuota = await this.parametros.numero('incidentes.max_cuota_piloto');

      const planilla = existente
        ? await tx.planilla.update({ where: { id: existente.id }, data: { generadaPor: ctx.usuario.sub, fechaInicio: inicio, fechaFin: fin } })
        : await tx.planilla.create({ data: { periodo, tipo: dto.tipo, fechaInicio: inicio, fechaFin: fin, generadaPor: ctx.usuario.sub } });

      const empleados = await tx.empleado.findMany({
        where: { fechaIngreso: { lte: fin }, OR: [{ fechaBaja: null }, { fechaBaja: { gte: inicio } }], estado: { not: 'BAJA' } },
        include: { usuario: { select: { id: true } }, piloto: { select: { id: true } } },
      });

      const lineas = [];
      const cuotas: { planillaId: number; incidenteId: number; empleadoId: number; monto: Decimal }[] = [];
      for (const e of empleados) {
        // Pago por viaje: bono fijo por cada viaje FINALIZADO o LIQUIDADO del piloto en el período (comisiones de la planilla)
        const [horas, ausencias, viajes] = await Promise.all([
          tx.asistencia.aggregate({ where: { empleadoId: e.id, fecha: { gte: inicio, lte: fin } }, _sum: { horasExtra: true } }),
          tx.ausencia.findMany({ where: { empleadoId: e.id, estado: 'APROBADA', tipo: { in: AUSENCIAS_NO_PAGADAS }, desde: { lte: fin }, hasta: { gte: inicio } } }),
          tx.viaje.aggregate({ where: { piloto: { empleadoId: e.id }, estado: { in: ['FINALIZADO', 'LIQUIDADO'] }, fechaSalida: { gte: inicio, lte: fin } }, _sum: { pagoPiloto: true } }),
        ]);
        // Días de ausencia no pagada dentro del período
        const diasNoPagados = ausencias.reduce((acc, a) => {
          const d1 = a.desde > inicio ? a.desde : inicio;
          const d2 = a.hasta < fin ? a.hasta : fin;
          return acc + Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1);
        }, 0);
        // Descuentos por incidentes del piloto (multas o daños de los que fue responsable), en cuotas y con tope
        let descIncidentes = D(0);
        if (e.piloto) {
          const pendientes = await tx.incidente.findMany({
            where: { pilotoId: e.piloto.id, estado: { not: 'ANULADO' }, responsable: 'PILOTO', descuentoPiloto: { gt: 0 } },
            select: { id: true, descuentoPiloto: true, cuotasDescuento: true, descontado: true, descuentos: { where: { planilla: { estado: 'BORRADOR' }, planillaId: { not: planilla.id } }, select: { monto: true } } },
          });
          const tope = D(e.salarioBase).times(fraccion).times(topeCuota).div(100);
          for (const c of repartirDescuentos(pendientes.map((p) => ({ incidenteId: p.id, descuento: p.descuentoPiloto, cuotas: p.cuotasDescuento, descontado: p.descontado, reservado: suma(p.descuentos.map((x) => x.monto)) })), tope)) {
            cuotas.push({ planillaId: planilla.id, incidenteId: c.incidenteId, empleadoId: e.id, monto: c.monto });
            descIncidentes = descIncidentes.plus(c.monto);
          }
        }
        const diasBase = diasEnPeriodo(inicio, fin, diasPeriodo, e.fechaIngreso, e.fechaBaja);
        const linea = calcularLineaPlanilla(
          {
            salarioBaseMensual: e.salarioBase,
            bonificacionIncentivoMensual: e.bonificacionIncentivo,
            fraccionPeriodo: fraccion,
            diasPeriodo,
            diasLaborados: Math.max(0, diasBase - diasNoPagados),
            horasExtra: horas._sum.horasExtra ?? 0,
            porcentajeComision: e.porcentajeComision,
            ventasNetasPeriodo: D(0),
            pagoPorViajes: D(viajes._sum.pagoPiloto),
            otrosDescuentos: descIncidentes,
          },
          tasas,
        );
        lineas.push({ planillaId: planilla.id, empleadoId: e.id, ...linea });
      }
      if (lineas.length) await tx.planillaDetalle.createMany({ data: lineas });
      if (cuotas.length) await tx.descuentoIncidente.createMany({ data: cuotas });

      const totales = await tx.planilla.update({
        where: { id: planilla.id },
        data: {
          totalDevengado: suma(lineas.map((l) => l.totalDevengado)),
          totalDescuentos: suma(lineas.map((l) => l.totalDescuentos)),
          totalLiquido: suma(lineas.map((l) => l.liquido)),
          totalPatronal: suma(lineas.map((l) => l.igssPatronal.plus(l.irtra).plus(l.intecap))),
        },
      });
      await this.audit.registrar(ctx, { accion: 'GENERAR_PLANILLA', entidad: 'Planilla', entidadId: planilla.id, despues: { periodo, empleados: lineas.length } }, tx);
      return totales;
    });
    return { data: resultado, message: `Planilla ${periodo} generada (${resultado.totalLiquido.toString()} líquido)` };
  }

  /** Ajuste manual de ISR / otros descuentos / otros ingresos en BORRADOR. */
  async ajustarLinea(ctx: Ctx, planillaId: number, empleadoId: number, dto: { isr?: number; otrosDescuentos?: number; otrosIngresos?: number }) {
    const tasas = await this.tasas();
    const data = await this.prisma.enTransaccion(async (tx) => {
      const p = await tx.planilla.findUnique({ where: { id: planillaId } });
      if (!p) throw noEncontrado('Planilla', planillaId);
      if (p.estado !== 'BORRADOR') throw reglaNegocio('PLANILLA_ESTADO', 'Solo se ajustan planillas en BORRADOR');
      const l = await tx.planillaDetalle.findUnique({ where: { planillaId_empleadoId: { planillaId, empleadoId } }, include: { empleado: true } });
      if (!l) throw noEncontrado('Línea de planilla');
      const otrosIngresos = D(dto.otrosIngresos ?? l.otrosIngresos);
      const baseAfecta = D(l.salarioDevengado).plus(D(l.horasExtraMonto)).plus(D(l.comisiones)).plus(otrosIngresos);
      const igss = r2(baseAfecta.times(D(tasas.igssLaboral)).div(100));
      const isr = r2(dto.isr ?? l.isr);
      // Lo que se escribe a mano se suma a las cuotas por incidentes (esas no se quitan desde aquí)
      const incidentes = suma((await tx.descuentoIncidente.findMany({ where: { planillaId, empleadoId }, select: { monto: true } })).map((x) => x.monto));
      const otrosDescuentos = r2(dto.otrosDescuentos != null ? D(dto.otrosDescuentos).plus(incidentes) : l.otrosDescuentos);
      const totalDevengado = baseAfecta.plus(D(l.bonificacionIncentivo));
      const totalDescuentos = igss.plus(isr).plus(otrosDescuentos);
      const pctPat = (t: number) => r2(baseAfecta.times(t).div(100));
      const act = await tx.planillaDetalle.update({
        where: { id: l.id },
        data: {
          otrosIngresos, isr, otrosDescuentos, igssLaboral: igss, totalDevengado, totalDescuentos, liquido: totalDevengado.minus(totalDescuentos),
          igssPatronal: pctPat(Number(tasas.igssPatronal)), irtra: pctPat(Number(tasas.irtra)), intecap: pctPat(Number(tasas.intecap)),
        },
      });
      const lineas = await tx.planillaDetalle.findMany({ where: { planillaId } });
      await tx.planilla.update({
        where: { id: planillaId },
        data: {
          totalDevengado: suma(lineas.map((x) => x.totalDevengado)),
          totalDescuentos: suma(lineas.map((x) => x.totalDescuentos)),
          totalLiquido: suma(lineas.map((x) => x.liquido)),
          totalPatronal: suma(lineas.map((x) => D(x.igssPatronal).plus(D(x.irtra)).plus(D(x.intecap)))),
        },
      });
      await this.audit.registrar(ctx, { accion: 'AJUSTE_PLANILLA', entidad: 'PlanillaDetalle', entidadId: l.id, antes: l, despues: act }, tx);
      return act;
    });
    return { data };
  }

  async aprobarPlanilla(ctx: Ctx, id: number) {
    const p = await this.prisma.planilla.findUnique({ where: { id } });
    if (!p) throw noEncontrado('Planilla', id);
    if (p.estado !== 'BORRADOR') throw reglaNegocio('PLANILLA_ESTADO', `La planilla está ${p.estado}`);
    if (p.generadaPor === ctx.usuario.sub) throw reglaNegocio('SEGREGACION', 'Quien genera la planilla no puede aprobarla (segregación de funciones)');
    const data = await this.prisma.enTransaccion(async (tx) => {
      const act = await tx.planilla.update({ where: { id }, data: { estado: 'APROBADA', aprobadaPor: ctx.usuario.sub } });
      // Las cuotas por incidentes de esta planilla cuentan como descontadas al piloto
      for (const c of await tx.descuentoIncidente.findMany({ where: { planillaId: id } })) await tx.incidente.update({ where: { id: c.incidenteId }, data: { descontado: { increment: c.monto } } });
      await this.audit.registrar(ctx, { accion: 'APROBAR_PLANILLA', entidad: 'Planilla', entidadId: id }, tx);
      return act;
    });
    return { data, message: 'Planilla aprobada' };
  }

  async planillas() {
    return { data: await this.prisma.planilla.findMany({ orderBy: { id: 'desc' }, take: 60 }) };
  }

  async planilla(id: number) {
    const data = await this.prisma.planilla.findUnique({
      where: { id },
      include: {
        detalles: {
          include: { empleado: { select: { codigo: true, nombres: true, apellidos: true, cui: true, afiliacionIgss: true, puesto: { select: { nombre: true } } } } },
          orderBy: { empleado: { apellidos: 'asc' } },
        },
        descuentos: { select: { empleadoId: true, monto: true, incidente: { select: { id: true, numero: true, tipo: true, descripcion: true } } } },
      },
    });
    if (!data) throw noEncontrado('Planilla', id);
    return { data };
  }
}
