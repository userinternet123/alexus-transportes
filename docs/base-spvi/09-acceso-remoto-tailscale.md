# Acceso remoto con Tailscale

Permite abrir SPVI desde el celular o desde la casa del dueño **sin abrir puertos en el router** y con toda la conexión cifrada. Tailscale crea una red privada entre los equipos autorizados; nadie fuera de ella puede ver el servidor.

```
Celular (Tailscale) ──cifrado──► Servidor de la tienda (Tailscale) ──► SPVI :8080
```

## 1. Crear la red (una sola vez)
1. Cree una cuenta gratuita en [tailscale.com](https://tailscale.com). El plan personal admite hasta 3 usuarios y 100 dispositivos.
2. En el panel, vaya a **Settings › Keys** y genere una **Auth key**. Para un servidor, márquela como *Reusable* y *Pre-approved*.

## 2. En el servidor de la tienda
- **Al instalar SPVI:** marque "Instalar Tailscale" y pegue la clave.
- **Después:** *Inicio › SPVI › Configurar acceso remoto (Tailscale)*.

El instalador deja la dirección de acceso en `C:\ProgramData\SPVI\acceso-remoto.txt`, por ejemplo `http://100.101.102.103:8080`. También agrega una regla de firewall que permite el puerto de SPVI **solo desde la red de Tailscale**.

## 3. En cada celular
1. Instale **Tailscale** desde Google Play o App Store e inicie sesión con la misma cuenta, o invite al usuario desde el panel.
2. Active la conexión (el interruptor de Tailscale).
3. Abra la app **SPVI** o el navegador con la dirección `100.x.x.x:8080`.

## Recomendaciones
- **Desactive la expiración de clave** del servidor en el panel (*Machines › … › Disable key expiry*), para que no se desconecte cada 6 meses.
- Use las **ACL** de Tailscale para que los celulares solo vean al servidor y no entre sí.
- Quite del panel los celulares perdidos o de personas que ya no trabajan en la empresa. Desactive también su usuario en SPVI.
- **No publique el puerto 8080 en el router.** Tailscale lo hace innecesario.
