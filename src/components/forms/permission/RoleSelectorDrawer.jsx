import { useEffect, useMemo, useState } from 'react'
import { X, Search, Shield } from 'lucide-react'
import { createPortal } from 'react-dom'

function RoleSelectorDrawer({
  open,
  onClose,
  roles = [],
  assignedRoles = [],
  onSave,
  title = 'Configure title',
  subtitle = 'Configure subtitle',
  // configure fields
  codigo,
  nombre,
  descripcion,
}) {
  const [search, setSearch] = useState('')
  const [selectedRoles, setSelectedRoles] = useState([])

  useEffect(() => {
    if (open) {
      setSelectedRoles(assignedRoles.map((r) => r[codigo]))
    }
  }, [open, assignedRoles, codigo])

  const filteredRoles = useMemo(() => {
    return roles.filter((role) => role[nombre].toLowerCase().includes(search.toLowerCase()))
  }, [roles, search, nombre])

  const handleToggle = (roleId) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId) ? prev.filter((x) => x !== roleId) : [...prev, roleId]
    )
  }

  const handleSave = () => {
    const result = roles.filter((role) => selectedRoles.includes(role[codigo]))

    onSave(result)
    onClose()
  }

  if (!open) return null

  return createPortal(
    <>
      {/* Overlay */}

      <div
        className="
          mac-fondo
          fixed inset-0
          bg-black/40
          z-40
          backdrop-blur-sm
        "
        onClick={onClose}
      />

      {/* Drawer */}

      <div
        className="
          mac-lateral
          fixed
          top-0
          right-0
          h-full
          w-[550px]
          bg-white
          shadow-2xl
          z-50
          flex
          flex-col
        "
      >
        {/* Header */}

        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{title}</h2>

              <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            </div>

            <button
              onClick={onClose}
              className="
                p-2 rounded-lg
                hover:bg-gray-100
              "
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Buscador */}

        <div className="p-5 border-b">
          <div className="relative">
            <Search
              size={18}
              className="
                absolute
                left-3 top-1/2
                -translate-y-1/2
                text-gray-400
              "
            />

            <input
              type="text"
              placeholder="Buscar ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="
                w-full
                border
                rounded-lg
                pl-10
                pr-4
                py-3
                outline-none
                focus:ring-2
                focus:ring-violet-400
              "
            />
          </div>
        </div>

        {/* Lista */}

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {filteredRoles.length === 0 ? (
              <div className="text-gray-400 text-center py-10">No se encontraron registros</div>
            ) : (
              filteredRoles.map((role) => (
                <label
                  key={role[codigo]}
                  className="
                    flex items-start gap-4
                    p-4
                    border
                    rounded-xl
                    cursor-pointer
                    hover:bg-violet-50
                    transition
                  "
                >
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role[codigo])}
                    onChange={() => handleToggle(role[codigo])}
                    className="
                      mt-1
                      h-5
                      w-5
                    "
                  />

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Shield size={18} className="text-violet-600" />

                      <span className="font-medium">{role[nombre]}</span>
                    </div>

                    {role[descripcion] && (
                      <div className="text-sm text-gray-500 mt-1">{role[descripcion]}</div>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Footer */}

        <div className="border-t p-5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {selectedRoles.length} items seleccionado(s)
            </span>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="
                  px-4 py-2
                  border-4
                  rounded-lg
                "
              >
                Cancelar
              </button>

              <button
                onClick={handleSave}
                className="
                  px-4 py-2
                  bg-violet-600
                  text-white
                  rounded-lg
                  hover:bg-violet-700
                "
              >
                Agregar Seleccionados
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

export default RoleSelectorDrawer
