import { useMemo, useState } from 'react'

import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'

import ConfigurableTable from './ConfigurableTable'
import SearchBar from './SearchBar'
import FilterBar from './FilterBar'
import TablePagination from './TablePagination'
import Button from '../ui/Button'
import { Eye, Edit, Trash2, Users, Shield, Plus, Ban, LucideTrash2 } from 'lucide-react'

const ICONS = {
  eye: Eye,
  edit: Edit,
  trash: Trash2,
  users: Users,
  shield: Shield,
  plus: Plus,
  cancel: LucideTrash2,
}

function ListBase({ config, data, onAction, showSearch = false, showPagination = false }) {
  // data acepta objeto y array
  const [globalFilter, setGlobalFilter] = useState('')

  const [filters, setFilters] = useState({})

  const columns = useMemo(() => {
    const baseColumns = config.columns || []
    if (!config.actions?.length) {
      return baseColumns
    }
    return [
      ...config.columns,

      {
        id: 'acciones',
        header: 'Acciones',

        cell: ({ row }) => {
          const rowData = row.original

          //const actionConfig = config.actions.find((a) => a.estado.includes(rowData.estado))
          const actions = config.actions || []
          const estadoString =
            typeof rowData[actions[0].columnaDb] === 'boolean'
              ? rowData[actions[0].columnaDb]
                ? 'ACTIVO'
                : 'INACTIVO'
              : rowData[actions[0].columnaDb]

          const actionConfig = actions.find((a) => a.estado.includes(estadoString))

          /* if (!actionConfig) return null
          const Icon = ICONS[actionConfig.icon]

          return (
            <div className="">
              <Button
                icon={Icon}
                variant={actionConfig.action === 'view' ? 'secondary' : 'primary'}
                onClick={() => onAction(actionConfig, rowData)}
              >
                {actionConfig.label}
              </Button>
            </div>
          )*/
          // se aceptan mas opciones de botones
          //console.log('trae actionConfig', actionConfig)
          if (!actionConfig?.options?.length) return null

          return (
            <div className="flex gap-2">
              {actionConfig.options.map((option) => {
                const Icon = ICONS[option.icon]

                return (
                  <Button
                    key={option.action}
                    icon={Icon}
                    variant={option.variant}
                    tamano={option.tamano}
                    onClick={() => onAction(option.action, rowData)}
                  >
                    {option.label}
                  </Button>
                )
              })}
            </div>
          )
        },
      },
    ]
  }, [config, onAction])
  const filteredData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : data ? [data] : []
    return (safeData || []).filter((row) => {
      const search = globalFilter.toLowerCase()

      const matchesSearch = Object.values(row).join(' ').toLowerCase().includes(search)

      const matchesFilters = Object.entries(filters).every(
        ([key, value]) => !value || row[key] === value
      )

      return matchesSearch && matchesFilters
    })
  }, [data, globalFilter, filters])

  const table = useReactTable({
    data: filteredData,
    columns,

    getCoreRowModel: getCoreRowModel(),

    getFilteredRowModel: getFilteredRowModel(),

    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center flex-wrap gap-4">
        {showSearch && (
          <div className="flex-1 min-w-[300px]">
            <SearchBar
              value={globalFilter}
              onChange={setGlobalFilter}
              placeholder={config.searchPlaceHolder}
            />
          </div>
        )}

        {/* <FilterBar
          filters={config.filters || []}
          values={filters}
          onChange={(name, value) =>
            setFilters((prev) => ({
              ...prev,
              value,
            }))
          }
        />*/}
      </div>

      <ConfigurableTable table={table} />

      {showPagination && <TablePagination table={table} />}
    </div>
  )
}

export default ListBase
