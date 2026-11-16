import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Parámetros de negocio editables sin desplegar (tasas IGSS, IVA, tolerancias).
 * Valores por defecto: deben VALIDARSE con contabilidad / asesoría laboral.
 */
export const PARAMETROS_DEFECTO: Record<string, { valor: string; tipo: string; modulo: string; descripcion: string }> = {
  'ventas.iva_porcentaje': { valor: '12', tipo: 'number', modulo: 'Ventas', descripcion: 'IVA (%) — precios incluyen IVA' },
  'ticket.frases': { valor: 'Sujeto a pagos trimestrales ISR', tipo: 'string', modulo: 'Ticket', descripcion: 'Frase del régimen ante SAT que se imprime en el ticket' },
  'ticket.pie': { valor: 'Gracias por su compra', tipo: 'string', modulo: 'Ticket', descripcion: 'Mensaje al pie del ticket' },
  'ticket.ancho_mm': { valor: '80', tipo: 'number', modulo: 'Ticket', descripcion: 'Ancho del papel de la impresora térmica (58 u 80 mm)' },
  'ventas.fel_por_defecto': { valor: 'true', tipo: 'boolean', modulo: 'Ventas', descripcion: 'Emitir factura FEL por defecto en cada venta (el cajero puede desmarcarlo)' },
  'seguridad.sesion_minutos': { valor: '30', tipo: 'number', modulo: 'Seguridad', descripcion: 'Minutos de inactividad antes de cerrar la sesión' },
  'seguridad.aviso_segundos': { valor: '60', tipo: 'number', modulo: 'Seguridad', descripcion: 'Segundos de aviso antes del cierre de sesión' },
  'ventas.validez_cotizacion_dias': { valor: '15', tipo: 'number', modulo: 'Ventas', descripcion: 'Días de validez de una cotización' },
  'inventario.permitir_negativo': { valor: 'false', tipo: 'boolean', modulo: 'Inventario', descripcion: 'Permitir vender sin existencia' },
  'caja.tolerancia_diferencia': { valor: '1.00', tipo: 'number', modulo: 'Caja', descripcion: 'Diferencia (Q) tolerada en arqueo sin justificación' },
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
