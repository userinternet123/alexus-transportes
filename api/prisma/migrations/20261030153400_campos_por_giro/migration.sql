-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "atributos" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "texto_busqueda" TEXT;

-- CreateTable
CREATE TABLE "campos_producto" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "opciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unidad" TEXT,
    "ayuda" TEXT,
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "buscable" BOOLEAN NOT NULL DEFAULT false,
    "mostrar_en_pos" BOOLEAN NOT NULL DEFAULT false,
    "categoria_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "plantilla" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campos_producto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campos_producto_clave_key" ON "campos_producto"("clave");
