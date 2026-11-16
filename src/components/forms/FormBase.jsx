import { useOutletContext, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'

import FormField from './FormField'
import FormGroupField from './FormGroupField'
import { formActions } from './FormActions'
import Button from '../ui/Button'
import ConfirmModal from '../ui/CustomModal'
import CustomModal from '../ui/CustomModal'
import StepProgress from '../ui/StepProgress'
import CrudModal from '../forms/CrudModal'
import { showToast } from '../../utils/showToast'
import { applyMask } from '../../utils/masks'
import ResumenErrores from './ResumenErrores'
import { aplanar, enfocarCampo, erroresDelServidor, normalizarValores, validarCampos } from '../../utils/validacion'
import LoadingOverlay from '../../components/ui/LoadingOverlay'
import {
  AlertTriangle,
  Building2,
  MapPin,
  Phone,
  Save,
  Search,
  Send,
  Trash2,
  User,
  Shield,
  UserPlus,
  FileInput,
  Wallet,
  ClipboardList,
  UserCog,
  Link,
  Monitor,
} from 'lucide-react'
import ConfigurableTable from '../lists/ConfigurableTable'
import ListBase from '../lists/ListBase'
//import { isAxiosError } from "axios";

function FormBase({ modalMode = false, initialData = null, externalConfig = null }) {
  const outlet = modalMode ? {} : useOutletContext()
  const config = externalConfig || outlet?.formConfig || location.state?.formConfig
  const data = initialData ?? outlet?.formData
  const modalConfig = outlet?.modalConfig
  const refreshModule = outlet?.refreshModule
  const location = useLocation()

  //const { type, formConfig, formData } = useOutletContext()

  //const formConfig = location.state?.formConfig || null;
  const savedForm = JSON.parse(sessionStorage.getItem('selectedForm') || '{}')

  const state = location.state || savedForm

  const button = state.button || []
  const name = state.name || ''
  const menuLabel = state.menuLabel || 'configure'
  const submenuLabel = state.submenuLabel || 'configure'

  const formName = `formData_${name}`
  const buttonsName = `buttons_${name}`
  //const config = location.state?.formConfig || formConfig
  const [errors, setErrors] = useState({})
  const [resumen, setResumen] = useState([]) // lista de lo que falta o está mal, con enlace a cada campo
  const [focusField, setFocusField] = useState(null)
  const [loading, setLoading] = useState(false)
  const [buttons, setButtons] = useState([])
  useEffect(() => {
    const savedButtons = localStorage.getItem(buttonsName)

    setButtons(savedButtons ? JSON.parse(savedButtons) : button || [])
  }, [buttonsName, button])

  const [editModal, setEditModal] = useState({
    open: false,
    row: null,
  })

  const icons = {
    building: Building2,
    location: MapPin,
    phone: Phone,
    money: Wallet,
    search: Search,
    send: Send,
    save: Save,
    usercog: UserCog,
    link: Link,
    monitor: Monitor,
    trash: Trash2,
    user: UserPlus,
    shield: Shield,
    fileInput: FileInput,
    clipboardList: ClipboardList,
  }

  // devolvemos los campos
  // validamos los campos que son requeridos por botton
  // si el boton , validamos solo los campos visibles
  // si el boton no tiene campos a validar, validamos todos los campos del form
  const executeAction = (btn, formData = form) => {
    setLoading(true)

    formActions(btn, formData, setForm)
      .then((response) => {
        if (response?.data?.idSolicitud && response?.data?.mensaje) {
          showToast({
            type: 'warning',
            message: response.data.mensaje,
          })
        }
        if (response?.data?.datosDesactualizados) {
          showToast({
            type: 'warning',
            message:
              'Tiene datos desactualizados. Puede enviar la solicitud aunque tenga datos desactualizados.',
          })
          // ya no se impide si tiene datos desactualizados
          //setButtons((prev) =>
          //  prev.map((btn) => (btn.name === 'btnEnviar' ? { ...btn, disabled: true } : btn))
          //)
          /*setModal({
            open: true,
            config: {
              label: 'Cliente con datos Desactualizados',
              confirmMessage: 'Puede enviar la solicitud aunque tenga datos desactualizados.',
              variant: 'warning',
              confirmLabel: 'Continuar',
            },
          })*/
        }

        if (response.type) {
          showToast({
            type: response.type,
            message: response.message || btn.msgOk,
          })
        }
        if (response.type === 'error') {
          const det = erroresDelServidor(response.data)
          const nombres = Object.keys(det)
          if (nombres.length) {
            const campos = aplanar(config.section)
            setErrors(det)
            setResumen(nombres.map((n) => ({ name: n, label: campos.find((c) => c.name === n)?.label || n, mensaje: det[n] })))
            enfocarCampo(nombres[0])
          }
        }
      })
      .catch((error) => {
        showToast({
          type: 'error',
          message: error.message || btn.msgFaild,
        })
      })
      .finally(() => {
        setLoading(false)
        if (btn.refreshPage) {
          //window.location.reload()
          //window.alert('Refreshing page...')
          refreshModule()
        }
      })
  }

  const shouldShowField = (field, formValues) => {
    if (!field.visibleWhen) {
      return true
    }

    const currentValue = formValues[field.visibleWhen.name]
    // si no hay valor, mostrar el valor por defecto si está configurado
    // en el campo visibleWhen -> showDefault
    // tambien debe estar configurado en el campo principal default = true
    if (!currentValue) {
      return field.visibleWhen.showDefault === true
    }

    return currentValue === field.visibleWhen.value
  }

  const setDefaultValue = () => {
    const savedForm = localStorage.getItem(formName)
    const defaultValues = {} // agregamos valor por defaul a la data
    config.section.forEach((group) => {
      group.fields.forEach((field) => {
        // ignorar botones
        if (field.type === 'button') {
          return
        }
        if (field.visibleWhen && field.visibleWhen.showDefault === true) {
          defaultValues[field.visibleWhen.value] = ''
        }
      })
    })

    return savedForm
      ? { ...defaultValues, ...JSON.parse(savedForm) }
      : { ...defaultValues, ...(data || {}) }
  }
  const [form, setForm] = useState(() => {
    return setDefaultValue()
  })

  const [modal, setModal] = useState({
    open: false,
    config: null,
  })

  const parseMoney = (value) => {
    if (!value) return 0

    return (
      parseFloat(
        value
          .replace(/^Q\.\s?/, '') // quitar Q.
          .replace(/,/g, '') // quitar comas
      ) || 0
    )
  }
  const evaluateFormula = (formula, form) => {
    try {
      let expression = formula

      // reemplazar variables por valores reales
      Object.keys(form).forEach((key) => {
        const value = parseMoney(form[key])
        const regex = new RegExp(`\\b${key}\\b`, 'g')

        expression = expression.replace(regex, value)
      })

      //  validar que solo tenga números y operadores
      if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
        console.warn('Expresión inválida:', expression)
        return 0
      }

      //  evaluar de forma segura
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${expression})`)()

      return isNaN(result) ? 0 : result
    } catch (err) {
      console.error('Error evaluando fórmula:', err)
      return 0
    }
  }

  const calculateTotals = (form, config) => {
    const newForm = { ...form }

    config.forEach((section) => {
      // si el campo inicia "TOTAL"
      const subgrupo = section.subgrupo

      const totalField = section.fields.find(
        (f) => f.name.toLowerCase().includes(subgrupo.toLowerCase()) && f.name.startsWith('total')
      )

      if (!totalField) return

      let total = 0

      section.fields.forEach((field) => {
        if (field.name === totalField.name) return

        const value = parseMoney(form[field.name])
        total += value
      })

      //  usar tu máscara existente
      newForm[totalField.name] = applyMask(String(total), 'money')

      // Aplicar fórmula si existe queda por encima de total
      section.fields.forEach((field) => {
        if (!field.formula) return

        //  calcular fórmula
        const result = evaluateFormula(field.formula, form)

        //  aplicar máscara money
        newForm[field.name] = applyMask(String(result), 'money')
      })
    })

    return newForm
  }
  useEffect(() => {
    if (!data) {
      return
    }
    const temp = { ...data, ...setDefaultValue() }
    setForm(temp)
  }, [data])

  useEffect(() => {
    localStorage.setItem(formName, JSON.stringify(form))
  }, [form, formName])

  /*useEffect(() => {
    if (focusField) {
      document.getElementById(focusField)?.focus();
    }
  }, [focusField]);*/

  useEffect(() => {
    if (!focusField) {
      return
    }

    const el = document.getElementById(focusField)

    if (el) {
      el.focus()

      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [focusField])

  const validateField = (name, value) => {
    setResumen((prev) => (prev.some((e) => e.name === name) ? prev.filter((e) => e.name !== name) : prev))
    if (errors[name]) {
      setErrors((prev) => {
        const copy = { ...prev }
        delete copy[name]
        return copy
      })
    }
    let updatedForm = {
      ...form,
      [name]: value,
    }
    // limpiar valores en tipo documento
    /*if (name === 'tipoDocumento') {
      if (value === 'dpi') {
        updatedForm.mis = undefined
        updatedForm.pasaporte = undefined
      } else if (value === 'mis') {
        updatedForm.dpi = undefined
        updatedForm.pasaporte = undefined
      } else {
        updatedForm.dpi = undefined
        updatedForm.mis = undefined
      }
    }*/

    //  recalcular totales
    updatedForm = calculateTotals(updatedForm, config.section)
    setForm(updatedForm)
    return updatedForm
  }
  const handleChange = (subgrupo, name, value, key) => {
    const updatedForm = validateField(name, value)

    //si name inicia con btn, se busca el boton y se ejecuta handleAction
    if (name && name.startsWith('btn')) {
      const btn = buttons.find((b) => b.name === name)
      if (btn) {
        handleAction(btn, updatedForm)
      }
    }
  }
  const onKeyDown = (e, keyDown) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      validateField()
      const btn = buttons.find((b) => b.name === keyDown)
      if (btn) {
        handleAction(btn, form)
      }
    }
  }
  const handleAction = (btn, formData = form) => {
    try {
      setLoading(true)

      // buscar boton en buttons
      const btnFromButton = buttons.find((b) => b.name === btn.name)
      if (!btnFromButton) {
        setLoading(false)
        return
      }
      if (btnFromButton) {
        // Todo botón que guarda (crear, editar, enviar) revisa ANTES de enviar: obligatorios (aunque el campo nunca se
        // haya tocado), formatos y números. Lo que está mal se marca en el campo y el cursor va al primero.
        const guarda = Boolean(btnFromButton.requiredFields) || ['create', 'edit', 'submit', 'save'].includes(btnFromButton.action)
        if (guarda) {
          const r = validarCampos(config.section, formData, { visible: shouldShowField, obligatorios: btnFromButton.requiredFields ?? [] })
          setErrors(r.errores)
          setResumen(r.lista)
          if (!r.ok) {
            enfocarCampo(r.primero)
            showToast({ type: 'error', message: r.lista.length === 1 ? `Revise: ${r.lista[0].label}` : `Revise los ${r.lista.length} datos marcados en rojo` })
            setLoading(false)
            return
          }
          formData = normalizarValores(config.section, formData) // DPI sin espacios, NIT sin guiones, textos sin espacios sobrantes
        }
        // Si requiere confirmación
        if (btn.confirm) {
          setModal({
            open: true,
            config: btnFromButton,
            //formData,
          })
          setLoading(false)
          return
        }

        //const response = formActions(btnFromButton, form, setForm)
        executeAction(btnFromButton, formData)
        /* formActions(btnFromButton, form, setForm)
            .then((response) => {
              console.log('Respuesta:', response)
              if (response?.data?.datosDesactualizados) {
                setButtons((prev) =>
                  prev.map((btn) => (btn.name === 'btnEnviar' ? { ...btn, disabled: true } : btn))
                )
                setModal({
                  open: true,
                  config: {
                    label: 'Cliente con datos Desactualizados',
                    confirmMessage:
                      'Sólo podrá enviar la solicitud hasta que actualice Datos en Sistema COBIS',
                    variant: 'warning',
                    confirmLabel: 'Continuar',
                  },
                })
              }

              showToast({
                type: response.type,
                message: response.message || `${btnFromButton.msgOk} `,
              })
            })
            .catch((error) => {
              console.log('mesnaje del handleAction', error)
              setLoading(false)

              showToast({
                type: 'error',
                message: error.message || 'Error inesperado',
              })
            })
            .finally(() => {
              setLoading(false)
            })
*/
        /*
            confirmLabel={modal.config?.label}
            title={modal.config?.label || 'Confirmar acción'}
            message={modal.config?.confirmMessage || '¿Seguro que deseas continuar?'}
            variant={modal.config?.variant || 'warning'}
            */

        return
      } else {
        return
      }
    } catch (error) {
      setLoading(false)
      showToast({ type: 'error', message: error.message || 'Error inesperado' })
    }
    //await formActions(btn, form, setForm);
  }

  const handleConfirmModal = async (action, data) => {
    setEditModal({
      open: false,
      row: null,
    })
    // opciones para llamar a la API según la acción
    switch (action) {
      case 'create':
        showToast({
          type: 'success',
          message: 'Solicitud creada exitosamente',
        })
        break
      case 'edit':
        showToast({
          type: 'success',
          message: 'Registro actualizado exitosamente',
        })
        break
      case 'delete':
        showToast({
          type: 'success',
          message: 'Registro eliminado exitosamente',
        })
        break
      default:
        break
    }
  }
  const handleTableAction = (action, row) => {
    switch (action) {
      case 'create':
        // crear un row vacío
        const newRow = {}
        formConfig.columns.forEach((col) => {
          newRow[col.field] = ''
        })
        setEditModal({
          title: 'Ingrese información Actualizada',
          variant: 'success',
          open: true,
          action: 'create',
          row: newRow,
        })
        break
      case 'edit':
        setEditModal({
          title: 'Ingrese información Actualizada',
          variant: 'info',
          open: true,
          action: 'edit',
          row,
        })
        break

      case 'delete':
        setEditModal({
          title: '¿Confirma Eliminar el registro?',
          variant: 'danger',
          open: true,
          action: 'delete',
          row,
        })
        break
      case 'view':
        setEditModal({
          title: 'Detalle del registro',
          variant: 'success',
          open: true,
          action: 'view',
          row,
        })

        break

      default:
        break
    }
  }
  const handleSubmit = async (e) => {
    e.preventDefault()

    const submitBtn = buttons.find((b) => b.action === 'submit')

    if (submitBtn) {
      handleAction(submitBtn)
    }

    //toast.success('Operación realizada correctamente ')
    // localStorage.removeItem("formData");

    //toast.error('Ocurrió un error')
  }
  /*
  sm:  640px    móviles grandes
  md:  768px    tablets
  lg:  1024px   laptops
  xl:  1280px   desktops
  2xl: 1536px   pantallas grandes
  */
  const FIELD_SIZES = {
    supersmall: 'col-span-3 md:col-span-6 lg:col-span-3 xl:col-span-3 2xl:col-span-2',
    small: 'col-span-3 md:col-span-6 lg:col-span-4 xl:col-span-4 2xl:col-span-3',
    medium: 'col-span-3 md:col-span-6 lg:col-span-6 xl:col-span-5 2xl:col-span-4',
    large: 'col-span-3 md:col-span-6 lg:col-span-9 xl:col-span-6 2xl:col-span-6',
    full: 'col-span-3 md:col-span-6 lg:col-span-9 xl:col-span-12 2xl:col-span-12',
  }
  const getSizeClass = (field) => {
    if (field.size) return FIELD_SIZES[field.size]

    // AUTO DETECCIÓN (INTELIGENTE)
    switch (field.type) {
      case 'textarea':
        return FIELD_SIZES.full

      case 'select':
        return FIELD_SIZES.supersmall

      case 'date':
        return FIELD_SIZES.supersmall

      default:
        return FIELD_SIZES.medium
    }
  }

  return (
    <div className="">
      {/* BREADCRUMB */}
      <div className="text-md text-gray-500 mb-5">
        {menuLabel} &gt; <span className="text-purple-600 font-medium">{submenuLabel}</span>
      </div>

      <div className="flex flex-col justify-center items-start mb-10 gap-3">
        {/* TÍTULOS */}
        <h1 className="text-3xl font-semibold text-slate-800">{config.module}</h1>
        <h2 className="text-xl mb-4 text-slate-500">{config.title}</h2>
      </div>
      {config.msg !== '' && (
        <div className="flex px-5 py-3 mb-2 gap-5 rounded-md shadow-sm bg-amber-50 border border-amber-300 text-orange-800">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <p>{config.msg}</p>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off" noValidate>
        <ResumenErrores lista={resumen} />
        {config.section.map((section, i) => (
          <FormGroupField
            key={i}
            type={section?.type}
            title={section.subgrupo}
            icon={icons[section.icon]}
            description={section.description}
            defaultOpen={section.defaultOpen}
            className={section.className}
          >
            {section.type === 'table' ? (
              <ListBase
                config={{
                  columns: section.columns,
                  actions: section.actions || [],
                  filters: section.filters || [],
                }}
                data={form[section.dataField] ? form[section.dataField] : []}
                onAction={handleTableAction}
                showSearch={section.showSearch}
                showPagination={section.showPagination}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 p-4 items-end md:grid-cols-6 lg:grid-cols-9 xl:grid-cols-12 gap-4">
                {section.fields.map(
                  (field) =>
                    shouldShowField(field, form) && (
                      <div key={field.name} className={getSizeClass(field) + ' min-w-0'}>
                        <FormField
                          field={field}
                          id={field.name}
                          label={field.label}
                          icon={icons[field.icon]}
                          type={field.type}
                          value={form[field.name]}
                          onKeyDown={(e) => onKeyDown(e, field.keyDown)}
                          onChange={(value, key) =>
                            handleChange(section.subgrupo, field.name, value, key)
                          }
                          onClick={field.type === 'button' ? () => handleAction(field) : undefined}
                          error={errors[field.name]}
                          readOnly={field.readOnly}
                          required={field.required}
                          //el map debe ser del tipo
                          /* [
                            "Administrador",
                            "Agente de agencia",
                            "Jefe de agencia",
                            "Regional",
                            "Macro regional"
                          ]*/
                          options={
                            field.options ||
                            (typeof field.columnaDb === 'string'
                              ? form[field.entity]?.map((item) => item[field.columnaDb])
                              : form[field.entity])
                          }
                          mask={field.mask}
                          placeholder={field.placeholder}
                        />
                      </div>
                    )
                )}
              </div>
            )}
          </FormGroupField>
        ))}
        {/* <div className=" flex gap-7 items-center justify-start px-10"> */}
        <div className=" flex gap-7 items-center justify-start px-10">
          {buttons &&
            buttons?.map((btn, i) => {
              return (
                btn.show && (
                  <Button
                    key={i}
                    label={btn.label}
                    type={btn.type || 'button'}
                    icon={icons[btn.icon]}
                    disabled={btn.disabled}
                    variant={btn.variant === 'success' ? 'primary' : btn.variant}
                    onClick={btn.type === 'button' ? () => handleAction(btn) : undefined}
                    tamano={btn.tamano || 'large'}
                  />
                )
              )
            })}
        </div>
      </form>
      {loading && (
        <LoadingOverlay> Espera Por Favor mientras consultamos la información</LoadingOverlay>
      )}
      <ConfirmModal
        show={modal.open}
        confirmLabel={modal.config?.confirmLable}
        title={modal.config?.label || 'Confirmar acción'}
        message={modal.config?.confirmMessage || '¿Seguro que deseas continuar?'}
        variant={modal.config?.variant || 'warning'}
        onClose={() => {
          setModal({ open: false, config: null })
        }}
        onConfirm={() => {
          //formActions(modal.config, form, setForm)
          setModal({ open: false, config: null })
          executeAction(modal.config)
        }}
      />
      <CustomModal show={editModal.open} title={editModal.title} variant={editModal.variant}>
        <CrudModal
          config={modalConfig}
          initialValues={editModal.row}
          onConfirm={handleConfirmModal}
          action={editModal.action}
          readOnly={['delete', 'view'].includes(editModal.action) ? true : false}
          onCancel={() => setEditModal({ open: false, row: null })}
        />
      </CustomModal>
    </div>
  )
}

export default FormBase
