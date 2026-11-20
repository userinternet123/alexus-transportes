import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { Ctx, tienePermiso } from './tipos';

/**
 * COSTOS Y GANANCIAS SOLO PARA GERENCIA
 * Sin el permiso `finanzas.costos`, el API quita de TODAS sus respuestas los
 * campos de costo, utilidad y margen (y las columnas de reportes con esos datos).
 * Se hace en el servidor: ocultarlos solo en pantalla no protege la información.
 */
export const PERMISO_COSTOS = 'finanzas.costos';

export const CAMPOS_SENSIBLES = new Set([
  'costo', 'costoPromedio', 'costoUnitario', 'costoTotal', 'costoVentas', 'costoEstimado',
  'valorCosto', 'valorInmovilizado', 'saldoCostoPromedio', 'saldoCosto',
  'utilidad', 'utilidadBruta', 'margen', 'margenPorcentaje', 'ganancia',
  // Transporte: prorrateo de costos indirectos y márgenes del cotizador
  'prorrateo', 'costoKm', 'costoKmFijo', 'costoPorKm', 'costoKmIndirecto', 'periodoCostoKm', 'margenTarifaActual',
]);

const esHoja = (v: unknown) =>
  v === null || typeof v !== 'object' || v instanceof Date || Buffer.isBuffer(v) || (v as object).constructor?.name === 'Decimal';

/** Copia sin campos sensibles. Las definiciones de columna ({ accessorKey }) sensibles se quitan de los arreglos. */
export function sinCostos<T>(valor: T, profundidad = 0): T {
  if (profundidad > 10 || esHoja(valor)) return valor;
  if (Array.isArray(valor)) {
    return valor
      .filter((x) => !(x && typeof x === 'object' && CAMPOS_SENSIBLES.has((x as { accessorKey?: string }).accessorKey ?? '')))
      .map((x) => sinCostos(x, profundidad + 1)) as T;
  }
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (!CAMPOS_SENSIBLES.has(k)) limpio[k] = sinCostos(v, profundidad + 1);
  }
  return limpio as T;
}

export const veCostos = (ctx?: Ctx) => Boolean(ctx && tienePermiso(ctx.usuario, PERMISO_COSTOS));

@Injectable()
export class OcultarCostosInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp().getRequest().ctx as Ctx | undefined;
    if (!ctx || veCostos(ctx)) return next.handle();
    return next.handle().pipe(map((r) => sinCostos(r)));
  }
}
