import { useState } from 'react'
import FormField from '../forms/FormField'
import ResumenErrores from './ResumenErrores'
import { aplanar, enfocarCampo, normalizarValores, validarCampos } from '../../utils/validacion'
import Button from '../ui/Button'
import { Save, Trash, Trash2, Undo } from 'lucide-react'

function CrudModal({
  config = [],
  initialValues = {},
  onConfirm,
  onCancel,
  readOnly = false,
  action,
}) {
  // Las fechas llegan del servidor como «2026-11-04T00:00:00.000Z»: el formulario trabaja con «2026-11-04»
  const [form, setForm] = useState(() => {
    const v = { ...initialValues }
    for (const f of config.flatMap((sec) => sec.fields ?? [])) {
      if (f.type === 'date' && typeof v[f.name] === 'string') { v[f.name] = v[f.name].slice(0, 10) }
    }
    return v
  })
  const [errors, setErrors] = useState({})
  const [lista, setLista] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState(null)

  const handleChange = (name, value) => {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))

    setLista((prev) => (prev.some((e) => e.name === name) ? prev.filter((e) => e.name !== name) : prev))
    if (errors[name]) {
      setErrors((prev) => {
        const copy = { ...prev }
        delete copy[name]
        return copy
      })
    }
  }

  // Crear y editar revisan TODO antes de enviar (obligatorios, formatos, números); eliminar y consultar no
  const revisa = action === 'create' || action === 'edit'
  const etiquetaDe = (nombre) => aplanar(config).find((c) => c.name === nombre)?.label || nombre

  const handleSubmit = async () => {
    let datos = form
    setAviso(null)
    if (revisa) {
      const r = validarCampos(config, form)
      setErrors(r.errores)
      setLista(r.lista)
      if (!r.ok) {
        enfocarCampo(r.primero)
        return
      }
      datos = normalizarValores(config, form) // DPI sin espacios, NIT sin guiones, textos sin espacios sobrantes
    }
    setEnviando(true)
    try {
      // El listado responde { ok: false, errores, mensaje } si el servidor rechazó algo: el formulario sigue abierto con lo escrito
      const res = await onConfirm?.(action, datos)
      if (res && res.ok === false) {
        const errs = res.errores ?? {}
        setErrors(errs)
        setLista(Object.entries(errs).map(([name, mensaje]) => ({ name, label: etiquetaDe(name), mensaje })))
        setAviso(Object.keys(errs).length ? null : res.mensaje ?? null)
        enfocarCampo(Object.keys(errs)[0])
      }
    } finally {
      setEnviando(false)
    }
  }

  const FIELD_SIZES = {
    supersmall: 'col-span-3',
    small: 'col-span-4',
    medium: 'col-span-6',
    large: 'col-span-9',
    full: 'col-span-12',
  }
  /*
  label={action === 'edit' ? 'Guardar' : 'Eliminar'}
          icon={action === 'edit' ? Save : Trash}
          variant={action === 'edit' ? 'primary' : 'danger'} */
  const ACTIONS = {
    create: {
      label: 'Crear registro',
      icon: Save,
      variantBtn: 'primary',
      visible: true,
    },
    edit: {
      label: 'Guardar Cambios',
      icon: Save,
      variantBtn: 'primary',
      visible: true,
    },
    delete: {
      label: 'Eliminar',
      icon: Trash2,
      variantBtn: 'danger',
      visible: true,
    },
    cancel: {
      label: 'Cancelar',
      icon: Trash2,
      variantBtn: 'danger',
      visible: true,
    },
    view: {
      label: 'Regresar',
      icon: Undo,
      variantBtn: 'primary',
    },
  }

  const getSizeClass = (field) => {
    if (field.size) {
      return FIELD_SIZES[field.size]
    }

    return FIELD_SIZES.medium
  }

  return (
    <div className="space-y-6">
      <ResumenErrores lista={lista} />
      {aviso && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{aviso}</p>}
      {config.map((section) => (
        <div key={section.subgrupo} className="border rounded-xl p-4">
          <h3 className={`font-semibold ${section.description ? 'mb-1' : 'mb-4'}`}>{section.subgrupo}</h3>
          {section.description && <p className="mb-4 text-sm text-gray-500">{section.description}</p>}

          <div className="grid grid-cols-12 gap-4">
            {section.fields.map((field) => (
              <div key={field.name} className={getSizeClass(field)}>
                <FormField
                  id={field.name}
                  field={field}
                  label={field.label}
                  placeholder={field?.placeholder}
                  type={field.type}
                  value={form[field.name] || field.defaultValue}
                  error={errors[field.name]}
                  required={field.required}
                  className={field.className}
                  readOnly={field.readOnly || readOnly}
                  options={field.options || []}
                  onChange={(value) => handleChange(field.name, value)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end gap-3">
        <Button label="Regresar" variant="secondary" onClick={onCancel} />
        {ACTIONS[action]?.visible && (
          <Button
            label={ACTIONS[action]?.label}
            icon={ACTIONS[action]?.icon}
            variant={ACTIONS[action]?.variantBtn}
            loading={enviando}
            onClick={handleSubmit}
          />
        )}
      </div>
    </div>
  )
}

export default CrudModal
