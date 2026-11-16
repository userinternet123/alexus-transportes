import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from 'lucide-react'

function AssignmentToolbar({
  moveSelectedToRight,
  moveSelectedToLeft,
  moveAllToRight,
  moveAllToLeft,
}) {
  return (
    <div className="flex flex-col gap-3 justify-center">
      <button
        type="button"
        onClick={moveSelectedToRight}
        className="p-2 rounded border hover:bg-slate-100"
      >
        <ChevronRight />
      </button>

      <button
        type="button"
        onClick={moveSelectedToLeft}
        className="p-2 rounded border hover:bg-slate-100"
      >
        <ChevronLeft />
      </button>

      <button
        type="button"
        onClick={moveAllToRight}
        className="p-2 rounded border hover:bg-slate-100"
      >
        <ChevronsRight />
      </button>

      <button
        type="button"
        onClick={moveAllToLeft}
        className="p-2 rounded border hover:bg-slate-100"
      >
        <ChevronsLeft />
      </button>
    </div>
  )
}

export default AssignmentToolbar
