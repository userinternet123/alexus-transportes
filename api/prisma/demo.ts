/**
 * DATOS DE PRUEBA (ficticios): 5 cabezales, 5 pilotos, 2 remolques, clientes, rutas con sus condiciones,
 * tarifas, documentos, llantas, repuestos, viajes del último mes con anticipos, costos, cargas de combustible
 * (con rendimiento) y liquidación, órdenes de taller, inspecciones y casos. Sirven para ver reportes y pantallas con números antes de tener registros reales.
 *
 *   npm run db:demo          (requiere haber corrido npm run db:seed)
 *
 * Idempotente: si ya existe el cabezal C-01 no hace nada. Para repetirlo, vacíe la base.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { liquidar } from '../src/modules/viajes/viajes.logica';
import { PUNTOS } from '../src/modules/inspecciones/inspecciones.logica';

const prisma = new PrismaClient();
const D = (n: number | string) => new Prisma.Decimal(n);
const dia = (n: number) => new Date(Date.now() - n * 86_400_000);
const ymd = (n: number) => new Date(dia(n).toISOString().slice(0, 10));
/** Aleatorio determinista (misma demo en todas las instalaciones). */
let semilla = 7;
const azar = () => { semilla = (semilla * 9301 + 49297) % 233280; return semilla / 233280; };
const entre = (a: number, b: number) => Math.round((a + (b - a) * azar()) * 100) / 100;

async function main() {
  if (await prisma.cabezal.findUnique({ where: { codigo: 'C-01' } })) { console.log('Los datos de prueba ya existen (C-01). Nada que hacer.'); return; }
  const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
  const admin = await prisma.usuario.findFirstOrThrow({ where: { username: 'admin' } });
  const puestoPiloto = await prisma.puesto.findFirst({ where: { nombre: 'Piloto' } }) ?? await prisma.puesto.create({ data: { nombre: 'Piloto', departamento: { connectOrCreate: { where: { nombre: 'Operaciones' }, create: { nombre: 'Operaciones' } } } } });

  // Marcas
  const marcas: Record<string, number> = {};
  for (const n of ['Michelin', 'Bridgestone', 'Goodyear', 'Fleetguard', 'Mobil', 'Bendix', 'Donaldson']) marcas[n] = (await prisma.marca.upsert({ where: { nombre: n }, create: { nombre: n }, update: {} })).id;

  // Clientes, proveedor y taller
  const clientes = await Promise.all([
    { nit: '1234567K', razonSocial: 'Agroexportadora del Pacífico, S.A.', nombreComercial: 'AgroPacífico', contacto: 'Lic. Rodríguez', telefono: '2222-1111', diasCredito: 30 },
    { nit: '7654321K', razonSocial: 'Cementos del Norte, S.A.', nombreComercial: 'CENOR', contacto: 'Ing. Morales', telefono: '2333-2222', diasCredito: 45 },
    { nit: '5555555K', razonSocial: 'Distribuidora Centroamericana, S.A.', nombreComercial: 'DICESA', contacto: 'Sra. López', telefono: '2444-3333', diasCredito: 15 },
  ].map((c) => prisma.tercero.create({ data: { tipo: 'EMPRESA', esCliente: true, ...c } })));
  const proveedor = await prisma.tercero.create({ data: { tipo: 'EMPRESA', esCliente: false, esProveedor: true, nit: '9999999K', razonSocial: 'Llantas y Repuestos del Sur, S.A.', nombreComercial: 'LLANTISUR', telefono: '2555-4444' } });
  const taller = await prisma.tercero.create({ data: { tipo: 'EMPRESA', esCliente: false, esTaller: true, nit: '8888888K', razonSocial: 'Taller Diésel Hernández', nombreComercial: 'Taller Hernández', telefono: '2666-5555' } });

  // Rutas y tarifas
  const rutas = await Promise.all([
    // Condiciones ilustrativas: ajústelas a su experiencia (terreno, subida acumulada, tráfico, esperas en puerto o frontera)
    { nombre: 'Guatemala - Puerto Quetzal', origen: 'Ciudad de Guatemala', destino: 'Puerto Quetzal, Escuintla', kmEstimados: D(110), horasEstimadas: D(3), peajesEstimados: D(60), viaticoEstimado: D(150), terreno: 'ONDULADO' as const, trafico: 'LENTO' as const, horasEspera: D(3), notas: 'Bajada a la costa; cola en la portuaria' },
    { nombre: 'Guatemala - Puerto Santo Tomás', origen: 'Ciudad de Guatemala', destino: 'Puerto Santo Tomás de Castilla, Izabal', kmEstimados: D(300), horasEstimadas: D(7), peajesEstimados: D(80), viaticoEstimado: D(350), terreno: 'ONDULADO' as const, trafico: 'NORMAL' as const, horasEspera: D(2) },
    { nombre: 'Guatemala - Quetzaltenango', origen: 'Ciudad de Guatemala', destino: 'Quetzaltenango', kmEstimados: D(205), horasEstimadas: D(5), peajesEstimados: D(0), viaticoEstimado: D(250), terreno: 'MONTANA' as const, subidaMetros: 2400, trafico: 'NORMAL' as const, horasEspera: D(0), notas: 'Interamericana: cumbre de Alaska' },
    { nombre: 'Guatemala - San Salvador', origen: 'Ciudad de Guatemala', destino: 'San Salvador, El Salvador', kmEstimados: D(240), horasEstimadas: D(6), peajesEstimados: D(120), viaticoEstimado: D(400), terreno: 'ONDULADO' as const, trafico: 'NORMAL' as const, horasEspera: D(4), notas: 'Frontera Pedro de Alvarado o San Cristóbal' },
  ].map((r) => prisma.ruta.create({ data: r })));
  const tarifas = await Promise.all([
    prisma.tarifa.create({ data: { clienteId: clientes[0].id, rutaId: rutas[0].id, tipo: 'POR_VIAJE', monto: D(2800) } }),
    prisma.tarifa.create({ data: { clienteId: clientes[0].id, rutaId: rutas[1].id, tipo: 'POR_VIAJE', monto: D(6500) } }),
    prisma.tarifa.create({ data: { clienteId: clientes[1].id, rutaId: rutas[2].id, tipo: 'POR_VIAJE', monto: D(5200) } }),
    prisma.tarifa.create({ data: { clienteId: clientes[2].id, rutaId: rutas[3].id, tipo: 'POR_VIAJE', monto: D(7800) } }),
    prisma.tarifa.create({ data: { clienteId: clientes[2].id, rutaId: rutas[0].id, tipo: 'POR_VIAJE', monto: D(2600) } }),
  ]);

  // Pilotos (empleado + datos de piloto)
  const nombres = [['Carlos', 'Pérez López'], ['Luis', 'García Ramírez'], ['José', 'Hernández Castro'], ['Mario', 'Morales Díaz'], ['Pedro', 'Juárez Ortiz']];
  const pilotos = [];
  for (let i = 0; i < nombres.length; i += 1) {
    const [n, a] = nombres[i];
    const empleado = await prisma.empleado.create({ data: {
      codigo: `P0${i + 1}`, nombres: n, apellidos: a, cui: `${2000000000000 + i * 1111111}`, nit: `${1000000 + i}K`, telefono: `5${i}00-000${i}`,
      sucursalId: sucursal.id, puestoId: puestoPiloto.id, fechaIngreso: ymd(400 + i * 90), salarioBase: D(4500), bonificacionIncentivo: D(250),
    } });
    pilotos.push(await prisma.piloto.create({ data: {
      empleadoId: empleado.id, licenciaTipo: 'A', licenciaNumero: `${3000000 + i * 777}`, licenciaVence: i === 2 ? ymd(-20) : ymd(-(200 + i * 100)),
      pagoPorViaje: D(150), viaticoDiario: D(125), telefonoEmergencia: `4${i}00-111${i}`, tipoSangre: 'O+',
    } }));
  }

  // Cabezales y remolques
  const marcasCabezal = [['Freightliner', 'Cascadia', 2018], ['Kenworth', 'T680', 2019], ['International', 'LT625', 2017], ['Freightliner', 'Columbia', 2015], ['Volvo', 'VNL 670', 2020]];
  const cabezales = [];
  for (let i = 0; i < 5; i += 1) {
    const [marca, modelo, anio] = marcasCabezal[i];
    cabezales.push(await prisma.cabezal.create({ data: {
      codigo: `C-0${i + 1}`, placa: `C${100 + i}BCD`, marca: String(marca), modelo: String(modelo), anio: Number(anio), ejes: 3,
      odometro: D(320000 + i * 45000), capacidadTanque: D(150), rendimientoEsperado: D(i === 3 ? 7.5 : 9),
      fechaCompra: ymd(900 + i * 200), costoCompra: D(450000 + i * 35000), vidaUtilAnios: 10,
      sucursalId: sucursal.id, pilotoAsignadoId: pilotos[i].id, estado: i === 3 ? 'EN_TALLER' : 'ACTIVO',
    } }));
  }
  const remolques = await Promise.all([
    prisma.remolque.create({ data: { codigo: 'R-01', placa: 'TC101ABC', tipo: 'PLATAFORMA', marca: 'Great Dane', anio: 2016, ejes: 2, capacidadToneladas: D(30), largoMetros: D(12.2) } }),
    prisma.remolque.create({ data: { codigo: 'R-02', placa: 'TC102ABC', tipo: 'FURGON', marca: 'Utility', anio: 2018, ejes: 2, capacidadToneladas: D(26), largoMetros: D(16.2) } }),
  ]);

  // Documentos con vencimiento (uno por vencer pronto para que se vea la alerta)
  for (let i = 0; i < cabezales.length; i += 1) {
    await prisma.documentoVehiculo.create({ data: { cabezalId: cabezales[i].id, tipo: 'SEGURO', numero: `POL-${2026}-${100 + i}`, emisor: 'Seguros G&T', emitido: ymd(300), vence: i === 0 ? ymd(-12) : ymd(-(65 + i * 40)), costo: D(18500) } });
    await prisma.documentoVehiculo.create({ data: { cabezalId: cabezales[i].id, tipo: 'TARJETA_CIRCULACION', numero: `TC-${500 + i}`, emisor: 'SAT', vence: ymd(-(150 + i * 30)) } });
  }
  for (const r of remolques) await prisma.documentoVehiculo.create({ data: { remolqueId: r.id, tipo: 'TARJETA_CIRCULACION', numero: `TC-${r.codigo}`, emisor: 'SAT', vence: ymd(-200) } });

  // Llantas: 10 montadas en C-01 (posiciones) y 4 en bodega; 3 ya retiradas con km acumulados
  const medidas = ['11R22.5', '295/80R22.5'];
  const marcasLlanta = ['Michelin', 'Bridgestone', 'Goodyear'];
  const posiciones = ['E1-I', 'E1-D', 'E2-IE', 'E2-II', 'E2-DI', 'E2-DE', 'E3-IE', 'E3-II', 'E3-DI', 'E3-DE'];
  for (let i = 0; i < 10; i += 1) {
    const l = await prisma.llanta.create({ data: { codigo: `DOT${2024}${1000 + i}`, marcaId: marcas[marcasLlanta[i % 3]], medida: medidas[i % 2], precio: D(3200 + (i % 3) * 400), fechaCompra: ymd(180), proveedorId: proveedor.id, estado: 'MONTADA' } });
    await prisma.montajeLlanta.create({ data: { llantaId: l.id, cabezalId: cabezales[0].id, posicion: posiciones[i], fechaMontaje: ymd(180), kmMontaje: D(300000) } });
  }
  for (let i = 0; i < 4; i += 1) await prisma.llanta.create({ data: { codigo: `DOT${2026}${2000 + i}`, marcaId: marcas[marcasLlanta[i % 3]], medida: medidas[0], precio: D(3400), fechaCompra: ymd(20), proveedorId: proveedor.id, estado: 'EN_BODEGA' } });
  for (let i = 0; i < 3; i += 1) await prisma.llanta.create({ data: { codigo: `DOT${2023}${3000 + i}`, marcaId: marcas[marcasLlanta[i]], medida: medidas[0], precio: D(3000 + i * 300), fechaCompra: ymd(700), estado: 'DESECHADA', kmAcumulados: D(60000 + i * 18000), motivoBaja: 'Desgaste' } });

  // Repuestos
  const repuestos = await Promise.all([
    { codigo: 'FA-001', nombre: 'Filtro de aceite', categoria: 'FILTROS', marcaId: marcas.Fleetguard, unidad: 'UNIDAD', precioReferencia: D(180) },
    { codigo: 'FC-001', nombre: 'Filtro de combustible', categoria: 'FILTROS', marcaId: marcas.Donaldson, unidad: 'UNIDAD', precioReferencia: D(220) },
    { codigo: 'AC-15W40', nombre: 'Aceite de motor 15W-40', categoria: 'LUBRICANTES', marcaId: marcas.Mobil, unidad: 'GALON', precioReferencia: D(165) },
    { codigo: 'BAL-001', nombre: 'Balatas (juego)', categoria: 'FRENOS', marcaId: marcas.Bendix, unidad: 'JUEGO', precioReferencia: D(1450) },
  ].map((r) => prisma.repuesto.create({ data: r })));
  const planAceite = await prisma.planMantenimiento.findFirst({ where: { nombre: { contains: 'aceite' } } });

  // Viajes del último mes: 3 por cabezal, con odómetro continuo, anticipo, peajes, viáticos y una carga de
  // tanque lleno al llegar (el rendimiento sale de llenado a llenado). Los liquidados guardan su ganancia.
  let numero = 1;
  const COSTO_KM_DEMO = 4.5; // costo indirecto ilustrativo (Q/km) para la ganancia de la demo
  const combos = [[0, 0, 0], [0, 1, 1], [1, 2, 2], [2, 3, 3], [2, 0, 4]]; // [cliente, ruta, tarifa]
  for (let c = 0; c < cabezales.length; c += 1) {
    let odo = 300000 + c * 40000;
    const esperado = Number(cabezales[c].rendimientoEsperado);
    // Carga base: primer llenado completo (punto de partida del rendimiento)
    await prisma.cargaCombustible.create({ data: { sucursalId: sucursal.id, cabezalId: cabezales[c].id, pilotoId: pilotos[c].id, fecha: dia(30), odometro: D(odo), galones: D(60), precioGalon: D(30.5), total: D(1830), tanqueLleno: true, estacion: 'Puma Calzada Roosevelt', registradoPorId: admin.id } });
    for (let k = 0; k < 3; k += 1) {
      const [ci, ri, ti] = combos[(c + k) % combos.length];
      const ruta = rutas[ri];
      const salida = dia(27 - k * 9 - c);
      const llegada = new Date(salida.getTime() + Number(ruta.horasEstimadas) * 2 * 3_600_000);
      const kmRuta = Number(ruta.kmEstimados) * 2; // ida y vuelta
      // Rendimiento real alrededor del esperado; el C-03 en su último viaje consume de más (dispara la alerta)
      const rend = c === 2 && k === 2 ? esperado * 0.78 : entre(esperado * 0.9, esperado * 1.04);
      const galones = Math.round((kmRuta / rend) * 1000) / 1000;
      const precioGal = entre(29.5, 31.5);
      const combustible = Math.round(galones * precioGal * 100) / 100;
      const peajes = Number(ruta.peajesEstimados) * 2;
      const viatico = Number(ruta.viaticoEstimado);
      const anticipo = Math.round((peajes + viatico) * 1.1);
      const liquidado = k < 2;
      const l = liquidar({ montoCobrado: tarifas[ti].monto, pagoPiloto: 150, kmRecorridos: kmRuta, costoKmFijo: COSTO_KM_DEMO, anticipos: [anticipo], costos: [
        { tipo: 'COMBUSTIBLE', monto: combustible, pagadoPorPiloto: false }, { tipo: 'PEAJE', monto: peajes, pagadoPorPiloto: true }, { tipo: 'VIATICO', monto: viatico, pagadoPorPiloto: true },
      ] });
      const viaje = await prisma.viaje.create({ data: {
        numero: `V-${String(numero).padStart(6, '0')}`, sucursalId: sucursal.id, clienteId: clientes[ci].id, rutaId: ruta.id, tarifaId: tarifas[ti].id,
        cabezalId: cabezales[c].id, remolqueId: remolques[k % 2].id, pilotoId: pilotos[c].id,
        origen: ruta.origen, destino: ruta.destino, carga: ci === 1 ? 'Cemento en sacos (28 t)' : ci === 0 ? 'Contenedor 40 pies' : 'Abarrotes paletizados',
        fechaSalida: salida, iniciadoEn: salida, fechaLlegada: llegada, fechaCompromiso: new Date(salida.getTime() + (k === 1 ? 10 : 36) * 3_600_000),
        kmSalida: D(odo), kmLlegada: D(odo + kmRuta), kmVacios: D(Number(ruta.kmEstimados)),
        montoCobrado: tarifas[ti].monto, anticipoPiloto: D(anticipo), pagoPiloto: D(150), totalCostos: l.costosDirectos,
        estado: liquidado ? 'LIQUIDADO' : 'FINALIZADO', creadoPorId: admin.id,
        ...(liquidado ? { liquidadoEn: new Date(llegada.getTime() + 86_400_000), liquidadoPorId: admin.id, saldoPiloto: l.saldoPiloto, costoKmFijo: D(COSTO_KM_DEMO), prorrateo: l.prorrateo, ganancia: l.ganancia } : {}),
      } });
      numero += 1;
      await prisma.anticipoViaje.create({ data: { viajeId: viaje.id, monto: D(anticipo), medio: 'EFECTIVO', fecha: salida, nota: 'Peajes y viáticos', entregadoPorId: admin.id } });
      await prisma.costoViaje.createMany({ data: [
        { viajeId: viaje.id, tipo: 'PEAJE', descripcion: 'Peajes ida y vuelta', monto: D(peajes), fecha: salida, registradoPorId: admin.id },
        { viajeId: viaje.id, tipo: 'VIATICO', descripcion: 'Alimentación y hospedaje', monto: D(viatico), fecha: salida, registradoPorId: admin.id },
      ] });
      const alerta = rend < esperado * 0.85;
      const carga = await prisma.cargaCombustible.create({ data: {
        sucursalId: sucursal.id, cabezalId: cabezales[c].id, pilotoId: pilotos[c].id, viajeId: viaje.id, fecha: llegada, odometro: D(odo + kmRuta),
        galones: D(galones), precioGalon: D(precioGal), total: D(combustible), tanqueLleno: true, estacion: 'Shell Amatitlán', documento: `VALE-${numero}`, registradoPorId: admin.id,
        kmRecorridos: D(kmRuta), galonesTramo: D(galones), rendimiento: D(Math.round((kmRuta / galones) * 1000) / 1000), alerta,
      } });
      await prisma.costoViaje.create({ data: { viajeId: viaje.id, tipo: 'COMBUSTIBLE', descripcion: `${galones.toFixed(2)} gal · Shell Amatitlán`, monto: D(combustible), pagadoPorPiloto: false, cargaId: carga.id, fecha: llegada, registradoPorId: admin.id } });
      odo += kmRuta + 15; // patio y maniobras entre viajes
    }
    await prisma.cabezal.update({ where: { id: cabezales[c].id }, data: { odometro: D(odo) } });
  }

  // Inspecciones pre viaje de hoy: C-01 aprobada; C-05 con observaciones (extintor) y su caso abierto
  const aprobar = (cabezalId: number, remolqueId: number | null, fallas: Record<string, string> = {}) => PUNTOS.filter((p) => p.aplicaA === 'CABEZAL' || remolqueId).map((p) => ({ codigo: p.codigo, estado: fallas[p.codigo] ? 'FALLA' as const : 'OK' as const, critico: p.critico, nota: fallas[p.codigo] ?? null }));
  const c1 = await prisma.cabezal.findUniqueOrThrow({ where: { id: cabezales[0].id } });
  await prisma.inspeccion.create({ data: { sucursalId: sucursal.id, cabezalId: c1.id, pilotoId: pilotos[0].id, odometro: c1.odometro, resultado: 'APROBADA', registradoPorId: admin.id, puntos: { create: aprobar(c1.id, null) } } });
  const c5 = await prisma.cabezal.findUniqueOrThrow({ where: { id: cabezales[4].id } });
  const i5 = await prisma.inspeccion.create({ data: { sucursalId: sucursal.id, cabezalId: c5.id, pilotoId: pilotos[4].id, odometro: c5.odometro, resultado: 'CON_OBSERVACIONES', fallas: 1, registradoPorId: admin.id, puntos: { create: aprobar(c5.id, null, { EXTINTOR: 'Vencido en octubre' }) } } });
  await prisma.caso.create({ data: { numero: 'CS-000001', sucursalId: sucursal.id, origen: 'INSPECCION', tipo: 'SEGURIDAD', prioridad: 'ALTA', titulo: 'Extintor cargado y vigente', descripcion: 'Vencido en octubre', cabezalId: c5.id, inspeccionId: i5.id, puntoCodigo: 'EXTINTOR', venceEn: new Date(Date.now() + 20 * 3_600_000), creadoPorId: admin.id } });
  await prisma.caso.create({ data: { numero: 'CS-000002', sucursalId: sucursal.id, origen: 'MANUAL', tipo: 'DOCUMENTOS', prioridad: 'MODERADA', titulo: 'Renovar seguro del C-01', descripcion: 'La póliza vence en menos de dos semanas', cabezalId: c1.id, venceEn: new Date(Date.now() - 2 * 3_600_000), creadoPorId: admin.id } });

  // Órdenes de taller: preventivo en C-01 y C-02, correctivo abierto en C-04 (que está en taller)
  const ot = async (i: number, data: Omit<Prisma.OrdenTrabajoUncheckedCreateInput, 'numero' | 'sucursalId' | 'creadoPorId'>) =>
    prisma.ordenTrabajo.create({ data: { numero: `OT-${String(i).padStart(6, '0')}`, sucursalId: sucursal.id, creadoPorId: admin.id, ...data } });
  const o1 = await ot(1, { cabezalId: cabezales[0].id, planId: planAceite?.id, tipo: 'PREVENTIVO', descripcion: 'Cambio de aceite y filtros', odometro: D(315000), fechaApertura: dia(18), fechaCierre: dia(18), manoObra: D(350), totalRepuestos: D(2080), total: D(2430), estado: 'CERRADA' });
  await prisma.ordenTrabajoRepuesto.createMany({ data: [
    { ordenId: o1.id, repuestoId: repuestos[0].id, marcaId: marcas.Fleetguard, cantidad: D(1), costoUnitario: D(180), total: D(180) },
    { ordenId: o1.id, repuestoId: repuestos[1].id, marcaId: marcas.Donaldson, cantidad: D(1), costoUnitario: D(220), total: D(220) },
    { ordenId: o1.id, repuestoId: repuestos[2].id, marcaId: marcas.Mobil, cantidad: D(10), costoUnitario: D(168), total: D(1680) },
  ] });
  const o2 = await ot(2, { cabezalId: cabezales[1].id, tipo: 'CORRECTIVO', tallerId: taller.id, descripcion: 'Cambio de balatas eje trasero', odometro: D(362000), fechaApertura: dia(9), fechaCierre: dia(8), manoObra: D(900), totalRepuestos: D(2900), total: D(3800), documento: 'F-4471', estado: 'CERRADA' });
  await prisma.ordenTrabajoRepuesto.create({ data: { ordenId: o2.id, repuestoId: repuestos[3].id, marcaId: marcas.Bendix, cantidad: D(2), costoUnitario: D(1450), total: D(2900) } });
  await ot(3, { cabezalId: cabezales[3].id, tipo: 'SERVICIO_MAYOR', tallerId: taller.id, descripcion: 'Servicio mayor: inyectores y turbo', odometro: D(455000), fechaApertura: dia(2), manoObra: D(6500), totalRepuestos: D(0), total: D(6500), estado: 'EN_PROCESO' });

  // Gastos de operación del mes
  const cat = async (n: string) => (await prisma.categoriaGasto.findFirst({ where: { nombre: { contains: n } } }))?.id ?? (await prisma.categoriaGasto.create({ data: { nombre: n } })).id;
  await prisma.gasto.createMany({ data: [
    { sucursalId: sucursal.id, categoriaId: await cat('Alquiler'), fecha: ymd(25), concepto: 'Alquiler del predio', monto: D(8000), medioPago: 'TRANSFERENCIA', usuarioId: admin.id },
    { sucursalId: sucursal.id, categoriaId: await cat('Seguros'), fecha: ymd(20), concepto: 'Cuota mensual de seguros de flota', monto: D(7700), medioPago: 'TRANSFERENCIA', usuarioId: admin.id },
    { sucursalId: sucursal.id, categoriaId: await cat('Rastreo'), fecha: ymd(15), concepto: 'GPS 5 unidades', monto: D(1250), medioPago: 'TARJETA', usuarioId: admin.id },
    { sucursalId: sucursal.id, categoriaId: await cat('Salarios'), fecha: ymd(10), concepto: 'Planilla administrativa', monto: D(12000), medioPago: 'TRANSFERENCIA', usuarioId: admin.id },
  ] });

  console.log(`✔ Datos de prueba: ${cabezales.length} cabezales, ${pilotos.length} pilotos, ${remolques.length} remolques, ${clientes.length} clientes, ${rutas.length} rutas, ${numero - 1} viajes, 3 órdenes de taller, 2 inspecciones y 2 casos.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
