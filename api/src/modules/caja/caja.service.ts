import { Injectable } from '@nestjs/common';
import { MedioPago, Prisma, TipoMovimientoCaja } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { conflicto, noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { fechaContable } from '../../common/fecha';
import { D, Decimal, r2, suma } from '../../common/money';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { Db, PrismaService } from '../../common/prisma/prisma.service';
import { CierreService } from '../cierre/cierre.service';

/** Medios que se cuentan físicamente en el arqueo. CREDITO no entra a caja. */
const MEDIOS_ARQUEO: MedioPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'VALE'];

export interface ConteoDto {
  medioPago: MedioPago;
  montoContado: number;
  denominaciones?: Record<string, number>; // { "200": 3, "0.25": 4 }
}

/**
 * CAJA: Apertura -> Ventas/Movimientos -> Arqueo (CUADRE) -> Cierre de turno.
 *
 * Esperado por medio de pago =
 *   (EFECTIVO: fondo de apertura) + cobros de ventas confirmadas (efectivo neto de vuelto)
 *   + ingresos - egresos - retiros parciales
 * Diferencia = contado - esperado (positivo = sobrante, negativo = faltante)
 */
@Injectable()
export class CajaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cierre: CierreService,
    private readonly parametros: ParametrosService,
  ) {}

  async abrir(ctx: Ctx, cajaId: number, montoApertura: number) {
    const hoy = fechaContable();
    const data = await this.prisma.enTransaccion(async (tx) => {
      await this.cierre.validarPeriodoAbierto(tx, ctx.sucursalId!, hoy);
      // Bloquea la caja para evitar doble apertura simultánea
      const [caja] = await tx.$queryRaw<{ id: number; activo: boolean; sucursal_id: number }[]>`
        SELECT id, activo, sucursal_id FROM cajas WHERE id = ${cajaId} FOR UPDATE`;
      if (!caja || caja.sucursal_id !== ctx.sucursalId || !caja.activo) throw noEncontrado('Caja', cajaId);

      const abiertaCaja = await tx.cajaSesion.findFirst({ where: { cajaId, estado: 'ABIERTA' }, include: { usuario: { select: { nombre: true } } } });
      if (abiertaCaja) throw conflicto('CAJA_OCUPADA', `La caja ya está abierta por ${abiertaCaja.usuario.nombre}`);
      const abiertaUsuario = await tx.cajaSesion.findFirst({ where: { usuarioId: ctx.usuario.sub, estado: 'ABIERTA' } });
      if (abiertaUsuario) throw conflicto('USUARIO_CON_CAJA', 'Ya tiene una caja abierta. Ciérrela antes de abrir otra.');

      const sesion = await tx.cajaSesion.create({
        data: { cajaId, usuarioId: ctx.usuario.sub, fechaContable: hoy, montoApertura: r2(montoApertura) },
      });
      await this.audit.registrar(ctx, { accion: 'APERTURA_CAJA', entidad: 'CajaSesion', entidadId: sesion.id, despues: sesion }, tx);
      return sesion;
    });
    return { data, message: 'Caja abierta' };
  }

  async miSesion(ctx: Ctx) {
    const sesion = await this.prisma.cajaSesion.findFirst({
      where: { usuarioId: ctx.usuario.sub, estado: 'ABIERTA' },
      include: { caja: { select: { id: true, nombre: true, sucursalId: true } } },
    });
    if (!sesion) return { data: null };
    // Una caja de otro día no puede vender (el servidor lo rechaza): el POS lo anticipa con este dato
    const deDiaAnterior = sesion.fechaContable.getTime() !== fechaContable().getTime();
    return { data: { ...sesion, deDiaAnterior, resumen: await this.resumen(sesion.id) } };
  }

  async registrarMovimiento(ctx: Ctx, sesionId: number, dto: { tipo: TipoMovimientoCaja; medioPago: MedioPago; monto: number; concepto: string }) {
    const data = await this.prisma.enTransaccion(async (tx) => {
      const sesion = await this.sesionOperable(tx, ctx, sesionId);
      if (dto.tipo !== 'INGRESO') {
        const disponible = D((await this.resumen(sesion.id, tx)).esperado[dto.medioPago] ?? 0);
        if (D(dto.monto).gt(disponible)) {
          throw reglaNegocio('FONDOS_INSUFICIENTES', `Disponible en ${dto.medioPago}: Q${disponible.toFixed(2)}`);
        }
      }
      const mov = await tx.cajaMovimiento.create({
        data: { sesionId, tipo: dto.tipo, medioPago: dto.medioPago, monto: r2(dto.monto), concepto: dto.concepto, usuarioId: ctx.usuario.sub },
      });
      await this.audit.registrar(ctx, { accion: `CAJA_${dto.tipo}`, entidad: 'CajaSesion', entidadId: sesionId, despues: mov }, tx);
      return mov;
    });
    return { data, message: 'Movimiento registrado' };
  }

  /** Lo que el SISTEMA espera encontrar en caja, por medio de pago. */
  async resumen(sesionId: number, db: Db = this.prisma) {
    const sesion = await db.cajaSesion.findUniqueOrThrow({ where: { id: sesionId } });
    const filtroVentas: Prisma.VentaWhereInput = { cajaSesionId: sesionId, tipo: 'VENTA', estado: 'CONFIRMADA' };

    const [pagos, agregados, movimientos, anuladas] = await Promise.all([
      db.ventaPago.groupBy({ by: ['medioPago'], where: { venta: filtroVentas }, _sum: { monto: true } }),
      db.venta.aggregate({ where: filtroVentas, _count: { _all: true }, _sum: { total: true, cambio: true } }),
      db.cajaMovimiento.groupBy({ by: ['tipo', 'medioPago'], where: { sesionId }, _sum: { monto: true } }),
      db.venta.aggregate({ where: { cajaSesionId: sesionId, tipo: 'VENTA', estado: 'ANULADA' }, _count: { _all: true }, _sum: { total: true } }),
    ]);

    const esperado: Record<string, Decimal> = {};
    const add = (medio: string, v: Decimal) => (esperado[medio] = (esperado[medio] ?? D(0)).plus(v));

    add('EFECTIVO', D(sesion.montoApertura));
    for (const p of pagos) add(p.medioPago, D(p._sum.monto));
    add('EFECTIVO', D(agregados._sum.cambio).neg()); // el vuelto salió de la gaveta
    for (const m of movimientos) add(m.medioPago, m.tipo === 'INGRESO' ? D(m._sum.monto) : D(m._sum.monto).neg());

    const credito = esperado.CREDITO ?? D(0);
    delete esperado.CREDITO;

    return {
      sesionId,
      estado: sesion.estado,
      montoApertura: D(sesion.montoApertura).toFixed(2),
      ventas: { cantidad: agregados._count._all, total: r2(agregados._sum.total).toFixed(2) },
      anuladas: { cantidad: anuladas._count._all, total: r2(anuladas._sum.total).toFixed(2) },
      ventasAlCredito: r2(credito).toFixed(2),
      movimientos: movimientos.map((m) => ({ tipo: m.tipo, medioPago: m.medioPago, total: r2(m._sum.monto).toFixed(2) })),
      esperado: Object.fromEntries(Object.entries(esperado).map(([k, v]) => [k, r2(v).toFixed(2)])) as Record<string, string>,
      totalEsperado: r2(suma(Object.values(esperado))).toFixed(2),
    };
  }

  /** ARQUEO + CIERRE del turno. Siempre se permite cerrar; las diferencias quedan justificadas y auditadas. */
  async cerrar(ctx: Ctx, sesionId: number, dto: { conteos: ConteoDto[]; observacion?: string }) {
    const tolerancia = D(await this.parametros.numero('caja.tolerancia_diferencia'));

    const data = await this.prisma.enTransaccion(async (tx) => {
      await tx.$queryRaw`SELECT id FROM caja_sesiones WHERE id = ${sesionId} FOR UPDATE`;
      const sesion = await this.sesionOperable(tx, ctx, sesionId);
      const r = await this.resumen(sesion.id, tx);

      const contados = new Map(dto.conteos.map((c) => [c.medioPago, c]));
      const medios = new Set<MedioPago>([...MEDIOS_ARQUEO.filter((m) => r.esperado[m] !== undefined), ...contados.keys()]);
      const arqueos = [...medios].map((medio) => {
        const c = contados.get(medio);
        if (c?.denominaciones && medio === 'EFECTIVO') {
          const totalDenom = suma(Object.entries(c.denominaciones).map(([den, cant]) => D(den).times(cant)));
          if (!r2(totalDenom).equals(r2(c.montoContado))) {
            throw reglaNegocio('DENOMINACIONES', `El desglose de billetes/monedas (Q${totalDenom.toFixed(2)}) no coincide con lo contado (Q${D(c.montoContado).toFixed(2)})`);
          }
        }
        const esperado = D(r.esperado[medio] ?? 0);
        const contado = r2(c?.montoContado ?? 0);
        return { medioPago: medio, montoEsperado: esperado, montoContado: contado, diferencia: contado.minus(esperado), denominaciones: c?.denominaciones };
      });

      const totalEsperado = suma(arqueos.map((a) => a.montoEsperado));
      const totalContado = suma(arqueos.map((a) => a.montoContado));
      const diferencia = totalContado.minus(totalEsperado);
      if (diferencia.abs().gt(tolerancia) && (dto.observacion ?? '').trim().length < 10) {
        throw reglaNegocio('JUSTIFICAR_DIFERENCIA', `Hay una diferencia de Q${diferencia.toFixed(2)}. Justifíquela en observaciones (mín. 10 caracteres).`, { arqueos });
      }

      for (const a of arqueos) {
        await tx.cajaArqueo.create({
          data: {
            sesionId, medioPago: a.medioPago, montoEsperado: a.montoEsperado, montoContado: a.montoContado, diferencia: a.diferencia,
            denominaciones: a.denominaciones ?? Prisma.JsonNull,
          },
        });
      }
      const cerrada = await tx.cajaSesion.update({
        where: { id: sesionId },
        data: {
          estado: 'CERRADA', cerradaEn: new Date(), cerradaPorId: ctx.usuario.sub,
          totalEsperado: r2(totalEsperado), totalContado: r2(totalContado), diferencia: r2(diferencia), observacion: dto.observacion,
        },
      });
      await this.audit.registrar(ctx, { accion: 'CIERRE_CAJA', entidad: 'CajaSesion', entidadId: sesionId, despues: { arqueos, diferencia } }, tx);
      return { sesion: cerrada, resumen: r, arqueos };
    });
    const dif = D(data.sesion.diferencia);
    const msg = dif.isZero() ? 'Caja cuadrada ✔' : dif.gt(0) ? `Caja cerrada con SOBRANTE de Q${dif.toFixed(2)}` : `Caja cerrada con FALTANTE de Q${dif.abs().toFixed(2)}`;
    return { data, message: msg };
  }

  /**
   * DEPÓSITO BANCARIO: el efectivo sale de la gaveta (RETIRO_PARCIAL) y queda
   * respaldado con banco, boleta, depositante, comprobante y el encargado que
   * validó la boleta. Una boleta no puede registrarse dos veces.
   */
  async registrarDeposito(
    ctx: Ctx,
    sesionId: number,
    dto: { banco: string; numeroBoleta: string; depositante: string; monto: number; fechaDeposito: Date; comprobanteId?: string; observacion?: string },
    validadoPor: { id: number; nombre: string } | null,
  ) {
    const data = await this.prisma.enTransaccion(async (tx) => {
      await tx.$queryRaw`SELECT id FROM caja_sesiones WHERE id = ${sesionId} FOR UPDATE`;
      const sesion = await this.sesionOperable(tx, ctx, sesionId);
      const disponible = D((await this.resumen(sesion.id, tx)).esperado.EFECTIVO ?? 0);
      if (D(dto.monto).gt(disponible)) {
        throw reglaNegocio('FONDOS_INSUFICIENTES', `El depósito (Q${D(dto.monto).toFixed(2)}) supera el efectivo en caja (Q${disponible.toFixed(2)})`);
      }
      if (dto.comprobanteId && !(await tx.archivo.findUnique({ where: { id: dto.comprobanteId }, select: { id: true } }))) {
        throw noEncontrado('Comprobante');
      }
      const banco = dto.banco.trim().toUpperCase();
      const boleta = dto.numeroBoleta.trim().toUpperCase();
      const duplicado = await tx.cajaDeposito.findUnique({ where: { banco_numeroBoleta: { banco, numeroBoleta: boleta } } });
      if (duplicado) throw conflicto('BOLETA_DUPLICADA', `La boleta ${boleta} de ${banco} ya fue registrada`);

      const mov = await tx.cajaMovimiento.create({
        data: {
          sesionId, tipo: 'RETIRO_PARCIAL', medioPago: 'EFECTIVO', monto: r2(dto.monto), usuarioId: ctx.usuario.sub,
          concepto: `Depósito ${banco} boleta ${boleta} (${dto.depositante})`.slice(0, 250),
        },
      });
      const dep = await tx.cajaDeposito.create({
        data: {
          sesionId, movimientoId: mov.id, banco, numeroBoleta: boleta, depositante: dto.depositante.trim(), monto: r2(dto.monto),
          fechaDeposito: dto.fechaDeposito, comprobanteId: dto.comprobanteId ?? null, observacion: dto.observacion,
          validadoPorId: validadoPor?.id ?? ctx.usuario.sub, registradoPorId: ctx.usuario.sub,
        },
      });
      await this.audit.registrar(ctx, { accion: 'DEPOSITO_BANCARIO', entidad: 'CajaDeposito', entidadId: dep.id, despues: { ...dep, validadoPor } }, tx);
      return dep;
    });
    return { data, message: `Depósito de Q${D(data.monto).toFixed(2)} registrado` };
  }

  async depositos(ctx: Ctx, sesionId: number) {
    const lista = await this.prisma.cajaDeposito.findMany({
      where: { sesionId, sesion: { caja: { sucursalId: ctx.sucursalId! } } },
      orderBy: { id: 'desc' },
    });
    const ids = [...new Set(lista.flatMap((d) => [d.validadoPorId, d.registradoPorId]))];
    const usuarios = new Map((await this.prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]));
    return {
      data: lista.map((d) => ({ ...d, validadoPor: usuarios.get(d.validadoPorId), registradoPor: usuarios.get(d.registradoPorId) })),
    };
  }

  async sesiones(ctx: Ctx, f: { fecha?: Date; estado?: 'ABIERTA' | 'CERRADA' }) {
    const verTodas = tienePermiso(ctx.usuario, 'caja.supervisar');
    const data = await this.prisma.cajaSesion.findMany({
      where: {
        caja: { sucursalId: ctx.sucursalId! },
        ...(verTodas ? {} : { usuarioId: ctx.usuario.sub }),
        ...(f.fecha ? { fechaContable: f.fecha } : {}),
        ...(f.estado ? { estado: f.estado } : {}),
      },
      include: { caja: { select: { nombre: true } }, usuario: { select: { nombre: true } }, arqueos: true },
      orderBy: { id: 'desc' },
      take: 200,
    });
    return { data };
  }

  async detalle(ctx: Ctx, sesionId: number) {
    const s = await this.prisma.cajaSesion.findFirst({
      where: { id: sesionId, caja: { sucursalId: ctx.sucursalId! } },
      include: { caja: true, usuario: { select: { nombre: true } }, arqueos: true, movimientos: { orderBy: { id: 'asc' } } },
    });
    if (!s) throw noEncontrado('Sesión de caja', sesionId);
    if (s.usuarioId !== ctx.usuario.sub && !tienePermiso(ctx.usuario, 'caja.supervisar')) throw prohibido();
    return { data: { ...s, resumen: await this.resumen(s.id) } };
  }

  private async sesionOperable(db: Db, ctx: Ctx, sesionId: number) {
    const sesion = await db.cajaSesion.findFirst({ where: { id: sesionId, caja: { sucursalId: ctx.sucursalId! } } });
    if (!sesion) throw noEncontrado('Sesión de caja', sesionId);
    if (sesion.estado !== 'ABIERTA') throw reglaNegocio('CAJA_NO_ABIERTA', 'La sesión de caja ya está cerrada');
    if (sesion.usuarioId !== ctx.usuario.sub && !tienePermiso(ctx.usuario, 'caja.supervisar')) {
      throw prohibido('Solo el cajero o un supervisor pueden operar esta caja');
    }
    return sesion;
  }
}
