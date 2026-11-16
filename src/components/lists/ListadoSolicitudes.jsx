// pages/ListBasePage.jsx

import { invalidarOpciones } from '../../hooks/useOpcionesRemotas'
import { useOutletContext, useLocation } from 'react-router-dom'
import ListBase from '../lists/ListBase'
import { AlertTriangle, Pencil, Eye, Plus } from 'lucide-react'
import { useState, useEffect } from 'react'
import CustomModal from '../ui/CustomModal'
import Button from '../ui/Button'
import { erroresDelServidor } from '../../utils/validacion'
import CrudModal from '../forms/CrudModal'
import { showToast } from '../../utils/showToast'
import { requestApi } from '../../services/consulta'
import LoadingOverlay from '../ui/LoadingOverlay'
import { modal } from '../../utils/utilitarios'
import { useNavigate } from 'react-router-dom'
import { MENU_ITEMS } from '../../components/layout/sidebar/config/sidebarMenu'
import { navigateToSubmenu } from '../../utils/NavigationData'

function ListBasePage() {
  const [editModal, setEditModal] = useState({
    open: false,
    row: null,
  })
  const [loading, setLoading] = useState(false)

  const { formConfig, formData, modalConfig, refreshModule } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()

  //const formConfig = location.state?.formConfig || null;

  const savedForm = JSON.parse(sessionStorage.getItem('selectedForm') || '{}')
  const state = location.state || savedForm

  const buttons = state.button || []
  const name = state.name || ''
  const msg = state.msg || ''
  const menuLabel = state.menuLabel || 'configure'
  const submenuLabel = state.submenuLabel || 'configure'

  const solicitudes = formData

  /*useEffect(() => {
    setSolicitudes(formData)
  }, [formData])*/
  const redirect = (submenuName, data) => {
    const found = MENU_ITEMS.menu
      .flatMap((menu) =>
        (menu.submenu || []).map((submenu) => ({
          menu,
          submenu,
        }))
      )
      .find((item) => item.submenu.name === submenuName)

    if (!found) {
      return
    }

    navigateToSubmenu(navigate, found.menu, found.submenu, data)
  }
  const handleConfirmModal = async (action, data) => {
    const button = buttons.find((btn) => btn.action === action)

    if (!button) {
      setEditModal({
        open: false,
        row: null,
      })
      /*showToast({
        type: 'error',
        message: 'No se pudo determinar la acción a realizar',
      })*/
      return
    }

    let { url, method, msgOk, msgFaild } = button

    // Reemplazar :id dinámicamente
    const idField = Object.keys(data).find((key) => key.startsWith('id'))

    if (url?.includes(':id') && idField) {
      url = url.replace(':id', parseInt(data[idField]))
    }

    const dataToSend = { ...data }

    // Convertir estados a boolean
    Object.keys(dataToSend).forEach((key) => {
      if (key.startsWith('estado')) {
        dataToSend[key] = dataToSend[key] === 'ACTIVO'
      }
    })

    // El formulario sigue abierto hasta que el servidor acepte: si lo rechaza, la persona no pierde lo que escribió
    let resultado = { ok: true }
    try {
      setLoading(true)

      const response = await requestApi({
        endpoint: url,
        method,
        body: dataToSend,
      })

      const { status, data: responseData } = response

      if (status >= 200 && status < 300) {
        invalidarOpciones() // p. ej. una sucursal nueva debe aparecer ya en las listas
        setEditModal({
          open: false,
          row: null,
        })
        showToast({
          type: 'success',
          message: msgOk || 'Operación realizada exitosamente',
        })
      } else {
        const mensaje = responseData?.message || responseData?.error || msgFaild
        showToast({
          type: 'error',
          message: mensaje,
          data: responseData,
        })
        resultado = { ok: false, mensaje, errores: erroresDelServidor(responseData) }
      }
    } catch (error) {
      console.error(error)
      resultado = { ok: false, mensaje: 'No se pudo completar la operación. Intente de nuevo.' }

      showToast({
        type: 'error',
        message: `Error al ${
          action === 'create'
            ? 'crear'
            : action === 'edit'
              ? 'actualizar'
              : action === 'delete'
                ? 'eliminar'
                : 'procesar'
        } el registro`,
      })
    } finally {
      setLoading(false)
      if (button.refreshPage) {
        refreshModule()
      }
    }
    return resultado
  }
  const handleAction = (action, row) => {
    /*
    <CrudModal
      config={formConfig}
      initialValues={editModal.row}
      onSave={handleSaveModal}
      onCancel={() => setEditModal({ open: false, row: null })}
    />
    */
    const btn = buttons.find((btn) => btn.action === action)
    switch (action) {
      case 'cancel':
        // buscarmos el btn en buttons
        if (btn.confirm) {
          setEditModal({
            title: '¿Confirma Cancelar la solicitud?',
            variant: 'danger',
            DataReadOnly: ['cancel'],
            open: true,
            action: 'cancel',
            row: row,
          })
        } else {
          //handleConfirmModal('cancel', row)
          console.log('no tiene confirm')
        }

        break
      case 'create':
        // crear un row vacío
        const newRow = {}
        modalConfig.forEach((subgroup) => {
          subgroup.fields.forEach((field) => {
            newRow[field.name] = field.defaultValue ?? (field.type === 'checkbox' ? false : '')
          })
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
        if (btn.redirectTo) {
          redirect(btn.redirectTo, row)
        } else {
          setEditModal({
            title: `Ingrese información Actualizada`,
            variant: 'info',
            open: true,
            action: 'edit',
            row,
          })
        }
        break

      case 'delete':
        setEditModal({
          title: '¿Confirma Eliminar el registro?',
          variant: 'danger',
          DataReadOnly: ['delete'],
          open: true,
          action: 'delete',
          row,
        })
        break
      case 'view':
        setEditModal({
          title: 'Detalle del registro',
          variant: 'success',
          DataReadOnly: ['view'],
          open: true,
          action: 'view',
          row,
        })

        break

      default:
        break
    }
  }

  return (
    <div className="">
      {/* La ruta y el título ya los muestra la barra superior */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          {formConfig?.title && <p className="text-sm text-gray-500">{formConfig.title}</p>}
        </div>
        {formConfig?.headerBtn && (
          <Button
            className={`flex flex-row ${formConfig.headerBtn.className}`}
            onClick={() => {
              handleAction(formConfig.headerBtn.action, null)
            }}
          >
            <Plus size={`${formConfig.headerBtn.size ?? 30}`} />
            {`${formConfig.headerBtn.label ?? `Agregar ${submenuLabel}`} `}
          </Button>
        )}
      </div>
      {msg !== '' && (
        <div className="mb-3 flex gap-3 rounded-tarjeta border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <p>{formConfig?.msg}</p>
        </div>
      )}
      {/*<div className="bg-card border border-border rounded-xl p-6 shadow-sm mb-6 mt-6">
        <div className="flex gap-3 flex-wrap mb-4">
          {['Incompleta', 'Actualizar', 'Completa', 'Enviada'].map((e) => (
            <span
              key={e}
              className={`px-2.5 py-1 rounded-full flex items-center gap-1.5 ${estadoConfig[e].color}`}
            >
              {e === 'Enviada' ? <Eye className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
              {e === 'Actualizar' ? 'Actualizar Datos' : e} -{' '}
              {e === 'Enviada' ? 'ver formulario' : 'editar formulario'}
            </span>
          ))}
        </div>
      </div>*/}

      <ListBase
        config={formConfig}
        data={solicitudes}
        onAction={handleAction}
        showSearch={formConfig.showSearch}
        showPagination={formConfig.showPagination}
      />
      {loading && (
        <LoadingOverlay> Espera Por Favor mientras consultamos la información</LoadingOverlay>
      )}
      <CustomModal show={editModal.open} title={editModal.title} variant={editModal.variant}>
        <CrudModal
          config={modalConfig}
          initialValues={editModal.row}
          onConfirm={handleConfirmModal}
          action={editModal.action}
          readOnly={editModal?.DataReadOnly?.includes(editModal.action) ? true : false}
          onCancel={() => setEditModal({ open: false, row: null })}
        />
      </CustomModal>
    </div>
  )
}

export default ListBasePage
