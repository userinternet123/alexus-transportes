-- CreateTable
CREATE TABLE "uso_diario" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "evento" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "dispositivo" TEXT NOT NULL,
    "veces" INTEGER NOT NULL DEFAULT 0,
    "enviado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "uso_diario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opiniones" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "puntaje" INTEGER,
    "texto" TEXT,
    "pantalla" TEXT,
    "contacto" TEXT,
    "rol" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "opiniones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uso_diario_enviado_fecha_idx" ON "uso_diario"("enviado", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "uso_diario_fecha_evento_rol_dispositivo_key" ON "uso_diario"("fecha", "evento", "rol", "dispositivo");

-- CreateIndex
CREATE INDEX "opiniones_enviado_idx" ON "opiniones"("enviado");

-- CreateIndex
CREATE INDEX "opiniones_tipo_creado_en_idx" ON "opiniones"("tipo", "creado_en");
