function TablePagination({ table }) {
  const paginas = table.getPageCount()
  if (paginas <= 1) return null
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
      <span>Página <span className="cifra font-medium text-gray-900">{table.getState().pagination.pageIndex + 1}</span> de <span className="cifra font-medium text-gray-900">{paginas}</span></span>
      <div className="flex gap-2">
        <button type="button" className="rounded-control border bg-white px-3 py-1.5 disabled:opacity-40" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Anterior
        </button>
        <button type="button" className="rounded-control border bg-white px-3 py-1.5 disabled:opacity-40" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Siguiente
        </button>
      </div>
    </div>
  )
}

export default TablePagination
