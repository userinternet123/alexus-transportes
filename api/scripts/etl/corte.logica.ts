/**
 * CORTE DE MIGRACIÓN (lógica pura, sin base de datos).
 * El día del cambio, el sistema anterior es la fuente de verdad: el inventario y los precios de SPVI 2.0 se igualan
 * a los suyos, y el ACTA deja constancia de que todo cuadra (o de qué no cuadra y por qué).
 */
export interface FilaDiferencia { productoId: number; nombre: string; legado: number; actual: number; diferencia: number }

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Productos cuya existencia en SPVI 2.0 no coincide con la del sistema anterior (lo que falta en un lado cuenta como 0). */
export function diferenciasInventario(legado: Map<number, number>, actual: Map<number, number>, nombres: Map<number, string> = new Map()): FilaDiferencia[] {
  const ids = new Set([...legado.keys(), ...actual.keys()]);
  const filas: FilaDiferencia[] = [];
  for (const id of ids) {
    const l = r3(legado.get(id) ?? 0); const a = r3(actual.get(id) ?? 0);
    if (l !== a) filas.push({ productoId: id, nombre: nombres.get(id) ?? `Producto ${id}`, legado: l, actual: a, diferencia: r3(l - a) });
  }
  return filas.sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia));
}

/** Qué cambió de un producto en el sistema anterior desde la última migración (solo esos campos se actualizan). */
export function cambiosDeProducto(actual: { precioVenta: number; nombre: string; activo: boolean }, legado: { precioVenta: number; nombre: string | null; activo: boolean }) {
  const datos: { precioVenta?: number; nombre?: string; activo?: boolean } = {};
  if (Math.round(actual.precioVenta * 100) !== Math.round(legado.precioVenta * 100)) datos.precioVenta = legado.precioVenta;
  if (legado.nombre && legado.nombre !== actual.nombre) datos.nombre = legado.nombre;
  if (legado.activo !== actual.activo) datos.activo = legado.activo;
  return datos;
}

export interface Mes { ventas: number; monto: number }
export function compararMeses(legado: Map<string, Mes>, destino: Map<string, Mes>) {
  return [...new Set([...legado.keys(), ...destino.keys()])].sort().map((mes) => {
    const l = legado.get(mes) ?? { ventas: 0, monto: 0 }; const d = destino.get(mes) ?? { ventas: 0, monto: 0 };
    return { mes, ventasLegado: l.ventas, ventasDestino: d.ventas, montoLegado: Math.round(l.monto * 100) / 100, montoDestino: Math.round(d.monto * 100) / 100, diferencia: Math.round((l.monto - d.monto) * 100) / 100 };
  });
}

export interface DatosActa {
  codigo: string; nombre: string; fecha: string; modo: 'corte' | 'ensayo';
  origen: { productosVigentes: number; unidades: number; valor: number; ventas: number; montoVentas: number; compras: number };
  destino: { productos: number; unidades: number; valor: number; ventas: number; montoVentas: number; compras: number };
  inventario: { ajustados: number; pendientes: FilaDiferencia[] };
  productosActualizados: number; preciosCambiados: number;
  meses: ReturnType<typeof compararMeses>;
  montoOmitido: number; // líneas del legado que no se pudieron migrar (producto inexistente, cantidad 0…)
  avisos: string[];
}

const Q = (n: number) => `Q${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const N = (n: number) => n.toLocaleString('es-GT', { maximumFractionDigits: 3 });

export function veredicto(d: DatosActa) {
  const inventario = d.inventario.pendientes.length === 0 && r3(d.origen.unidades) === r3(d.destino.unidades);
  const difVentas = Math.round((d.origen.montoVentas - d.destino.montoVentas) * 100) / 100;
  const ventas = difVentas === 0 ? 'cuadra' : Math.abs(difVentas) <= Math.round(d.montoOmitido * 100) / 100 + 0.01 ? 'explicada' : 'no-cuadra';
  return { inventario, ventas, difVentas, aprobado: inventario && ventas !== 'no-cuadra' };
}

/** Acta en Markdown: para revisarla, imprimirla y firmarla el día del cambio. */
export function armarActa(d: DatosActa): string {
  const v = veredicto(d);
  const fila = (t: string, o: string, de: string, ok: boolean) => `| ${t} | ${o} | ${de} | ${ok ? '✔' : '✗'} |`;
  const lineas = [
    `# Acta de migración — ${d.nombre} (${d.codigo})`,
    '',
    `**Fecha:** ${d.fecha} · **Tipo:** ${d.modo === 'corte' ? 'CORTE (día del cambio)' : 'Ensayo'}`,
    '',
    `## Resultado: ${v.aprobado ? '✔ APROBADA' : '✗ NO APROBADA: revise las diferencias antes de empezar a vender en SPVI 2.0'}`,
    '',
    `- Inventario: ${v.inventario ? '✔ cuadra producto por producto' : `✗ ${d.inventario.pendientes.length} productos con diferencias`}`,
    `- Ventas históricas: ${v.ventas === 'cuadra' ? '✔ cuadran' : v.ventas === 'explicada' ? `✔ diferencia de ${Q(v.difVentas)} explicada por líneas del sistema anterior que no se pudieron migrar (ver avisos)` : `✗ diferencia de ${Q(v.difVentas)} sin explicar`}`,
    ...(d.modo === 'corte' ? [`- En este corte: ${d.inventario.ajustados} existencias igualadas al sistema anterior y ${d.productosActualizados} productos actualizados (${d.preciosCambiados} con precio nuevo).`] : []),
    '',
    '## Comparación',
    '',
    '| Concepto | Sistema anterior | SPVI 2.0 | |',
    '|---|---:|---:|:-:|',
    fila('Productos vigentes', N(d.origen.productosVigentes), N(d.destino.productos), d.destino.productos >= d.origen.productosVigentes),
    fila('Unidades en inventario', N(d.origen.unidades), N(d.destino.unidades), r3(d.origen.unidades) === r3(d.destino.unidades)),
    fila('Valor del inventario (a costo)', Q(d.origen.valor), Q(d.destino.valor), Math.abs(d.origen.valor - d.destino.valor) < 0.01 * Math.max(1, d.inventario.pendientes.length)),
    fila('Ventas históricas', N(d.origen.ventas), N(d.destino.ventas), d.destino.ventas <= d.origen.ventas),
    fila('Monto de ventas', Q(d.origen.montoVentas), Q(d.destino.montoVentas), v.ventas !== 'no-cuadra'),
    fila('Compras históricas', N(d.origen.compras), N(d.destino.compras), d.destino.compras <= d.origen.compras),
    '',
    'Los productos de SPVI 2.0 pueden ser más que los del sistema anterior si se unificaron con los de otra sucursal.',
    '',
  ];
  if (d.inventario.pendientes.length) {
    lineas.push('## Productos con inventario distinto', '', '| Producto | Sistema anterior | SPVI 2.0 | Diferencia |', '|---|---:|---:|---:|');
    for (const f of d.inventario.pendientes.slice(0, 100)) lineas.push(`| ${f.nombre.replace(/\|/g, '/')} | ${N(f.legado)} | ${N(f.actual)} | ${f.diferencia > 0 ? '+' : ''}${N(f.diferencia)} |`);
    if (d.inventario.pendientes.length > 100) lineas.push(`| … y ${d.inventario.pendientes.length - 100} más | | | |`);
    lineas.push('');
  }
  const conDif = d.meses.filter((m) => m.diferencia !== 0);
  lineas.push('## Ventas por mes', '', '| Mes | Ventas (anterior / nuevo) | Monto anterior | Monto SPVI 2.0 | Diferencia |', '|---|---:|---:|---:|---:|');
  for (const m of d.meses.slice(-24)) lineas.push(`| ${m.mes} | ${m.ventasLegado} / ${m.ventasDestino} | ${Q(m.montoLegado)} | ${Q(m.montoDestino)} | ${m.diferencia ? Q(m.diferencia) : '—'} |`);
  lineas.push('', conDif.length ? `${conDif.length} meses con diferencia (total ${Q(v.difVentas)}). Líneas no migrables del sistema anterior: ${Q(d.montoOmitido)}.` : 'Todos los meses cuadran.', '');
  if (d.avisos.length) { lineas.push('## Avisos', ''); for (const a of d.avisos) lineas.push(`- ${a.replace(/^⚠\s*/, '')}`); lineas.push(''); }
  lineas.push('## Firmas', '', 'Revisado por (negocio): ______________________  Fecha: __________', '', 'Revisado por (ALEXUS): ______________________  Fecha: __________', '');
  return lineas.join('\n');
}
