import { X } from 'lucide-react'

function RoleChip({ role, onRemove, codigo, nombre, descripcion }) {
  return (
    <div
      className="
      flex items-center gap-2
      px-3 py-2
      bg-violet-100
      text-violet-700
      rounded-full

      hover:shadow-lg
      font-medium
    "
    >
      {role?.[nombre]}

      <button type="button" onClick={() => onRemove(role[codigo])}>
        <X size={22} />
      </button>
    </div>
  )
}

export default RoleChip
