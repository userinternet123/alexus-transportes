-- AlterTable
ALTER TABLE "traslados" ADD COLUMN     "motivo_anulacion" TEXT,
ADD COLUMN     "observacion_recepcion" TEXT,
ADD COLUMN     "usuario_anula_id" INTEGER;

-- AlterTable
ALTER TABLE "traslados_detalle" ADD COLUMN     "cantidad_recibida" DECIMAL(14,3);
