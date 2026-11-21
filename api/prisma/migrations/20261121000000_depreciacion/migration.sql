-- AlterTable
ALTER TABLE "cabezales" ADD COLUMN     "excluir_depreciacion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fecha_baja" DATE,
ADD COLUMN     "km_compra" DECIMAL(12,1),
ADD COLUMN     "metodo_depreciacion" TEXT,
ADD COLUMN     "valor_residual" DECIMAL(14,2),
ADD COLUMN     "vida_util_km" DECIMAL(12,0);

-- AlterTable
ALTER TABLE "remolques" ADD COLUMN     "excluir_depreciacion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fecha_baja" DATE,
ADD COLUMN     "metodo_depreciacion" TEXT,
ADD COLUMN     "valor_residual" DECIMAL(14,2),
ADD COLUMN     "vida_util_anios" INTEGER,
ADD COLUMN     "vida_util_km" DECIMAL(12,0);

-- CreateTable
CREATE TABLE "reglas_depreciacion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "aplica_a" TEXT NOT NULL,
    "marca" TEXT,
    "tipo_remolque" TEXT,
    "anio_desde" INTEGER,
    "anio_hasta" INTEGER,
    "metodo" TEXT NOT NULL DEFAULT 'LINEA_RECTA',
    "vida_util_anios" INTEGER,
    "vida_util_km" DECIMAL(12,0),
    "valor_residual_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tabla_anual" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reglas_depreciacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reglas_depreciacion_nombre_key" ON "reglas_depreciacion"("nombre");

