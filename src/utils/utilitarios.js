import { showToast } from "../utils/showToast"
import { getControlledError } from "../utils/errorMessage"
import { urlAuditoria} from "./constantes"


export async function modal(status){
    const errores = getControlledError(status);
  switch(status){
    case 200:
        showToast({ type: "success", message: `${errores.message}` });
      break
    case 400:
        showToast({ type: "warning", message: `${errores.message}` });
      break
    case 401:
        showToast({ type: "warning", message: `${errores.message}` });
      break
    case 404:
        showToast({ type: "warning", message: `${errores.message}` });
      break
    case 500: 
        showToast({ type: "error", message: `${errores.message}` });
      break
    default:
        showToast({ type: "error", message: `${errores.message}` });
  }
}

export async function auditoria(data){
      try {
        const action = data.action;
        const urlApiAuditoria = `${urlAuditoria}/${data.action}`
        const payload = await fetch(urlApiAuditoria, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: data,
        })
        await modal(payload.status);
      } catch (error) {
        await modal(payload.status);
      }
}