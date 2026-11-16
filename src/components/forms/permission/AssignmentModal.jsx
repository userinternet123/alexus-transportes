import { useState } from 'react'

import { Plus } from 'lucide-react'

import RoleChip from '../permission/RoleChip'
import RoleSelectorModal from '../permission/RoleSelectorDrawer'

function AssignmentModal({ label, value = [], options = [], onChange, drawerConfig }) {
  const { codigo, nombre, descripcion } = drawerConfig?.camposDb ?? {}
  const [open, setOpen] = useState(false)

  const removeRole = (id) => {
    onChange(value.filter((role) => role[codigo] !== id))
  }

  const addRoles = (roles) => {
    const map = new Map()

    ;[...value, ...roles].forEach((r) => map.set(r[codigo], r))

    onChange([...map.values()])
    setOpen(false)
  }

  return (
    <>
      <div className="border rounded-xl p-5 bg-white">
        <div className="flex justify-between mb-4">
          <h3 className="font-semibold text-lg">Total Asignados: ({value.length})</h3>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="
              flex
              items-center
              gap-2
              px-3
              text-lg
              py-2
              bg-violet-600
              text-white
              rounded-lg
            "
          >
            <Plus size={25} />
            Agregar
          </button>
        </div>

        <div className="flex flex-wrap gap-2 ">
          {value?.map((role, index) => (
            <RoleChip
              key={index}
              role={role}
              onRemove={removeRole}
              codigo={codigo}
              nombre={nombre}
              descripcion={descripcion}
            />
          ))}
        </div>
      </div>

      <RoleSelectorModal
        open={open}
        roles={options}
        assignedRoles={value || []}
        onClose={() => setOpen(false)}
        onSave={addRoles}
        title={drawerConfig?.title}
        subtitle={drawerConfig?.subtitle}
        codigo={codigo}
        nombre={nombre}
        descripcion={descripcion}
      />
    </>
  )
}

export default AssignmentModal
