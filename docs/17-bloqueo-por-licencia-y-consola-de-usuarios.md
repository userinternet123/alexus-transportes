# Bloqueo por licencia y consola de usuarios

## 1. Sin licencia no se trabaja (ni siquiera con el plan Básico)
| Situación | Qué pasa |
|---|---|
| Equipo recién instalado, sin licencia | **Bloqueado**: solo se puede iniciar sesión y activar la licencia |
| Licencia alterada o de otro sistema | **Bloqueado** |
| Licencia vigente | Funciona con los módulos de su plan |
| Vencida hace 7 días o menos | **Sigue funcionando completa** y avisa cuántos días le quedan (para no detener una tienda de golpe) |
| Vencida hace más de 7 días | **Bloqueado** hasta renovarla |

- **Bloqueo en el servidor:** se aplica en el API, para cualquier pantalla o petición. Responde `403 LICENCIA_REQUERIDA`.
- **Rutas que siguen abiertas:** iniciar sesión, renovar la sesión, salir, ver el perfil, cambiar la contraseña, y ver y activar la licencia.
- **En el portal:** solo se ve la pantalla «Active la licencia de SPVI». Si la licencia vence a mitad del trabajo, esa pantalla aparece sola.
- **Al activarla:** el sistema pide iniciar sesión de nuevo, para cargar los módulos de la licencia nueva.
- **Modo abierto:** el modo de desarrollo (sin llave pública) no cambia. Por eso el empaquetador **no deja compilar** sin llave pública.

## 2. Primer inicio en una tienda
1. Instale `SPVI-Setup-x.y.z.exe`. El asistente pide la **contraseña de `admin`**.
2. Abra SPVI y entre con **`admin`** y esa contraseña.
3. Aparece **«Active la licencia de SPVI»**: pegue el texto del `.lic` o elija el archivo y pulse **Activar licencia**.
4. Inicie sesión de nuevo. Ya puede configurar el negocio y crear usuarios en **Administración › Usuarios**.

## 3. Consola de usuarios (sin entrar al sistema)
Sirve para el primer inicio, para crear usuarios rápido o si el administrador perdió su contraseña. **Funciona aunque no haya licencia.**

**En la tienda (Windows):** menú **Inicio › SPVI › Consola de usuarios**. Pide permisos de administrador de Windows, porque la configuración con la clave de la base solo la leen los administradores. Opciones:
1. **Crear un usuario:** primero muestra los roles y las sucursales; luego pide usuario, nombre completo, rol o roles y sucursal.
2. **Restablecer la contraseña:** genera una temporal, quita el bloqueo por intentos fallidos y cierra las sesiones abiertas del usuario.
3. **Desactivar un usuario:** no permite desactivar al único administrador.
4. **Activar un usuario.**
5. **Ver usuarios.**

**En desarrollo (Termux):**
```bash
cd ~/migration/portalAdmin/api
npm run usuarios -- roles
npm run usuarios -- crear --usuario juan.perez --nombre "Juan Pérez" --rol GERENTE --sucursal 1
npm run usuarios -- clave --usuario admin
npm run usuarios -- listar
```

**Reglas:**
- Las mismas del sistema: contraseña de **10 caracteres o más, con letras y números**, sin contener el nombre de usuario.
- La contraseña temporal tiene 12 caracteres y evita los confundibles (0/O, 1/l/I) para dictarla sin errores. **Se muestra una sola vez**, y el usuario **debe cambiarla al entrar**.
- Todo queda en la bitácora con origen «consola».

## Aplicar
```bash
cd ~/migration/portalAdmin/api && unzip -o /sdcard/Download/api-acumulado-lotes-16-al-25.zip && npm run typecheck
cd ~/migration/src && unzip -o /sdcard/Download/frontend-acumulado-lotes-16-al-29.zip && node verificar-imports.mjs
```
No hay migración nueva. En Termux, mientras la llave pública siga vacía, el sistema está en modo abierto y **no** se bloquea. Para probar el bloqueo:
1. Genere las llaves (guía 16).
2. Reinicie el API: verá la pantalla de activación.
3. Emítase una licencia de desarrollo y actívela.
