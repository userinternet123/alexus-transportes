-- CreateEnum
CREATE TYPE "TipoEventoViaje" AS ENUM ('SALIDA', 'LLEGADA_CARGA', 'CARGANDO', 'EN_RUTA', 'EN_COLA', 'ADUANA', 'PARADA', 'LLEGADA_DESTINO', 'DESCARGANDO', 'ENTREGADO', 'INCIDENTE', 'NOTA');

-- AlterTable
ALTER TABLE "viajes" ADD COLUMN     "factor_cargas" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "casos" ADD COLUMN     "latitud" DECIMAL(9,6),
ADD COLUMN     "longitud" DECIMAL(9,6),
ADD COLUMN     "uuid_cliente" TEXT;

-- CreateTable
CREATE TABLE "eventos_viaje" (
    "id" SERIAL NOT NULL,
    "viaje_id" INTEGER NOT NULL,
    "tipo" "TipoEventoViaje" NOT NULL,
    "texto" TEXT,
    "latitud" DECIMAL(9,6),
    "longitud" DECIMAL(9,6),
    "precision_m" INTEGER,
    "odometro" DECIMAL(12,1),
    "ocurrido_en" TIMESTAMP(3) NOT NULL,
    "recibido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uuid_cliente" TEXT,
    "caso_id" INTEGER,
    "registrado_por_id" INTEGER NOT NULL,

    CONSTRAINT "eventos_viaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencias" (
    "id" SERIAL NOT NULL,
    "archivo_id" TEXT NOT NULL,
    "evento_viaje_id" INTEGER,
    "caso_id" INTEGER,
    "inspeccion_id" INTEGER,
    "descripcion" TEXT,
    "latitud" DECIMAL(9,6),
    "longitud" DECIMAL(9,6),
    "tomada_en" TIMESTAMP(3),
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eventos_viaje_uuid_cliente_key" ON "eventos_viaje"("uuid_cliente");

-- CreateIndex
CREATE INDEX "eventos_viaje_viaje_id_ocurrido_en_idx" ON "eventos_viaje"("viaje_id", "ocurrido_en");

-- CreateIndex
CREATE INDEX "eventos_viaje_recibido_en_idx" ON "eventos_viaje"("recibido_en");

-- CreateIndex
CREATE INDEX "evidencias_evento_viaje_id_idx" ON "evidencias"("evento_viaje_id");

-- CreateIndex
CREATE INDEX "evidencias_caso_id_idx" ON "evidencias"("caso_id");

-- CreateIndex
CREATE INDEX "evidencias_inspeccion_id_idx" ON "evidencias"("inspeccion_id");

-- CreateIndex
CREATE UNIQUE INDEX "casos_uuid_cliente_key" ON "casos"("uuid_cliente");

-- AddForeignKey
ALTER TABLE "eventos_viaje" ADD CONSTRAINT "eventos_viaje_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_viaje" ADD CONSTRAINT "eventos_viaje_caso_id_fkey" FOREIGN KEY ("caso_id") REFERENCES "casos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_viaje" ADD CONSTRAINT "eventos_viaje_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_evento_viaje_id_fkey" FOREIGN KEY ("evento_viaje_id") REFERENCES "eventos_viaje"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_caso_id_fkey" FOREIGN KEY ("caso_id") REFERENCES "casos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_inspeccion_id_fkey" FOREIGN KEY ("inspeccion_id") REFERENCES "inspecciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

