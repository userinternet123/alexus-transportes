-- CreateEnum
CREATE TYPE "EstadoConteo" AS ENUM ('ABIERTO', 'APROBADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "subgrupos" ADD COLUMN     "padre_id" INTEGER;

-- CreateTable
CREATE TABLE "conteos" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "bodega_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciego" BOOLEAN NOT NULL DEFAULT true,
    "estado" "EstadoConteo" NOT NULL DEFAULT 'ABIERTO',
    "observacion" TEXT,
    "creado_por_id" INTEGER NOT NULL,
    "aprobado_por_id" INTEGER,
    "ajuste_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrado_en" TIMESTAMP(3),

    CONSTRAINT "conteos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteos_lineas" (
    "id" SERIAL NOT NULL,
    "conteo_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad_fisica" DECIMAL(14,3) NOT NULL,
    "sistema_al_contar" DECIMAL(14,3) NOT NULL,
    "contado_por_id" INTEGER NOT NULL,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conteos_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conteos_ajuste_id_key" ON "conteos"("ajuste_id");

-- CreateIndex
CREATE INDEX "conteos_sucursal_id_estado_idx" ON "conteos"("sucursal_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "conteos_lineas_conteo_id_producto_id_key" ON "conteos_lineas"("conteo_id", "producto_id");

-- CreateIndex
CREATE INDEX "subgrupos_padre_id_idx" ON "subgrupos"("padre_id");

-- AddForeignKey
ALTER TABLE "subgrupos" ADD CONSTRAINT "subgrupos_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "subgrupos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteos_lineas" ADD CONSTRAINT "conteos_lineas_conteo_id_fkey" FOREIGN KEY ("conteo_id") REFERENCES "conteos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteos_lineas" ADD CONSTRAINT "conteos_lineas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
