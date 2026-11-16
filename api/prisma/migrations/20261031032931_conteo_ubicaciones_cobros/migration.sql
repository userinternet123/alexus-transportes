-- AlterTable
ALTER TABLE "conteos" ADD COLUMN     "alcance_id" INTEGER,
ADD COLUMN     "alcance_nombre" TEXT,
ADD COLUMN     "alcance_tipo" TEXT;

-- AlterTable
ALTER TABLE "existencias" ADD COLUMN     "ubicacion_id" INTEGER;

-- AlterTable
ALTER TABLE "ventas_pagos" ADD COLUMN     "banco" TEXT,
ADD COLUMN     "comprobante_id" TEXT,
ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "nota" TEXT,
ADD COLUMN     "verificado_en" TIMESTAMP(3),
ADD COLUMN     "verificado_por_id" INTEGER;

-- CreateTable
CREATE TABLE "ubicaciones" (
    "id" SERIAL NOT NULL,
    "bodega_id" INTEGER NOT NULL,
    "padre_id" INTEGER,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT,
    "codigo_completo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubicaciones_clasificacion" (
    "id" SERIAL NOT NULL,
    "bodega_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "ref_id" INTEGER NOT NULL,
    "ubicacion_id" INTEGER NOT NULL,

    CONSTRAINT "ubicaciones_clasificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ubicaciones_padre_id_idx" ON "ubicaciones"("padre_id");

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_bodega_id_codigo_completo_key" ON "ubicaciones"("bodega_id", "codigo_completo");

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_clasificacion_bodega_id_tipo_ref_id_key" ON "ubicaciones_clasificacion"("bodega_id", "tipo", "ref_id");

-- CreateIndex
CREATE INDEX "ventas_pagos_medio_pago_estado_idx" ON "ventas_pagos"("medio_pago", "estado");

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_pagos" ADD CONSTRAINT "ventas_pagos_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "ubicaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicaciones_clasificacion" ADD CONSTRAINT "ubicaciones_clasificacion_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
