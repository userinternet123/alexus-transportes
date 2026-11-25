-- CreateEnum
CREATE TYPE "TipoIncidente" AS ENUM ('MULTA', 'ACCIDENTE', 'ROBO', 'DANO_CARGA', 'AVERIA_EN_RUTA', 'RECLAMO_CLIENTE', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoIncidente" AS ENUM ('ABIERTO', 'EN_TRAMITE', 'CERRADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "ResponsableIncidente" AS ENUM ('SIN_DEFINIR', 'EMPRESA', 'PILOTO', 'TERCERO');

-- AlterTable
ALTER TABLE "llantas" ADD COLUMN     "costo_reencauches" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "km_esperados" INTEGER,
ADD COLUMN     "profundidad_inicial_mm" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "mediciones_llanta" (
    "id" SERIAL NOT NULL,
    "llanta_id" INTEGER NOT NULL,
    "montaje_id" INTEGER,
    "fecha" DATE NOT NULL,
    "km" DECIMAL(12,1),
    "profundidad_mm" DECIMAL(5,2) NOT NULL,
    "presion_psi" DECIMAL(5,1),
    "observacion" TEXT,
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mediciones_llanta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reencauches_llanta" (
    "id" SERIAL NOT NULL,
    "llanta_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "proveedor_id" INTEGER,
    "costo" DECIMAL(14,2) NOT NULL,
    "documento" TEXT,
    "km_al_enviar" DECIMAL(12,1) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reencauches_llanta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidentes" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "tipo" "TipoIncidente" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "lugar" TEXT,
    "descripcion" TEXT NOT NULL,
    "cabezal_id" INTEGER,
    "remolque_id" INTEGER,
    "piloto_id" INTEGER,
    "viaje_id" INTEGER,
    "orden_trabajo_id" INTEGER,
    "responsable" "ResponsableIncidente" NOT NULL DEFAULT 'SIN_DEFINIR',
    "autoridad" TEXT,
    "numero_boleta" TEXT,
    "monto_multa" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fecha_limite_pago" DATE,
    "pagado_en" DATE,
    "monto_pagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costo_danos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costo_terceros" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "heridos" BOOLEAN NOT NULL DEFAULT false,
    "aseguradora" TEXT,
    "numero_reclamo" TEXT,
    "estado_reclamo" TEXT NOT NULL DEFAULT 'SIN_RECLAMO',
    "reclamo_en" DATE,
    "deducible" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monto_recuperado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descuento_piloto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cuotas_descuento" INTEGER NOT NULL DEFAULT 1,
    "descontado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "EstadoIncidente" NOT NULL DEFAULT 'ABIERTO',
    "resolucion" TEXT,
    "cerrado_en" TIMESTAMP(3),
    "motivo_anulacion" TEXT,
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "descuentos_incidente" (
    "id" SERIAL NOT NULL,
    "planilla_id" INTEGER NOT NULL,
    "incidente_id" INTEGER NOT NULL,
    "empleado_id" INTEGER NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "descuentos_incidente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mediciones_llanta_llanta_id_fecha_idx" ON "mediciones_llanta"("llanta_id", "fecha");

-- CreateIndex
CREATE INDEX "reencauches_llanta_llanta_id_idx" ON "reencauches_llanta"("llanta_id");

-- CreateIndex
CREATE UNIQUE INDEX "incidentes_numero_key" ON "incidentes"("numero");

-- CreateIndex
CREATE INDEX "incidentes_sucursal_id_estado_idx" ON "incidentes"("sucursal_id", "estado");

-- CreateIndex
CREATE INDEX "incidentes_fecha_idx" ON "incidentes"("fecha");

-- CreateIndex
CREATE INDEX "incidentes_piloto_id_idx" ON "incidentes"("piloto_id");

-- CreateIndex
CREATE INDEX "incidentes_cabezal_id_idx" ON "incidentes"("cabezal_id");

-- CreateIndex
CREATE UNIQUE INDEX "descuentos_incidente_planilla_id_incidente_id_key" ON "descuentos_incidente"("planilla_id", "incidente_id");

-- AddForeignKey
ALTER TABLE "mediciones_llanta" ADD CONSTRAINT "mediciones_llanta_llanta_id_fkey" FOREIGN KEY ("llanta_id") REFERENCES "llantas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mediciones_llanta" ADD CONSTRAINT "mediciones_llanta_montaje_id_fkey" FOREIGN KEY ("montaje_id") REFERENCES "montajes_llanta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mediciones_llanta" ADD CONSTRAINT "mediciones_llanta_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reencauches_llanta" ADD CONSTRAINT "reencauches_llanta_llanta_id_fkey" FOREIGN KEY ("llanta_id") REFERENCES "llantas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reencauches_llanta" ADD CONSTRAINT "reencauches_llanta_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "terceros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_cabezal_id_fkey" FOREIGN KEY ("cabezal_id") REFERENCES "cabezales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_remolque_id_fkey" FOREIGN KEY ("remolque_id") REFERENCES "remolques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_piloto_id_fkey" FOREIGN KEY ("piloto_id") REFERENCES "pilotos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "ordenes_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "descuentos_incidente" ADD CONSTRAINT "descuentos_incidente_planilla_id_fkey" FOREIGN KEY ("planilla_id") REFERENCES "rrhh_planillas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "descuentos_incidente" ADD CONSTRAINT "descuentos_incidente_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "incidentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una llanta solo puede estar montada en un lugar, y cada posición de una unidad solo tiene una llanta
CREATE UNIQUE INDEX "montajes_llanta_activo_key" ON "montajes_llanta"("llanta_id") WHERE "fecha_retiro" IS NULL;
CREATE UNIQUE INDEX "montajes_llanta_pos_cabezal_key" ON "montajes_llanta"("cabezal_id", "posicion") WHERE "fecha_retiro" IS NULL AND "cabezal_id" IS NOT NULL;
CREATE UNIQUE INDEX "montajes_llanta_pos_remolque_key" ON "montajes_llanta"("remolque_id", "posicion") WHERE "fecha_retiro" IS NULL AND "remolque_id" IS NOT NULL;
