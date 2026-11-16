-- =============================================================================
-- Reglas de integridad que Prisma no expresa en el schema.
-- Incluir en la PRIMERA migración:
--   npx prisma migrate dev --create-only --name init
--   (pegar este contenido al final de migrations/<ts>_init/migration.sql)
--   npx prisma migrate dev
-- =============================================================================

-- 1) Una caja solo puede tener UNA sesión abierta, y un usuario solo UNA caja abierta.
CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_sesion_abierta
  ON caja_sesiones (caja_id) WHERE estado = 'ABIERTA';
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_sesion_abierta
  ON caja_sesiones (usuario_id) WHERE estado = 'ABIERTA';

-- 2) Kardex inmutable: prohíbe UPDATE/DELETE a nivel de base de datos.
CREATE OR REPLACE FUNCTION fn_kardex_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'movimientos_inventario es inmutable (append-only). Registre un movimiento compensatorio.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_kardex_inmutable ON movimientos_inventario;
CREATE TRIGGER tg_kardex_inmutable
  BEFORE UPDATE OR DELETE ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION fn_kardex_inmutable();

-- 3) Auditoría inmutable.
DROP TRIGGER IF EXISTS tg_audit_inmutable ON audit_log;
CREATE TRIGGER tg_audit_inmutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_kardex_inmutable();

-- 4) Checks de dominio.
ALTER TABLE existencias           ADD CONSTRAINT ck_existencia_costo  CHECK (costo_promedio >= 0);
ALTER TABLE ventas_detalle        ADD CONSTRAINT ck_vd_cantidad       CHECK (cantidad > 0);
ALTER TABLE ventas_pagos          ADD CONSTRAINT ck_vp_monto          CHECK (monto > 0);
ALTER TABLE compras_detalle       ADD CONSTRAINT ck_cd_cantidad       CHECK (cantidad > 0);
ALTER TABLE politicas_descuento   ADD CONSTRAINT ck_pd_porcentaje     CHECK (porcentaje_max BETWEEN 0 AND 100);

-- 5) Búsqueda rápida de productos por nombre (POS) — requiere pg_trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS ix_productos_nombre_trgm ON productos USING gin (nombre gin_trgm_ops);
