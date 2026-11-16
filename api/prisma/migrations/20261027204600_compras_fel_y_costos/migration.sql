/*
  Warnings:

  - A unique constraint covering the columns `[uuid_fel]` on the table `compras` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "compras" ADD COLUMN     "uuid_fel" TEXT;

-- CreateTable
CREATE TABLE "productos_proveedores" (
    "id" SERIAL NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "factor" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "usos" INTEGER NOT NULL DEFAULT 1,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "productos_proveedores_producto_id_idx" ON "productos_proveedores"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "productos_proveedores_proveedor_id_descripcion_key" ON "productos_proveedores"("proveedor_id", "descripcion");

-- CreateIndex
CREATE UNIQUE INDEX "compras_uuid_fel_key" ON "compras"("uuid_fel");
