-- AlterEnum
ALTER TYPE "EstadoPedido" ADD VALUE 'RECIBIDO_PARCIAL';

-- AlterTable
ALTER TABLE "pedidos_compra" ADD COLUMN     "medio_envio" TEXT,
ADD COLUMN     "nota_recepcion" TEXT,
ADD COLUMN     "recibido_en" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pedidos_compra_detalle" ADD COLUMN     "cantidad_recibida" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "eventos_notificacion" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER,
    "permiso" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'info',
    "titulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "ruta" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones_vistas" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "visto_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_vistas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_notificacion_creado_en_idx" ON "eventos_notificacion"("creado_en");

-- CreateIndex
CREATE INDEX "notificaciones_vistas_visto_en_idx" ON "notificaciones_vistas"("visto_en");

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_vistas_usuario_id_clave_key" ON "notificaciones_vistas"("usuario_id", "clave");
