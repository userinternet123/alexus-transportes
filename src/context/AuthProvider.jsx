// Archivo heredado: el proveedor real vive en AuthContext.jsx (el que usa main.jsx).
// Se re-exporta para que no existan dos versiones distintas de la sesión.
export { AuthContext, AuthProvider } from './AuthContext'
