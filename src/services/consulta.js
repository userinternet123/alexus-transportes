import api, { guardarToken, borrarToken, leerToken } from './api'
import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'
import { getUserInfo } from '../services/authService'

// Se re-exporta para que el resto del portal importe todo desde authService
// y no necesite conocer api.js.
export { leerToken }
const base = import.meta.env.VITE_API_URL

/**
 * Inicia sesión: manda usuario+contraseña a la API, que hace el bind contra AD.
 * Devuelve { usuario, nombre, email, rol } y guarda el token internamente.
 * Lanza Error con mensaje amigable si las credenciales son inválidas.
 *
 */
export async function requestApi({ baseURL, endpoint = '', method = 'GET', params = null, body = null, headers = {} }) {
  // Antes era un fetch propio que NO enviaba la sucursal de trabajo (X-Sucursal-Id): por eso fallaba crear cajas y
  // bodegas. Ahora pasa por el cliente del portal (token, sucursal y renovación de sesión) y conserva la misma
  // respuesta { status, data } sin lanzar errores, como esperan las pantallas antiguas.
  try {
    const r = await api.request({ url: endpoint, method, params: params ?? undefined, data: body && method !== 'GET' ? body : undefined, headers, ...(baseURL ? { baseURL } : {}) })
    return { status: r.status, data: r.data ?? null }
  } catch (e) {
    if (e.response) return { status: e.response.status, data: e.response.data ?? null }
    return { status: 0, data: { message: 'No se pudo conectar con el servidor. ¿Está encendido el API?' } }
  }
}

export async function listadoDeSolicitudes(usuario) {
  try {
    const token = leerToken()
    const user = getUserInfo()
    //http://10.160.110.61:4000/api/v1/agentes/usr043942/ventas?page=1&limit=20
    //http://10.160.110.61:4000/api/v1/agencia/415/region/45/macroregion/occidente/usuario/usr043860/ventas?page=1&limit=20
    const { data } = await api.get(
      `/api/v1/agencia/${user?.usuario?.oficina}/region/${user?.usuario?.region}/macroregion/${user?.usuario?.macro}/usuario/${user?.usuario?.usuario}/ventas`,
      {
        //baseURL: base,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          page: 1,
          limit: 0,
        },
      }
    )

    console.log('datos', data)
    return {
      data,
    }
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error('Código o contraseña incorrectos. Intente nuevamente')
    }
    if (err.response?.status === 502) {
      throw new Error('No se pudo contactar el directorio. Intente más tarde.')
    }
    throw new Error('Error de conexión con el servidor.')
  }
}
function recorrerObjeto(obj, resultado) {
  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Si es un objeto, recorrer sus propiedades
      recorrerObjeto(value, resultado)
    } else {
      resultado[key] = value
    }
  })
}
export function searchClient(btn, tipo, numIdentificacion) {
  const { url, method = 'POST' } = btn
  const token = leerToken()
  //console.log('url de searchClient', `${url}/${tipo}/${numIdentificacion}`)
  //console.log('token', token)
  return fetch(`${base}${url}/${tipo}/${numIdentificacion}`, {
    method: method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
    .then((response) => {
      // no solo se recibe un 200 como éxito
      return response.json().then((data) => {
        console.log('datos desde el api', data)
        return {
          status: response.status,
          data,
        }
      })
      /*if (!response.ok) {
            console.log('error desde formAction' + JSON.stringify(response))
            throw new Error('Error de la API desde el fromAction')
          }

          return response.json()*/
    })
    .then(({ status, data }) => {
      const resultado = {}

      Object.entries(data).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          resultado[key] = resultado[key] || {}
          Object.assign(resultado[key], value)
          // recuperar los campos de ese objecto y validar que si es objeto recorra los campos
          recorrerObjeto(value, resultado)
        } else if (Array.isArray(value)) {
          resultado[key] = value
          Object.entries(value).forEach(([k, v]) => {
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
              resultado[k] = resultado[k] || {}
              Object.assign(resultado[k], v)
            } else {
              resultado[k] = v
            }
          })
        } else {
          resultado[key] = value
        }
      })

      return { status, data: resultado }
    })
    .catch((error) => {
      console.log('catch de form actions' + error)
      throw error
    })
}

export function saveApplication(estado, form, btn) {
  const formEnviar = {
    ...form,
    tipo: form.tipoDocumento ?? 'dpi',
    valor: String(form[form.tipoDocumento ?? 'dpi']).replace(/\s+/g, ''),
    estado,
    telefonoActual: String(form.telefonoActual).replace(/-/g, '').trim(),
    ingresoServiciosProfesionales: Number(
      String(form.ingresoServiciosProfesionales).replace('Q.', '').replace(/,/g, '').trim()
    ),
    limiteRecomendado: Number(
      String(form.limiteRecomendado).replace('Q.', '').replace(/,/g, '').trim()
    ),
    otrasFuentes: Number(String(form.otrasFuentes).replace('Q.', '').replace(/,/g, '').trim()),
  }

  const { url, method = 'POST' } = btn
  const token = leerToken()

  return fetch(`${base}${url}`, {
    method: method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(formEnviar),
  })
    .then((response) => {
      return response.json().then((data) => {
        return {
          status: response.status,
          data,
        }
      })
      /*if (!response.ok) {
            console.log('error desde formAction' + JSON.stringify(response))
            throw new Error('Error de la API desde el fromAction')
          }

          return response.json()*/
    })
    .then(({ status, data }) => {
      return {
        status: status,
        data: data,
      }
    })
    .catch((error) => {
      throw error
    })
}
