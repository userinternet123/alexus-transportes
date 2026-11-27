-- CreateTable
CREATE TABLE "presupuestos_mantenimiento" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "cabezal_id" INTEGER,
    "monto" DECIMAL(14,2) NOT NULL,
    "notas" TEXT,
    "actualizado_por" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presupuestos_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "presupuestos_mantenimiento_sucursal_id_anio_mes_idx" ON "presupuestos_mantenimiento"("sucursal_id", "anio", "mes");

-- AddForeignKey
ALTER TABLE "presupuestos_mantenimiento" ADD CONSTRAINT "presupuestos_mantenimiento_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos_mantenimiento" ADD CONSTRAINT "presupuestos_mantenimiento_cabezal_id_fkey" FOREIGN KEY ("cabezal_id") REFERENCES "cabezales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un solo presupuesto por mes para la flota y uno por cabezal
CREATE UNIQUE INDEX "presupuestos_mantenimiento_flota_key" ON "presupuestos_mantenimiento"("sucursal_id", "anio", "mes") WHERE "cabezal_id" IS NULL;
CREATE UNIQUE INDEX "presupuestos_mantenimiento_cabezal_key" ON "presupuestos_mantenimiento"("sucursal_id", "anio", "mes", "cabezal_id") WHERE "cabezal_id" IS NOT NULL;
