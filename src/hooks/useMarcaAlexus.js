import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

/**
 * ¿Se muestra "SPVI by ALEXUS" en lo que ve el cliente final (documentos, tickets, pantalla completa)?
 * No, si el negocio tiene la licencia "sinmarca" (servicio mensual). En Login e Inicio la firma es fija.
 */
export function useMarcaAlexus() {
  const { user } = useContext(AuthContext) ?? {}
  return !(user?.usuario?.licencia?.modulos ?? []).includes('sinmarca')
}
