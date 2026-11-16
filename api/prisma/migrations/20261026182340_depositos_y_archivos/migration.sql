-- CreateTable
CREATE TABLE "caja_depositos" (
    "id" SERIAL NOT NULL,
    "sesion_id" INTEGER NOT NULL,
    "movimiento_id" INTEGER NOT NULL,
    "banco" TEXT NOT NULL,
    "numero_boleta" TEXT NOT NULL,
    "depositante" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha_deposito" DATE NOT NULL,
    "comprobante_id" TEXT,
    "observacion" TEXT,
    "validado_por_id" INTEGER NOT NULL,
    "registrado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_depositos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "datos" BYTEA NOT NULL,
    "publico" BOOLEAN NOT NULL DEFAULT false,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caja_depositos_movimiento_id_key" ON "caja_depositos"("movimiento_id");

-- CreateIndex
CREATE UNIQUE INDEX "caja_depositos_banco_numero_boleta_key" ON "caja_depositos"("banco", "numero_boleta");

-- AddForeignKey
ALTER TABLE "caja_depositos" ADD CONSTRAINT "caja_depositos_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "caja_sesiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_depositos" ADD CONSTRAINT "caja_depositos_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
