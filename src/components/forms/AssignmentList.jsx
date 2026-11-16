function AssignmentList({ title, items, selected, onSelect }) {
  return (
    <div className="flex-1 border rounded-lg bg-white shadow-sm">
      <div className="px-4 py-3 border-b bg-slate-50 font-semibold">{title}</div>

      <div className="h-72 overflow-auto">
        {items.length === 0 ? (
          <div className="p-4 text-gray-400 text-sm">Sin registros</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`
                px-3 py-2 border-b cursor-pointer
                hover:bg-indigo-50
                ${selected.includes(item.id) ? 'bg-indigo-100' : ''}
              `}
            >
              {item.label}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default AssignmentList
