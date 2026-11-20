-- CreateEnum
CREATE TYPE "TerrenoRuta" AS ENUM ('PLANO', 'ONDULADO', 'MONTANA');

-- CreateEnum
CREATE TYPE "TraficoRuta" AS ENUM ('FLUIDO', 'NORMAL', 'LENTO', 'MUY_LENTO');

-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'CONVERTIDA');

-- CreateEnum
CREATE TYPE "ResultadoInspeccion" AS ENUM ('APROBADA', 'CON_OBSERVACIONES', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoPunto" AS ENUM ('OK', 'FALLA', 'NO_APLICA');

-- CreateEnum
CREATE TYPE "PrioridadCaso" AS ENUM ('URGENTE', 'ALTA', 'MODERADA', 'BAJA');

-- CreateEnum
CREATE TYPE "EstadoCaso" AS ENUM ('ABIERTO', 'EN_PROCESO', 'RESUELTO', 'ANULADO');

-- AlterTable
ALTER TABLE "rutas" ADD COLUMN     "horas_espera" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "subida_metros" INTEGER,
ADD COLUMN     "terreno" "TerrenoRuta" NOT NULL DEFAULT 'PLANO',
ADD COLUMN     "trafico" "TraficoRuta" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "viajes" ADD COLUMN     "costo_km_fijo" DECIMAL(10,4),
ADD COLUMN     "ganancia" DECIMAL(14,2),
ADD COLUMN     "iniciado_en" TIMESTAMP(3),
ADD COLUMN     "liquidado_en" TIMESTAMP(3),
ADD COLUMN     "liquidado_por_id" INTEGER,
ADD COLUMN     "motivo_cancelacion" TEXT,
ADD COLUMN     "prorrateo" DECIMAL(14,2),
ADD COLUMN     "saldo_piloto" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "costos_viaje" ADD COLUMN     "carga_id" INTEGER,
ADD COLUMN     "documento" TEXT,
ADD COLUMN     "pagado_por_piloto" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "cargas_combustible" ADD COLUMN     "alerta" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anulada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "galones_tramo" DECIMAL(10,3),
ADD COLUMN     "km_recorridos" DECIMAL(12,1),
ADD COLUMN     "motivo_anulacion" TEXT,
ADD COLUMN     "pagado_por_piloto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rendimiento" DECIMAL(8,3);

-- AlterTable
ALTER TABLE "ordenes_trabajo" ADD COLUMN     "prioridad" "PrioridadCaso" NOT NULL DEFAULT 'MODERADA';

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "cliente_id" INTEGER,
    "ruta_id" INTEGER,
    "origen" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "km_ida" DECIMAL(12,1) NOT NULL,
    "regreso" TEXT NOT NULL,
    "terreno" "TerrenoRuta" NOT NULL,
    "trafico" "TraficoRuta" NOT NULL,
    "subida_metros" INTEGER,
    "horas_espera" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "extras" JSONB NOT NULL DEFAULT '[]',
    "toneladas" DECIMAL(8,2),
    "supuestos" JSONB NOT NULL,
    "partidas" JSONB NOT NULL,
    "km_total" DECIMAL(12,1) NOT NULL,
    "horas_estimadas" DECIMAL(6,1),
    "costo_total" DECIMAL(14,2) NOT NULL,
    "margen" DECIMAL(6,2) NOT NULL,
    "precio_sugerido" DECIMAL(14,2) NOT NULL,
    "precio_ofrecido" DECIMAL(14,2) NOT NULL,
    "vigente_hasta" DATE NOT NULL,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'BORRADOR',
    "notas" TEXT,
    "viaje_id" INTEGER,
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anticipos_viaje" (
    "id" SERIAL NOT NULL,
    "viaje_id" INTEGER NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "medio" "MedioGasto" NOT NULL DEFAULT 'EFECTIVO',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nota" TEXT,
    "archivo_id" TEXT,
    "entregado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anticipos_viaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspecciones" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "cabezal_id" INTEGER NOT NULL,
    "remolque_id" INTEGER,
    "piloto_id" INTEGER,
    "viaje_id" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odometro" DECIMAL(12,1),
    "resultado" "ResultadoInspeccion" NOT NULL,
    "fallas" INTEGER NOT NULL DEFAULT 0,
    "fallas_criticas" INTEGER NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "orden_trabajo_id" INTEGER,
    "registrado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspecciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspecciones_puntos" (
    "id" SERIAL NOT NULL,
    "inspeccion_id" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "estado" "EstadoPunto" NOT NULL,
    "critico" BOOLEAN NOT NULL DEFAULT false,
    "nota" TEXT,
    "archivo_id" TEXT,

    CONSTRAINT "inspecciones_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "origen" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "prioridad" "PrioridadCaso" NOT NULL,
    "estado" "EstadoCaso" NOT NULL DEFAULT 'ABIERTO',
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "impide_salir" BOOLEAN NOT NULL DEFAULT false,
    "cabezal_id" INTEGER,
    "remolque_id" INTEGER,
    "viaje_id" INTEGER,
    "inspeccion_id" INTEGER,
    "punto_codigo" TEXT,
    "orden_trabajo_id" INTEGER,
    "responsable_id" INTEGER,
    "vence_en" TIMESTAMP(3) NOT NULL,
    "resuelto_en" TIMESTAMP(3),
    "resolucion" TEXT,
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "casos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos_notas" (
    "id" SERIAL NOT NULL,
    "caso_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "cambio" TEXT,
    "texto" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casos_notas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_numero_key" ON "cotizaciones"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_viaje_id_key" ON "cotizaciones"("viaje_id");

-- CreateIndex
CREATE INDEX "cotizaciones_creado_en_idx" ON "cotizaciones"("creado_en");

-- CreateIndex
CREATE INDEX "anticipos_viaje_viaje_id_idx" ON "anticipos_viaje"("viaje_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspecciones_orden_trabajo_id_key" ON "inspecciones"("orden_trabajo_id");

-- CreateIndex
CREATE INDEX "inspecciones_cabezal_id_fecha_idx" ON "inspecciones"("cabezal_id", "fecha");

-- CreateIndex
CREATE INDEX "inspecciones_fecha_idx" ON "inspecciones"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "inspecciones_puntos_inspeccion_id_codigo_key" ON "inspecciones_puntos"("inspeccion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "casos_numero_key" ON "casos"("numero");

-- CreateIndex
CREATE INDEX "casos_estado_vence_en_idx" ON "casos"("estado", "vence_en");

-- CreateIndex
CREATE INDEX "casos_cabezal_id_estado_idx" ON "casos"("cabezal_id", "estado");

-- CreateIndex
CREATE INDEX "casos_notas_caso_id_idx" ON "casos_notas"("caso_id");

-- CreateIndex
CREATE INDEX "viajes_estado_idx" ON "viajes"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "costos_viaje_carga_id_key" ON "costos_viaje"("carga_id");

-- CreateIndex
CREATE INDEX "cargas_combustible_cabezal_id_odometro_idx" ON "cargas_combustible"("cabezal_id", "odometro");

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "terceros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_ruta_id_fkey" FOREIGN KEY ("ruta_id") REFERENCES "rutas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_liquidado_por_id_fkey" FOREIGN KEY ("liquidado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costos_viaje" ADD CONSTRAINT "costos_viaje_carga_id_fkey" FOREIGN KEY ("carga_id") REFERENCES "cargas_combustible"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_viaje" ADD CONSTRAINT "anticipos_viaje_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_viaje" ADD CONSTRAINT "anticipos_viaje_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_viaje" ADD CONSTRAINT "anticipos_viaje_entregado_por_id_fkey" FOREIGN KEY ("entregado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_cabezal_id_fkey" FOREIGN KEY ("cabezal_id") REFERENCES "cabezales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_remolque_id_fkey" FOREIGN KEY ("remolque_id") REFERENCES "remolques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_piloto_id_fkey" FOREIGN KEY ("piloto_id") REFERENCES "pilotos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "ordenes_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones_puntos" ADD CONSTRAINT "inspecciones_puntos_inspeccion_id_fkey" FOREIGN KEY ("inspeccion_id") REFERENCES "inspecciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones_puntos" ADD CONSTRAINT "inspecciones_puntos_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos" ADD CONSTRAINT "casos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos" ADD CONSTRAINT "casos_cabezal_id_fkey" FOREIGN KEY ("cabezal_id") REFERENCES "cabezales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos" ADD CONSTRAINT "casos_remolque_id_fkey" FOREIGN KEY ("remolque_id") REFERENCES "remolques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos" ADD CONSTRAINT "casos_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos" ADD CONSTRAINT "casos_inspeccion_id_fkey" FOREIGN KEY ("inspeccion_id") REFERENCES "inspecciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos" ADD CONSTRAINT "casos_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "ordenes_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos" ADD CONSTRAINT "casos_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos" ADD CONSTRAINT "casos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_notas" ADD CONSTRAINT "casos_notas_caso_id_fkey" FOREIGN KEY ("caso_id") REFERENCES "casos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_notas" ADD CONSTRAINT "casos_notas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

