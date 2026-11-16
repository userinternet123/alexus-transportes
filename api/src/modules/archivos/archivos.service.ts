import { Injectable } from '@nestjs/common';
import type { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const TAMANO_MAXIMO = 3 * 1024 * 1024; // 3 MB (el portal comprime fotos a ~300 KB)

@Injectable()
export class ArchivosService {
  constructor(private readonly prisma: PrismaService) {}

  async subir(ctx: Ctx, dto: { nombre: string; mime: string; base64: string }) {
    if (!TIPOS_PERMITIDOS.includes(dto.mime)) throw reglaNegocio('ARCHIVO_TIPO', 'Solo se aceptan imágenes JPG, PNG, WEBP o PDF');
    const datos = Buffer.from(dto.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!datos.length) throw reglaNegocio('ARCHIVO_VACIO', 'El archivo está vacío');
    if (datos.length > TAMANO_MAXIMO) throw reglaNegocio('ARCHIVO_GRANDE', 'El archivo supera 3 MB');
    // Verificación básica de contenido (firma) para no confiar solo en el mime declarado
    const firma = datos.subarray(0, 4).toString('hex');
    const valido =
      (dto.mime === 'image/jpeg' && firma.startsWith('ffd8')) ||
      (dto.mime === 'image/png' && firma === '89504e47') ||
      (dto.mime === 'image/webp' && datos.subarray(8, 12).toString() === 'WEBP') ||
      (dto.mime === 'application/pdf' && datos.subarray(0, 4).toString() === '%PDF');
    if (!valido) throw reglaNegocio('ARCHIVO_INVALIDO', 'El contenido no corresponde al tipo de archivo');

    const a = await this.prisma.archivo.create({
      data: { nombre: dto.nombre.slice(0, 200), mime: dto.mime, tamano: datos.length, datos, creadoPorId: ctx.usuario.sub },
      select: { id: true, nombre: true, mime: true, tamano: true },
    });
    return { data: a };
  }

  async obtener(id: string, soloPublico = false) {
    const a = await this.prisma.archivo.findUnique({ where: { id } });
    if (!a || (soloPublico && !a.publico)) throw noEncontrado('Archivo');
    return a;
  }

  async marcarPublico(ids: (string | null | undefined)[]) {
    const validos = ids.filter((x): x is string => Boolean(x));
    if (validos.length) await this.prisma.archivo.updateMany({ where: { id: { in: validos } }, data: { publico: true } });
  }
}
