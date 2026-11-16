# SPVI móvil (Android)

App nativa con **React Native + Expo** para consultar y operar SPVI desde el celular: resumen del día, existencias con **escáner de código de barras por cámara**, ventas del día, estado de la caja y cambio de sucursal. Usa el mismo API, los mismos usuarios y los mismos permisos y plan contratado que el portal.

## 1. Crear el proyecto (una sola vez)

En una PC con Node.js 22 (Windows, Linux o Mac; también funciona en Termux):

```bash
npx create-expo-app@latest spvi-movil --template blank-typescript
cd spvi-movil
npx expo install expo-router expo-secure-store expo-camera expo-build-properties expo-linking expo-constants expo-status-bar react-native-safe-area-context react-native-screens @expo/vector-icons
npm install axios
```
`npx expo install` elige las versiones compatibles con la versión de Expo instalada.

Copie sobre el proyecto las carpetas `app/` y `src/` y los archivos `app.json` y `eas.json` de esta carpeta. Borre el `App.tsx` que trae la plantilla. En `package.json` cambie la entrada principal:
```json
"main": "expo-router/entry"
```

## 2. Probar en el teléfono (sin compilar)

1. Instale **Expo Go** desde Google Play.
2. En la PC ejecute `npx expo start` y escanee el código QR con Expo Go.
3. En la app, escriba la dirección del servidor y toque **Probar conexión**:
   - En la tienda: `http://IP-del-servidor:8080` (el teléfono en el mismo Wi-Fi).
   - Desde fuera: `http://100.x.x.x:8080`, con Tailscale activo en el teléfono (ver `docs/09-acceso-remoto-tailscale.md`).

## 3. Generar el APK

Con el servicio de compilación de Expo (no requiere Android Studio):
```bash
npm install -g eas-cli
eas login                 # cuenta gratuita en expo.dev
eas build -p android --profile apk
```
Al terminar, EAS entrega un enlace para descargar `SPVI.apk`. Instálelo en los teléfonos: Android pedirá permitir "instalar apps de origen desconocido".

Para Google Play use `--profile produccion`, que genera un `.aab`.

**Cada versión nueva:** suba `version` y `android.versionCode` en `app.json` y repita `eas build`.

## Seguridad

- Los tokens se guardan en el almacén cifrado del teléfono (Android Keystore), no en texto plano.
- La app permite `http` porque los servidores de tienda no tienen certificado. **Úsela solo en la red de la tienda o a través de Tailscale**, que cifra toda la conexión. Nunca publique el puerto 8080 directamente en internet.
- Si un usuario debe cambiar su contraseña, la app le pide hacerlo primero en el portal web.

## Siguientes pasos sugeridos
- Vender desde el teléfono (POS móvil con escáner).
- Recibir mercadería escaneando la factura del proveedor.
- Notificaciones: caja con diferencia, existencia baja, licencia por vencer.
