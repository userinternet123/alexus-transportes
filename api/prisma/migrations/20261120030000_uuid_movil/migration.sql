-- AlterTable
ALTER TABLE "costos_viaje" ADD COLUMN     "uuid_cliente" TEXT;

-- AlterTable
ALTER TABLE "cargas_combustible" ADD COLUMN     "uuid_cliente" TEXT;

-- AlterTable
ALTER TABLE "inspecciones" ADD COLUMN     "uuid_cliente" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "costos_viaje_uuid_cliente_key" ON "costos_viaje"("uuid_cliente");

-- CreateIndex
CREATE UNIQUE INDEX "cargas_combustible_uuid_cliente_key" ON "cargas_combustible"("uuid_cliente");

-- CreateIndex
CREATE UNIQUE INDEX "inspecciones_uuid_cliente_key" ON "inspecciones"("uuid_cliente");

