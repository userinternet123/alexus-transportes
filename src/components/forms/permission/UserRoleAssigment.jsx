import { useState } from 'react'
import { Plus, X, Search } from 'lucide-react'

function UserRoleAssignment({ user, allRoles = [], assignedRoles = [], onChange }) {
  const [searchRole, setSearchRole] = useState('')
  const [showRoles, setShowRoles] = useState(false)

  const assignedIds = assignedRoles.map((r) => r.id)

  const availableRoles = allRoles.filter(
    (r) => !assignedIds.includes(r.id) && r.label.toLowerCase().includes(searchRole.toLowerCase())
  )

  const addRole = (role) => {
    onChange([...assignedRoles, role])

    setSearchRole('')
    setShowRoles(false)
  }

  const removeRole = (roleId) => {
    onChange(assignedRoles.filter((r) => r.id !== roleId))
  }

  return (
    <div className="space-y-6">
      {/* Usuario */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-5">Información del Usuario</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-gray-500">Usuario</label>

            <div className="mt-1 border rounded-lg p-3 bg-slate-50">{user.username}</div>
          </div>

          <div>
            <label className="text-sm text-gray-500">Nombre Completo</label>

            <div className="mt-1 border rounded-lg p-3 bg-slate-50">{user.name}</div>
          </div>

          <div>
            <label className="text-sm text-gray-500">Correo</label>

            <div className="mt-1 border rounded-lg p-3 bg-slate-50">{user.email}</div>
          </div>
        </div>
      </div>

      {/* Roles */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-semibold">Roles Asignados ({assignedRoles.length})</h3>

          <button
            type="button"
            onClick={() => setShowRoles(!showRoles)}
            className="
              flex items-center gap-2
              px-4 py-2
              bg-violet-600
              text-white
              rounded-lg
              hover:bg-violet-700
            "
          >
            <Plus size={18} />
            Agregar Rol
          </button>
        </div>

        {/* Chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {assignedRoles.length === 0 ? (
            <span className="text-gray-400 text-sm">No hay roles asignados</span>
          ) : (
            assignedRoles.map((role) => (
              <div
                key={role.id}
                className="
                  flex items-center gap-2
                  px-3 py-2
                  rounded-full
                  bg-violet-100
                  text-violet-800
                  font-medium
                "
              >
                {role.label}

                <button type="button" onClick={() => removeRole(role.id)}>
                  <X size={14} className="hover:text-red-500" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Dropdown de búsqueda */}
        {showRoles && (
          <div className="border rounded-xl">
            <div className="p-4 border-b">
              <div className="relative">
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
                  value={searchRole}
                  onChange={(e) => setSearchRole(e.target.value)}
                  placeholder="Buscar rol..."
                  className="
                    w-full
                    pl-10
                    pr-4
                    py-3
                    border
                    rounded-lg
                  "
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {availableRoles.length === 0 ? (
                <div className="p-4 text-sm text-gray-400">No se encontraron roles</div>
              ) : (
                availableRoles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => addRole(role)}
                    className="
                      w-full
                      flex
                      justify-between
                      items-center
                      px-4
                      py-3
                      border-b
                      hover:bg-violet-50
                      text-left
                    "
                  >
                    <div>
                      <div className="font-medium">{role.label}</div>

                      {role.description && (
                        <div className="text-xs text-gray-500">{role.description}</div>
                      )}
                    </div>

                    <Plus size={18} className="text-violet-600" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default UserRoleAssignment
