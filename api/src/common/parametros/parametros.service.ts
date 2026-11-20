import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Parámetros de negocio editables sin desplegar (tasas IGSS, margen objetivo, tolerancias).
 * Valores por defecto: deben VALIDARSE con contabilidad / asesoría laboral.
 */
export const PARAMETROS_DEFECTO: Record<string, { valor: string; tipo: string; modulo: string; descripcion: string }> = {
  'seguridad.sesion_minutos': { valor: '30', tipo: 'number', modulo: 'Seguridad', descripcion: 'Minutos de inactividad antes de cerrar la sesión' },
  'seguridad.aviso_segundos': { valor: '60', tipo: 'number', modulo: 'Seguridad', descripcion: 'Segundos de aviso antes del cierre de sesión' },
  'viajes.margen_objetivo': { valor: '25', tipo: 'number', modulo: 'Viajes', descripcion: 'Margen (%) sobre el costo que propone el cotizador' },
  'viajes.meta_km_vacios': { valor: '15', tipo: 'number', modulo: 'Viajes', descripcion: 'Porcentaje máximo aceptable de km vacíos (sin carga)' },
  'viajes.exigir_inspeccion': { valor: 'true', tipo: 'boolean', modulo: 'Viajes', descripcion: 'Un viaje solo inicia con una inspección pre viaje aprobada de las últimas 24 horas' },
  'cotizador.dias_historial': { valor: '90', tipo: 'number', modulo: 'Viajes', descripcion: 'Días de historial para calcular el costo indirecto por km (taller, llantas, sueldos, gastos fijos)' },
  'cotizador.km_minimos': { valor: '2000', tipo: 'number', modulo: 'Viajes', descripcion: 'Km mínimos de viajes en ese período para confiar en el historial' },
  'cotizador.costo_km_indirecto': { valor: '0', tipo: 'number', modulo: 'Viajes', descripcion: 'Costo indirecto por km (Q) a usar mientras no haya historial suficiente' },
  'cotizador.vigencia_dias': { valor: '15', tipo: 'number', modulo: 'Viajes', descripcion: 'Días de vigencia de una cotización' },
  'cotizador.terreno_ondulado_combustible': { valor: '8', tipo: 'number', modulo: 'Viajes', descripcion: 'Consumo extra de combustible (%) en terreno ondulado (referencia; ajústelo con su historial)' },
  'cotizador.terreno_montana_combustible': { valor: '20', tipo: 'number', modulo: 'Viajes', descripcion: 'Consumo extra de combustible (%) en montaña, si la ruta no tiene la subida acumulada' },
  'cotizador.terreno_ondulado_desgaste': { valor: '5', tipo: 'number', modulo: 'Viajes', descripcion: 'Desgaste extra (%) de frenos, llantas y motor en terreno ondulado' },
  'cotizador.terreno_montana_desgaste': { valor: '15', tipo: 'number', modulo: 'Viajes', descripcion: 'Desgaste extra (%) de frenos, llantas y motor en montaña' },
  'cotizador.galones_por_100m_subida': { valor: '0.6', tipo: 'number', modulo: 'Viajes', descripcion: 'Galones extra por cada 100 m de subida con carga (referencia; ajústelo con su historial)' },
  'cotizador.trafico_normal': { valor: '3', tipo: 'number', modulo: 'Viajes', descripcion: 'Consumo extra (%) con tráfico normal (paradas, ciudad)' },
  'cotizador.trafico_lento': { valor: '10', tipo: 'number', modulo: 'Viajes', descripcion: 'Consumo extra (%) con tráfico lento' },
  'cotizador.trafico_muy_lento': { valor: '20', tipo: 'number', modulo: 'Viajes', descripcion: 'Consumo extra (%) con tráfico muy lento o embotellamientos' },
  'cotizador.velocidad_promedio': { valor: '45', tipo: 'number', modulo: 'Viajes', descripcion: 'Velocidad promedio (km/h) para estimar la duración si la ruta no tiene horas' },
  'cotizador.costo_hora_espera': { valor: '0', tipo: 'number', modulo: 'Viajes', descripcion: 'Costo por hora de espera o cola (Q): piloto, ralentí, cabezal parado' },
  'rrhh.paga_igss': { valor: 'true', tipo: 'boolean', modulo: 'Costos laborales', descripcion: 'La empresa paga IGSS hoy (la planilla calcula la cuota laboral y la patronal)' },
  'rrhh.paga_irtra': { valor: 'true', tipo: 'boolean', modulo: 'Costos laborales', descripcion: 'La empresa paga IRTRA hoy' },
  'rrhh.paga_intecap': { valor: 'true', tipo: 'boolean', modulo: 'Costos laborales', descripcion: 'La empresa paga INTECAP hoy' },
  'rrhh.provisiona_prestaciones': { valor: 'true', tipo: 'boolean', modulo: 'Costos laborales', descripcion: 'La planilla provisiona aguinaldo, bono 14 e indemnización' },
  'costos.incluir_igss': { valor: 'true', tipo: 'boolean', modulo: 'Costos laborales', descripcion: 'Incluir IGSS patronal en el costo por km, el cotizador y la ganancia (aunque hoy no se pague)' },
  'costos.incluir_irtra': { valor: 'true', tipo: 'boolean', modulo: 'Costos laborales', descripcion: 'Incluir IRTRA en los costos (aunque hoy no se pague)' },
  'costos.incluir_intecap': { valor: 'true', tipo: 'boolean', modulo: 'Costos laborales', descripcion: 'Incluir INTECAP en los costos (aunque hoy no se pague)' },
  'costos.incluir_prestaciones': { valor: 'true', tipo: 'boolean', modulo: 'Costos laborales', descripcion: 'Incluir aguinaldo, bono 14 e indemnización en los costos (aunque hoy no se provisionen)' },
  'costos.estimar_sueldos': { valor: 'true', tipo: 'boolean', modulo: 'Costos laborales', descripcion: 'Sin planillas aprobadas en el período, estimar los sueldos con los empleados activos' },
  'casos.horas_urgente': { valor: '4', tipo: 'number', modulo: 'Casos', descripcion: 'Horas para atender un caso URGENTE' },
  'casos.horas_alta': { valor: '24', tipo: 'number', modulo: 'Casos', descripcion: 'Horas para atender un caso de prioridad ALTA' },
  'casos.horas_moderada': { valor: '72', tipo: 'number', modulo: 'Casos', descripcion: 'Horas para atender un caso MODERADO' },
  'casos.horas_baja': { valor: '168', tipo: 'number', modulo: 'Casos', descripcion: 'Horas para atender un caso de prioridad BAJA' },
  'combustible.precio_galon': { valor: '30.00', tipo: 'number', modulo: 'Combustible', descripcion: 'Precio de referencia del galón de diésel (Q) para cotizar' },
  'combustible.alerta_rendimiento': { valor: '15', tipo: 'number', modulo: 'Combustible', descripcion: 'Caída (%) del rendimiento km/gal frente al esperado que dispara una alerta' },
  'mantenimiento.aviso_km': { valor: '1000', tipo: 'number', modulo: 'Mantenimiento', descripcion: 'Km de anticipación con que se avisa un servicio' },
  'flota.aviso_documentos_dias': { valor: '30', tipo: 'number', modulo: 'Flota', descripcion: 'Días de anticipación para avisar vencimientos (seguro, tarjeta, licencia)' },
  'rrhh.igss_laboral': { valor: '4.83', tipo: 'number', modulo: 'RRHH', descripcion: 'Cuota laboral IGSS (%)' },
  'rrhh.igss_patronal': { valor: '10.67', tipo: 'number', modulo: 'RRHH', descripcion: 'Cuota patronal IGSS (%)' },
  'rrhh.irtra': { valor: '1.00', tipo: 'number', modulo: 'RRHH', descripcion: 'IRTRA patronal (%)' },
  'rrhh.intecap': { valor: '1.00', tipo: 'number', modulo: 'RRHH', descripcion: 'INTECAP patronal (%)' },
  'rrhh.factor_hora_extra': { valor: '1.5', tipo: 'number', modulo: 'RRHH', descripcion: 'Factor de pago de hora extra' },
  'rrhh.horas_jornada': { valor: '8', tipo: 'number', modulo: 'RRHH', descripcion: 'Horas de jornada ordinaria diaria' },
  'rrhh.provision_aguinaldo': { valor: '8.33', tipo: 'number', modulo: 'RRHH', descripcion: 'Provisión mensual aguinaldo (%)' },
  'rrhh.provision_bono14': { valor: '8.33', tipo: 'number', modulo: 'RRHH', descripcion: 'Provisión mensual Bono 14 (%)' },
  'rrhh.provision_indemnizacion': { valor: '8.33', tipo: 'number', modulo: 'RRHH', descripcion: 'Provisión mensual indemnización (%)' },
};

@Injectable()
export class ParametrosService {
  private cache = new Map<string, { valor: string; expira: number }>();
  private readonly ttlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async texto(clave: string): Promise<string> {
    const c = this.cache.get(clave);
    if (c && c.expira > Date.now()) return c.valor;
    const p = await this.prisma.parametroSistema.findUnique({ where: { clave } });
    const valor = p?.valor ?? PARAMETROS_DEFECTO[clave]?.valor;
    if (valor === undefined) throw new Error(`Parámetro no definido: ${clave}`);
    this.cache.set(clave, { valor, expira: Date.now() + this.ttlMs });
    return valor;
  }

  async numero(clave: string): Promise<number> {
    const n = Number(await this.texto(clave));
    if (Number.isNaN(n)) throw new Error(`Parámetro ${clave} no es numérico`);
    return n;
  }

  async booleano(clave: string): Promise<boolean> {
    return (await this.texto(clave)).toLowerCase() === 'true';
  }

  invalidar(clave?: string): void {
    if (clave) this.cache.delete(clave);
    else this.cache.clear();
  }
}

@Global()
@Module({ providers: [ParametrosService], exports: [ParametrosService] })
export class ParametrosModule {}
