// Tabla del motor de listas (catálogos JSON) con el sistema de diseño:
// encabezado discreto, separadores finos y colores que siguen al tema y al modo oscuro.
import { flexRender } from '@tanstack/react-table'

import StatusBadge from './StatusBadge'

function ConfigurableTable({ table }) {
  const filas = table.getRowModel().rows
  const { pageIndex, pageSize } = table.getState().pagination
  return (
    <div className="overflow-hidden rounded-tarjeta border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-gray-50">
                <th className="w-14 px-4 py-2.5 text-left text-[13px] font-medium text-gray-500">#</th>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-2.5 text-left text-[13px] font-medium text-gray-500">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-gray-200">
            {filas.map((row, index) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="cifra px-4 py-3 text-gray-500">{pageIndex * pageSize + index + 1}</td>
                {row.getVisibleCells().map((cell) =>
                  cell.column.columnDef.type === 'badge' ? (
                    <td key={cell.id} className="px-4 py-3"><StatusBadge status={cell.getValue()} /></td>
                  ) : (
                    <td key={cell.id} className="px-4 py-3 text-gray-900">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ),
                )}
              </tr>
            ))}
            {!filas.length && (
              <tr><td colSpan={99} className="px-4 py-12 text-center text-gray-500">No hay registros. Pruebe con otra búsqueda o agregue uno nuevo.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ConfigurableTable
