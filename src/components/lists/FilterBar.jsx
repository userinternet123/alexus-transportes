function FilterBar({ filters, values, onChange }) {
  return (
    <div className="flex flex-wrap gap-4">
      {filters.map((filter) => {
        if (filter.type === 'select') {
          return (
            <select
              key={filter.name}
              value={values[filter.name] || ''}
              onChange={(e) => onChange(filter.name, e.target.value)}
              className="border rounded-lg px-4 py-3"
            >
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )
        }

        return null
      })}
    </div>
  )
}

export default FilterBar
