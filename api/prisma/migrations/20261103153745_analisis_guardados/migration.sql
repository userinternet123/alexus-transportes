-- CreateTable
CREATE TABLE "plantillas_analiticas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "propietario_id" INTEGER NOT NULL,
    "definicion" JSONB NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantillas_analiticas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tableros_analiticos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "propietario_id" INTEGER NOT NULL,
    "plantilla_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tableros_analiticos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analitica_compartida" (
    "id" SERIAL NOT NULL,
    "objeto" TEXT NOT NULL,
    "objeto_id" INTEGER NOT NULL,
    "destino_tipo" TEXT NOT NULL,
    "destino_id" INTEGER NOT NULL,

    CONSTRAINT "analitica_compartida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plantillas_analiticas_propietario_id_idx" ON "plantillas_analiticas"("propietario_id");

-- CreateIndex
CREATE INDEX "tableros_analiticos_propietario_id_idx" ON "tableros_analiticos"("propietario_id");

-- CreateIndex
CREATE INDEX "analitica_compartida_destino_tipo_destino_id_idx" ON "analitica_compartida"("destino_tipo", "destino_id");

-- CreateIndex
CREATE UNIQUE INDEX "analitica_compartida_objeto_objeto_id_destino_tipo_destino__key" ON "analitica_compartida"("objeto", "objeto_id", "destino_tipo", "destino_id");

-- AddForeignKey
ALTER TABLE "plantillas_analiticas" ADD CONSTRAINT "plantillas_analiticas_propietario_id_fkey" FOREIGN KEY ("propietario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tableros_analiticos" ADD CONSTRAINT "tableros_analiticos_propietario_id_fkey" FOREIGN KEY ("propietario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
