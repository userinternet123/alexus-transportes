import { Injectable } from '@nestjs/common';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { D } from '../../common/money';
import { Db } from '../../common/prisma/prisma.service';

export interface TopeDescuento { porcentajeMax: number; cantidadMaxima: number | null }

/**
 * Políticas de descuento (migración de TDescuento): por ROL y alcance
 * producto > sub-agrupación > global (gana la más específica; entre roles, la mayor).
 * Sub-agrupaciones anidadas: se hereda de la madre; gana la MÁS CERCANA al producto.
 */
@Injectable()
export class DescuentosService {
  async topesPara(db: Db, ctx: Ctx, productos: { id: number; subgrupoId: number }[]): Promise<Map<number, TopeDescuento>> {
    const resultado = new Map<number, TopeDescuento>();
    if (!productos.length) return resultado;

    if (tienePermiso(ctx.usuario, 'ventas.descuento_libre')) {
      productos.forEach((p) => resultado.set(p.id, { porcentajeMax: 100, cantidadMaxima: null }));
      return resultado;
    }

    const roles = await db.usuarioRol.findMany({ where: { usuarioId: ctx.usuario.sub }, select: { rolId: true } });
    // Cadena de cada sub-agrupación hasta el primer nivel: [propia, madre, abuela, …]
    const arbol = new Map((await db.subgrupo.findMany({ select: { id: true, padreId: true } })).map((x) => [x.id, x.padreId]));
    const cadena = (id: number) => {
      const r: number[] = [];
      for (let actual: number | null | undefined = id; actual != null && !r.includes(actual) && r.length < 50; actual = arbol.get(actual)) r.push(actual);
      return r;
    };
    const cadenas = new Map(productos.map((p) => [p.id, cadena(p.subgrupoId)]));
    const ahora = new Date();
    const politicas = await db.politicaDescuento.findMany({
      where: {
        activo: true,
        rolId: { in: roles.map((r) => r.rolId) },
        vigenteDesde: { lte: ahora },
        AND: [{ OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }] }],
        OR: [
          { productoId: { in: productos.map((p) => p.id) } },
          { subgrupoId: { in: [...new Set([...cadenas.values()].flat())] }, productoId: null },
          { productoId: null, subgrupoId: null },
        ],
      },
    });

    for (const p of productos) {
      const niveles = [
        politicas.filter((x) => x.productoId === p.id),
        // de la sub-agrupación del producto hacia arriba: la primera con políticas gana
        ...cadenas.get(p.id)!.map((sg) => politicas.filter((x) => x.productoId === null && x.subgrupoId === sg)),
        politicas.filter((x) => x.productoId === null && x.subgrupoId === null),
      ];
      const aplicables = niveles.find((n) => n.length > 0) ?? [];
      if (!aplicables.length) {
        resultado.set(p.id, { porcentajeMax: 0, cantidadMaxima: null });
        continue;
      }
      const mejor = aplicables.reduce((a, b) => (D(b.porcentajeMax).gt(D(a.porcentajeMax)) ? b : a));
      resultado.set(p.id, {
        porcentajeMax: D(mejor.porcentajeMax).toNumber(),
        cantidadMaxima: mejor.cantidadMaxima != null ? D(mejor.cantidadMaxima).toNumber() : null,
      });
    }
    return resultado;
  }
}
