-- CreateTable
CREATE TABLE "temporadas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "inicio_mes" INTEGER NOT NULL,
    "inicio_dia" INTEGER NOT NULL,
    "fin_mes" INTEGER NOT NULL,
    "fin_dia" INTEGER NOT NULL,
    "anticipacion_dias" INTEGER NOT NULL DEFAULT 45,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "factor" DECIMAL(6,2),
    "confianza" TEXT,
    "indices" JSONB,
    "notas" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "temporadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporadas_alcance" (
    "id" SERIAL NOT NULL,
    "temporada_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "ref_id" INTEGER NOT NULL,

    CONSTRAINT "temporadas_alcance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "temporadas_estado_idx" ON "temporadas"("estado");

-- CreateIndex
CREATE INDEX "temporadas_alcance_tipo_ref_id_idx" ON "temporadas_alcance"("tipo", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "temporadas_alcance_temporada_id_tipo_ref_id_key" ON "temporadas_alcance"("temporada_id", "tipo", "ref_id");

-- AddForeignKey
ALTER TABLE "temporadas_alcance" ADD CONSTRAINT "temporadas_alcance_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
