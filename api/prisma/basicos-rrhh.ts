/**
 * DEPARTAMENTOS Y PUESTOS BÁSICOS. En una instalación nueva no existe ninguno, y sin ellos no se puede crear un
 * puesto (necesita departamento) ni un empleado (necesita puesto). Se crean SOLO si no hay ningún departamento ni
 * puesto: nunca pisan lo que el negocio ya configuró y nunca reaparecen si se desactivan (las bajas son lógicas,
 * así que las filas siguen existiendo).
 */
import type { PrismaClient } from '@prisma/client';

export const BASICOS_RRHH: { nombre: string; puestos: string[] }[] = [
  { nombre: 'Operaciones', puestos: ['Piloto', 'Despachador', 'Ayudante'] },
  { nombre: 'Taller', puestos: ['Mecánico', 'Jefe de taller'] },
  { nombre: 'Administración', puestos: ['Administrador', 'Contador', 'Auxiliar administrativo'] },
  { nombre: 'Gerencia', puestos: ['Gerente'] },
];

export async function crearBasicosRrhh(prisma: Pick<PrismaClient, 'departamentoOrg' | 'puesto'>): Promise<{ creados: boolean; departamentos: number; puestos: number }> {
  const [departamentos, puestos] = await Promise.all([prisma.departamentoOrg.count(), prisma.puesto.count()]);
  if (departamentos > 0 || puestos > 0) return { creados: false, departamentos: 0, puestos: 0 };
  let totalPuestos = 0;
  for (const d of BASICOS_RRHH) {
    const dep = await prisma.departamentoOrg.create({ data: { nombre: d.nombre } });
    await prisma.puesto.createMany({ data: d.puestos.map((nombre) => ({ departamentoId: dep.id, nombre })) });
    totalPuestos += d.puestos.length;
  }
  return { creados: true, departamentos: BASICOS_RRHH.length, puestos: totalPuestos };
}
