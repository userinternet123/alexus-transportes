/**
 * SALUD FINANCIERA: el API consulta (solo lectura, con permiso de costos) y el motor analítico local (Python) calcula
 * el estado de resultados, los indicadores con semáforo, el punto de equilibrio, el efectivo y el IVA estimado.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ejecutarLectura, hoyGuatemala } from '../agente/agente.contexto';
import { llamarAnalitica } from '../temporadas/analitica.cliente';
import { armarMeses, consultasFinanzas, ultimosMeses } from './finanzas.consultas';

const MESES = 25; // 24 completos + el mes en curso
const DIAS_SIN_MOVIMIENTO = 180;

@Injectable()
export class FinanzasService {
  constructor(private readonly prisma: PrismaService) {}

  async salud(comprasConIva: boolean) {
    const mesActual = hoyGuatemala().slice(0, 7);
    const meses = ultimosMeses(mesActual, MESES);
    const q = consultasFinanzas(`${meses[0]}-01`, DIAS_SIN_MOVIMIENTO);
    const leer = (k: string) => ejecutarLectura(this.prisma, q[k]);
    const [ventas, devoluciones, compras, caja, planilla, cobros, gastos, inventario, gastosOtros] = await Promise.all(
      ['ventas', 'devoluciones', 'compras', 'caja', 'planilla', 'cobros', 'gastosPorConcepto', 'inventario', 'gastos'].map(leer),
    );
    const datos = armarMeses(meses, { ventas, devoluciones, compras, caja, planilla, cobros, gastos: gastosOtros });
    const inv = inventario[0] ?? {};
    const r = await llamarAnalitica<Record<string, unknown>>('/v1/finanzas/analizar', {
      meses: datos, mes_actual: mesActual, compras_con_iva: comprasConIva,
      inventario: { costo: Number(inv.costo ?? 0), sin_movimiento_costo: Number(inv.sin_movimiento_costo ?? 0), dias_sin_movimiento: DIAS_SIN_MOVIMIENTO },
    }, 60_000);
    return { data: { ...r, mesActual, gastosPorConcepto: gastos, comprasConIva } };
  }
}
