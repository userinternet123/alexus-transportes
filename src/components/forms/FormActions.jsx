//import { toast } from "react-hot-toast";
import { showToast } from '../../utils/showToast' /* comentar ya que estas funciones se utilizan desde el import modal, adaptarlas cuando se necesiten */
import { encryptUrlParam } from '../../utils/crypto'
import { getControlledError } from '../../utils/errorMessage'
import { modal } from '../../utils/utilitarios'
import { encryptData, decryptData } from '../../utils/crypto'
import { leerToken } from '../../services/api'
// import { catalogos } from '../../utils/constantes'
import Button from '../ui/Button'
import { requestApi, saveApplication, searchClient } from '../../services/consulta'

export const formActions = (btn, form, setForm) => {
  let { url, method, entity, entitySend, action } = btn
  const id = form[entitySend]
  const tipo = form.tipoDocumento ?? 'dpi'
  const numIdentificacion = String(form[tipo]).replace(/\s+/g, '')
  let bodySend = form[entitySend]
  //const encriptacion = await encryptUrlParam(numIdentificacion)

  //  confirmación opcional
  /*if (confirm) {
      const ok = window.confirm("¿Seguro que deseas continuar?");
      if (!ok) return;
    }*/
  // si url es un array, se ejecuta la acción correspondiente
  const genericCallApi = (url, form, body, setForm, method, entity) => {
    let bodySend = body
    if (Array.isArray(url)) {
      /* {
        url: '/usuarios/:id/ad',
        method: 'GET',
        entitySend: 'codigoUsuario',
        entity: 'usuario',
      }, */
      const requests = url.map((item) => {
        let endpoint = item.url
        bodySend = form[item.entitySend]

        const id = form[item.entitySend]

        if (endpoint.includes(':id')) {
          endpoint = endpoint.replace(':id', id)
        }

        return requestApi({
          endpoint,
          method: item.method,
          body: bodySend,
        }).then((response) => ({
          ...response,
          entity: item.entity,
        }))
      })

      return Promise.all(requests).then((responses) => {
        let updatedForm = { ...form }

        responses.forEach((response) => {
          const entity = response.entity

          if (entity) {
            updatedForm[entity] = response?.data?.data || response?.data
          }
        })

        setForm(updatedForm)

        return {
          type: 'success',
          data: responses,
        }
      })
    }

    // lógica actual para una sola URL
    if (url?.includes(':id')) {
      url = url.replace(':id', id)
    }

    return requestApi({ endpoint: url, method, body: bodySend }).then((response) => {
      if (response.status >= 200 && response.status <= 299) {
        if (entity) {
          let updatedForm = {
            ...form,
            [entity]: response?.data.data || response?.data,
          }
          setForm(updatedForm)
        }
        return {
          type: 'success',
          message: response?.error || response?.message,
          data: response?.data,
        }
      }
      return {
        type: 'error',
        message: response?.data?.error,
        data: response?.data,
      }
    })
  }
  switch (action) {
    case 'save':
    case 'submit':
      return saveApplication(btn.estado, form, btn)
        .then((response) => {
          if (response.status >= 200 && response.status <= 299) {
            const result = {
              type: 'success',
              message: response?.data?.message,
              data: response?.data,
            }
            setForm({})
            return result
          }
          const result = {
            type: 'error',
            message: response?.data?.error,
            data: response?.data,
          }

          return result
        })
        .catch((e) => {
          console.error(e)
          throw e
        })

    case 'search':
      return searchClient(btn, tipo, numIdentificacion).then((response) => {
        if (response.status >= 200 && response.status <= 299) {
          setForm(response.data)
          return {
            type: 'success',
            message: response?.error || response?.message,
            data: response?.data,
          }
        }
        return {
          type: 'error',
          message: response?.data?.error,
          data: response?.data,
        }
      })

    case 'searchFormRol':
      if (url?.includes(':id')) {
        url = url.replace(':id', id)
      }

      return requestApi({ endpoint: url, method }).then((response) => {
        if (response.status >= 200 && response.status <= 299) {
          if (entity) {
            let updatedForm = {
              ...form,
              [entity]: response?.data.data,
            }
            setForm(updatedForm)
          }
          return {
            type: 'success',
            message: response?.error || response?.message,
            data: response?.data,
          }
        }
        return {
          type: 'error',
          message: response?.data?.error,
          data: response?.data,
        }
      })

    case 'delete':
      //toast.success(`Acción ${action} ejecutada`);
      showToast({ type: 'success', message: `Acción ${action} ejecutada` })
      break

    case 'reset':
      setForm({})
      //setButtons(button || [])

      //localStorage.removeItem(formName)
      //localStorage.removeItem()
      //console.log('entro en reset')
      //toast.success("Formulario limpio");

      return Promise.resolve({
        type: 'success',
        message: 'Se limpió el formulario',
      })

    //peticiones GET,DELTE con :id en la url
    //  peticiones post, put enviando un body {campo: valor}
    case 'saveFormRol':
      /*bodySend = {idFormulario}
        y debo agregar idRol
        agregar a bodySend los campos requeridos */
      //validar que idRol esté presente en form
      // si no retornar error
      const missingFields = ['btnSearchFormRol'].filter((field) => !form[field])
      if (missingFields.length > 0) {
        return Promise.reject({
          type: 'error',
          message: `Faltan los siguientes campos: ${missingFields.join(', ')}`,
        })
      }
      // por cada item de bodySend agregar idRol

      bodySend =
        Array.isArray(bodySend) && bodySend.length > 0
          ? bodySend.map((item) => ({
              ...item,
              idRol: form.btnSearchFormRol,
            }))
          : [{ idRol: form.btnSearchFormRol, idFormulario: 0 }]
      return genericCallApi(url, form, bodySend, setForm, method, entity)

    case 'genericAction':
      return genericCallApi(url, form, bodySend, setForm, method, entity)
    case 'saveUserRol':
      /* bodySend = {
          "usuario":"24389",
          "roles":
          [
              {
                  "rol":"GESTOR",
                  "fechaInicio":"2026-08-16",
                  "fechaFin":"2026-12-31"
              },
              {
                  "rol":"REGIONAL",
                  "fechaInicio":"2026-08-10",
                  "fechaFin":null
              }
          ]
      }*/
      bodySend = form.codigoUsuario
        ? {
            usuario: form.codigoUsuario,
            roles: (form.userrol || []).map((rol) => ({
              rol: rol.idRol,
              fechaInicio: form.fechaInicioExpiracion || '9999-01-01',
              fechaFin: form.fechaFinExpiracion || '9999-12-31',
            })),
          }
        : null

      return genericCallApi(url, form, bodySend, setForm, method, entity)
    default:
      console.warn('Acción no definida:', action)
      return Promise.resolve({})
  }
}
