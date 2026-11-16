import { Search } from 'lucide-react'

function UserSearchField({ value, onChange, onSearch }) {
  return (
    <div className="flex gap-3">
      <div className="relative flex-1">
        <Search
          size={18}
          className="
          absolute
          left-3
          top-1/2
          -translate-y-1/2
          text-gray-400
        "
        />

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar usuario..."
          className="
            w-full
            border
            rounded-lg
            pl-10
            pr-3
            py-3
          "
        />
      </div>

      <button
        type="button"
        onClick={onSearch}
        className="
          px-4
          py-3
          bg-violet-600
          text-white
          rounded-lg
        "
      >
        Buscar
      </button>
    </div>
  )
}

export default UserSearchField
