-- CreateTable
CREATE TABLE "producto_alias" (
    "id" SERIAL NOT NULL,
    "texto" TEXT NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "usos" INTEGER NOT NULL DEFAULT 1,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_alias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "producto_alias_texto_key" ON "producto_alias"("texto");

-- CreateIndex
CREATE INDEX "producto_alias_producto_id_idx" ON "producto_alias"("producto_id");

-- AddForeignKey
ALTER TABLE "producto_alias" ADD CONSTRAINT "producto_alias_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
