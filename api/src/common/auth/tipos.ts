/** Payload del access token (JWT). Mantenerlo pequeño. */
export interface UsuarioToken {
  sub: number;
  username: string;
  nombre: string;
  roles: string[];
  /** Códigos de permiso. '*' = superadministrador. */
  permisos: string[];
  /** Sucursales a las que tiene acceso. */
  sucursales: number[];
  /** Debe cambiar contraseña antes de operar. */
  cp?: boolean;
}

/** Contexto de la petición, disponible vía @Contexto(). */
export interface Ctx {
  usuario: UsuarioToken;
  /** Sucursal activa (header X-Sucursal-Id). */
  sucursalId: number | null;
  ip?: string;
  requestId?: string;
}

export const tienePermiso = (u: UsuarioToken, permiso: string): boolean =>
  u.permisos.includes('*') || u.permisos.includes(permiso);
