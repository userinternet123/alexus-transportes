import { Search } from 'lucide-react'

function SearchBar({ value, onChange, placeholder = 'Buscar' }) {
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-2.5 text-gray-400" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-control border bg-white py-2 pl-9 pr-3 text-[15px]"
      />
    </div>
  )
}

export default SearchBar
