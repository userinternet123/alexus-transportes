/** Consultas de "Qué comprar" (solo lectura). Separadas para probarlas tal cual en PostgreSQL. */
import type { ParametrosSugerido } from './pedidos.logica';
export interface Consulta { texto: string; valores: unknown[] }

/** Productos que cumplen el criterio, con su existencia en la sucursal y lo vendido en los últimos N días. */
export function consultaSugerido(sucursalId: number, q: ParametrosSugerido, rango: { desde: string; hasta: string }): Consulta {
  return { valores: [sucursalId, rango.desde, q.criterio, q.cantidad, q.conVentas, rango.hasta], texto: `
    WITH inv AS (
      SELECT e.producto_id, SUM(e.cantidad)::float8 AS existencia
      FROM existencias e JOIN bodegas b ON b.id = e.bodega_id WHERE b.sucursal_id = $1 GROUP BY 1
    ), cotizado AS (
      -- Lo pedido en cotizaciones vigentes (para productos "por conseguir")
      SELECT vd.producto_id, SUM(vd.cantidad)::float8 AS unidades
      FROM ventas_detalle vd JOIN ventas v ON v.id = vd.venta_id
      WHERE v.sucursal_id = $1 AND v.tipo = 'COTIZACION' AND v.estado = 'CONFIRMADA' AND (v.reutilizable OR v.valida_hasta IS NULL OR v.valida_hasta >= current_date)
      GROUP BY 1
    ), listas AS (
      -- Lo que falta para los compradores esperados de las listas reutilizables (esperados − ya vendidas)
      SELECT vd.producto_id, SUM(vd.cantidad * GREATEST(COALESCE(v.compradores_esperados, 0) - COALESCE(u.usos, 0), 0))::float8 AS unidades
      FROM ventas v JOIN ventas_detalle vd ON vd.venta_id = v.id
      LEFT JOIN (SELECT cotizacion_origen_id, COUNT(*) AS usos FROM ventas WHERE tipo = 'VENTA' AND estado = 'CONFIRMADA' AND cotizacion_origen_id IS NOT NULL GROUP BY 1) u ON u.cotizacion_origen_id = v.id
      WHERE v.sucursal_id = $1 AND v.tipo = 'COTIZACION' AND v.estado = 'CONFIRMADA' AND v.reutilizable
      GROUP BY 1
    ), vendido AS (
      SELECT vd.producto_id, SUM(vd.cantidad)::float8 AS unidades
      FROM ventas_detalle vd JOIN ventas v ON v.id = vd.venta_id
      WHERE v.sucursal_id = $1 AND v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA' AND v.fecha_contable BETWEEN $2::date AND $6::date
      GROUP BY 1
    )
    SELECT p.id, p.sku, p.nombre, pr.nombre AS presentacion, p.stock_minimo::float8 AS minimo,
           COALESCE(inv.existencia, 0)::float8 AS existencia, COALESCE(vendido.unidades, 0)::float8 AS vendido,
           COALESCE(cotizado.unidades, 0)::float8 AS cotizado, COALESCE(listas.unidades, 0)::float8 AS por_listas, p.por_conseguir
    FROM productos p
    LEFT JOIN presentaciones pr ON pr.id = p.presentacion_id
    LEFT JOIN inv ON inv.producto_id = p.id
    LEFT JOIN vendido ON vendido.producto_id = p.id
    LEFT JOIN cotizado ON cotizado.producto_id = p.id
    LEFT JOIN listas ON listas.producto_id = p.id
    WHERE p.activo AND p.maneja_inventario
      -- "Por conseguir" solo aparece en su criterio (y en "para listas"); los otros criterios no lo mezclan
      AND (CASE WHEN $3::text = 'por-conseguir' THEN p.por_conseguir WHEN $3::text = 'para-listas' THEN true ELSE NOT p.por_conseguir END)
      AND (NOT $5::boolean OR $3::text IN ('por-conseguir', 'para-listas') OR COALESCE(vendido.unidades, 0) > 0)
      AND (
        ($3::text = 'sin-existencia' AND COALESCE(inv.existencia, 0) <= 0)
        OR ($3::text = 'bajo-minimo' AND p.stock_minimo > 0 AND COALESCE(inv.existencia, 0) < p.stock_minimo)
        OR ($3::text = 'hasta-cantidad' AND COALESCE(inv.existencia, 0) <= $4::numeric)
        OR ($3::text = 'por-conseguir')
        OR ($3::text = 'para-listas' AND COALESCE(listas.unidades, 0) > COALESCE(inv.existencia, 0))
      )
    ORDER BY COALESCE(cotizado.unidades, 0) + COALESCE(listas.unidades, 0) + COALESCE(vendido.unidades, 0) DESC, p.nombre
    LIMIT 1000` };
}

/** Proveedores que ya vendieron cada producto: última compra, último costo y cuántas veces. */
export function consultaProveedores(productoIds: number[]): Consulta {
  return { valores: [productoIds], texto: `
    SELECT cd.producto_id, c.proveedor_id, to_char(MAX(c.fecha_factura), 'YYYY-MM-DD') AS ultima,
           (ARRAY_AGG(cd.costo_unitario ORDER BY c.fecha_factura DESC, c.id DESC))[1]::float8 AS ultimo_costo,
           COUNT(DISTINCT c.id)::int AS compras
    FROM compras_detalle cd JOIN compras c ON c.id = cd.compra_id
    WHERE c.estado = 'CONFIRMADO' AND cd.producto_id = ANY($1::int[])
    GROUP BY 1, 2` };
}
