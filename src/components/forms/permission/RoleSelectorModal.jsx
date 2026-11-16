import { useMemo, useState } from 'react'

import { X } from 'lucide-react'

function RoleSelectorModal({ open, roles, selectedRoles, onClose, onSave }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])

  const filtered = useMemo(() => {
    return roles.filter((r) => r.label.toLowerCase().includes(search.toLowerCase()))
  }, [roles, search])

  if (!open) return null

  const toggleRole = (role) => {
    const exists = selected.find((x) => x.id === role.id)

    if (exists) {
      setSelected((prev) => prev.filter((x) => x.id !== role.id))
    } else {
      setSelected((prev) => [...prev, role])
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="mac-fondo flex-1 bg-black/40" onClick={onClose} />

      <div
        className="
          mac-lateral
          w-[500px]
          bg-white
          h-screen
          shadow-xl
          p-6
        "
      >
        <div className="flex justify-between mb-5">
          <h2 className="text-xl font-semibold">Asignar Roles</h2>

          <button onClick={onClose}>
            <X />
          </button>
        </div>

        <input
          placeholder="Buscar rol..."
          className="
            w-full
            border
            rounded-lg
            p-3
            mb-4
          "
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="space-y-2 max-h-[70vh] overflow-auto">
          {filtered.map((role) => {
            const checked =
              selected.some((x) => x.id === role.id) || selectedRoles.some((x) => x.id === role.id)

            return (
              <label
                key={role.id}
                className="
                  flex
                  items-center
                  gap-3
                  border
                  rounded-lg
                  p-3
                  cursor-pointer
                "
              >
                <input type="checkbox" checked={checked} onChange={() => toggleRole(role)} />

                {role.label}
              </label>
            )
          })}
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={() => onSave(selected)}
            className="
              bg-violet-600
              text-white
              px-4
              py-2
              rounded-lg
            "
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  )
}

export default RoleSelectorModal
