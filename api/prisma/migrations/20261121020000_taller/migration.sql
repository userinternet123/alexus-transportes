-- AlterTable
ALTER TABLE "ordenes_trabajo" ADD COLUMN     "detiene_unidad" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "motivo_anulacion" TEXT;

-- CreateIndex
CREATE INDEX "ordenes_trabajo_plan_id_estado_idx" ON "ordenes_trabajo"("plan_id", "estado");

