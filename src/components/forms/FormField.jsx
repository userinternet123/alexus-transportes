import { useNavigate } from 'react-router-dom'
import { useEstadoOpciones } from '../../hooks/useOpcionesRemotas'
import { Search, X } from 'lucide-react'
import { applyMask } from '../../utils/masks.js'
import Button from '../ui/Button.jsx'
import AssignmentModal from '../forms/permission/AssignmentModal.jsx'
import UserInfoCard from '../ui/InfoCard.jsx'
import StatusBadge from '../lists/StatusBadge.jsx'

function TextInput({
  id,
  type,
  placeholder,
  Icon,
  value,
  onChange,
  onKeyDown,
  mask,
  required,
  readOnly,
  error,
}) {
  function handleChange(e) {
    const masked = applyMask(e.target.value, mask)
    onChange(masked)
  }

  return (
    <div className="relative w-full">
      {Icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <Icon />
        </div>
      )}

      <input
        id={id}
        type={type}
        value={value}
        onChange={handleChange}
        required={required}
        onKeyDown={onKeyDown}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onFocus={
          mask === 'money'
            ? (e) => {
                if (!e.target.value) onChange('Q. ')
              }
            : undefined
        }

        onBlur={
          mask === 'money'
            ? (e) => {
                if (e.target.value === 'Q. ') onChange('')
              }
            : undefined
        }
        className={` border rounded-lg py-2 w-full min-w-0 hover:shadow-lg
        ${Icon ? 'pl-10' : 'pl-3'}
        ${value ? 'pr-10' : 'pr-3'}
        ${
          readOnly
            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
            : 'focus:outline-none focus:ring-2 focus:ring-green-500'
        } ${error ? 'border-red-500 bg-red-50' : ''}`}
      />

      {value && !readOnly && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
  /*
  return (
    <div className="">
      {Icon && <Icon />}
      <input
        id={id}
        type={type}
        value={value}
        onChange={handleChange}
        required={required}
        readOnly={readOnly}
        onFocus={
          mask === 'money'
            ? (e) => {
                if (!e.target.value) {
                  onChange('Q. ')
                }
              }
            : undefined
        }
        onBlur={
          mask === 'money'
            ? (e) => {
                if (e.target.value === 'Q. ') {
                  onChange('')
                }
              }
            : undefined
        }
        placeholder={placeholder}
        className={`border rounded-lg px-3 py-2 w-full min-w-0 hover:shadow-lg ${
          readOnly
            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
            : 'focus:outline-none focus:ring-2 focus:ring-green-500'
        }`}
      />
    </div>
  )*/
}
const icons = { search: Search }

function FormField({
  field,
  id,
  label,
  type = 'text',
  value,
  icon: Icon = null,
  onChange,
  onClick,
  required,
  className,
  onKeyDown,
  options = [],
  readOnly = false,
  mask,
  placeholder,
  error,
}) {
  // Listas con "optionsUrl" en el JSON: las opciones vienen del servidor (sucursales, puestos, categorías…)
  const { opciones: remotas, cargando: cargandoOpciones, error: errorOpciones } = useEstadoOpciones(field?.optionsUrl)
  const lista = field?.optionsUrl ? remotas : options
  // Opciones fijas del JSON ({ value, label }) o del servidor (columnaDb: { codigo, nombre }, con rutas como «empleado.nombres»)
  const columnas = field?.columnaDb ?? { codigo: 'value', nombre: 'label' }
  const leer = (o, ruta) => String(ruta ?? '').split('.').reduce((x, k) => x?.[k], o)
  const textoOpcion = (o) => (field?.optionsUrl ? `${leer(o, columnas.codigo)} - ${leer(o, columnas.nombre)}` : leer(o, columnas.nombre))
  const irA = useNavigate()
  // Lista del servidor que llegó vacía: se explica qué falta crear (el JSON del campo puede traer "vacio": { mensaje, enlace, ruta })
  const listaVacia = type === 'select' && Boolean(field?.optionsUrl) && !cargandoOpciones && !errorOpciones && remotas.length === 0
  const listaConError = type === 'select' && Boolean(field?.optionsUrl) && !cargandoOpciones && errorOpciones
  return (
    <div className="flex flex-col gap-1 w-full min-w-0">
      {/* LABEL */}

      {type === 'button' ? (
        <div key={`-${id}`}></div>
      ) : (
        <div className="flex flex-row">
          <label htmlFor={id} className="font-medium text-gray-700">
            {label}
          </label>
          <div className="text-red-600 font-bold">{required ? '*' : ''}</div>
        </div>
      )}

      {/* INPUTS DINÁMICOS */}
      {(type === 'money' || type === 'text' || type === 'number' || type === 'date') && (
        <TextInput
          id={id}
          type={type}
          value={type === 'date' && typeof value === 'string' ? value.slice(0, 10) : value || ''}
          placeholder={placeholder}
          icon={Icon}
          onChange={onChange}
          onKeyDown={onKeyDown}
          mask={mask}
          required={required}
          readOnly={readOnly}
          error={error}
        />
      )}
      {/*type === 'radio' && (
        <div className="grid grid-cols-3 gap-3">
          <button className="border-2 border-green-600 bg-green-50 rounded-xl p-4">DPI/CUI</button>
        </div>
      )*/}
      {type === 'radio' && (
        <div className="flex flex-col gap-2 border p-4 w-full min-w-0 hover:shadow-md">
          {options.map((opt, i) => (
            <label key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={id} // MISMO NAME
                value={opt.value}
                checked={value === opt.value || (value === undefined && opt.default === true)}
                onChange={(e) => onChange(e.target.value)}
                //onChange={onChange}
                readOnly={readOnly}
                className="w-4 h-4 hover:shadow-lg"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}

      {/*type === 'select' && (
        <select
          id={id}
          value={value}
          //onChange={(e) => onChange(e.target.value)}
          onChange={(e) => {
            const selectedIndex = e.target.selectedIndex
            // -1 porque tienes "Seleccione..."
            onChange(e.target.value, selectedIndex)
          }}
          disabled={readOnly}
          required={required}
          error={error}
          className={`border rounded-lg px-3 py-2 ${readOnly ? 'bg-gray-100 text-gray-500' : ''}`}
        >
          <option value="">Seleccione...</option>
          {options?.map((opt, i) => (
            <option key={i} value={opt?.value || opt}>
              {opt?.label || opt}
            </option>
          ))}
        </select>
      )}*/}
      {type === 'select' && (
        <select
          id={id}
          value={value ?? ''}
          onChange={(e) => {
            const selected = lista.find((opt) =>
              typeof opt === 'object'
                ? String(leer(opt, columnas.codigo)) === e.target.value
                : opt === e.target.value
            )

            if (typeof selected === 'object') {
              onChange(leer(selected, columnas.codigo), leer(selected, columnas.nombre))
            } else {
              onChange(selected, selected)
            }
          }}
          disabled={readOnly}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`border rounded-lg px-3 py-2 ${readOnly ? 'bg-gray-100 text-gray-500' : ''} ${error ? 'border-red-500 bg-red-50' : ''}`}
        >
          <option value="">Seleccione...</option>

          {lista?.map((opt, i) => (
            //console.log('opt', opt, 'field', field),
            <option key={i} value={typeof opt === 'object' ? leer(opt, columnas.codigo) : opt}>
              {typeof opt === 'object' ? textoOpcion(opt) : opt}
            </option>
          ))}
        </select>
      )}
      {error && type !== 'button' && (
        <p id={`${id}-error`} className="text-sm text-red-700">{error}</p>
      )}
      {listaConError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudo cargar la lista. Revise su conexión o sus permisos e intente de nuevo.</p>
      )}
      {listaVacia && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {field?.vacio?.mensaje ?? 'Todavía no hay opciones para elegir.'}
          {field?.vacio?.ruta && (
            <>{' '}<button type="button" onClick={() => irA(field.vacio.ruta)} className="font-medium underline">{field.vacio.enlace ?? 'Crear'}</button></>
          )}
        </p>
      )}
      {type === 'checkbox' && (
        <label className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={value || false}
            onChange={(e) => onChange(e.target.checked)}
            disabled={readOnly}
            className="w-4 h-4"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <span className="text-sm text-gray-600">{label}</span>
        </label>
      )}
      {type === 'badge' && <StatusBadge key={`${label}-${id}`} status={value} />}

      {type === 'space' && <div key={`${label}-${id}`}></div>}
      {type === 'separator' && <hr key={`${label}-${id}`} />}
      {type === 'button' && (
        <Button icon={Icon} tamano="extralarge" key={`${label}-${id}`} onClick={onClick}>
          {label}
        </Button>
      )}
      {type === 'assignment' && (
        <AssignmentModal
          key={`${label}-${id}`}
          value={value}
          label={label}
          options={options}
          onChange={onChange}
          drawerConfig={field?.selectorDrawer}
        />
      )}
      {type === 'infoCard' && value && (
        <UserInfoCard
          title={value?.nombre}
          subtitle={value?.usuario}
          detail={value?.email}
          status={
            value?.nombre !== null && value?.nombre !== undefined
              ? value?.estado || 'ACTIVO'
              : undefined
          }
          icon={Icon}
        />
      )}
    </div>
  )
}
/*title,
  subtitle,
  detail,
  status,
  Icon,
  iconBg = 'bg-emerald-100',
  iconColor = 'text-emerald-600', */

export default FormField
/*

import { User, Mail, BadgeCheck } from 'lucide-react'



function UserInfoCard({ value }) {
  //if (!value) return null



  return (
    <div
      className="
        bg-white
        rounded-xl
        border
        hover:shadow-lg
        p-5
        bg-[#f5f3f985]
      "
    >
      <div className="flex gap-4">
        <div
          className="
            w-16 h-16
            rounded-full
            bg-violet-600
            flex
            items-center
            justify-center
          "
        >
          <User className="text-white" size={30} />
        </div>



        <div className="flex-1">
          <h3 className="font-bold text-lg">{value?.usuario || 'USR0001'}</h3>



          <p>{value?.nombre || 'Peter'}</p>



          <div className="flex gap-2 mt-2">
            <Mail size={16} />



            <span>{value?.correo || 'temp@gmail.com.gt'}</span>
            <div className="mt-3">
              <span
                className="
                px-3 py-1
                rounded-full
                bg-green-100
                text-green-700
                text-xs
                font-medium
              "
              >
                {value?.estado || 'activo'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}



export default UserInfoCard

*/
