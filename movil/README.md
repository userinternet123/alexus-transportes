# ALEXUS Piloto (Android)

App del piloto de ALEXUS Transportes. Hecha para usarse en el camino, **con o sin señal**.

## Qué hace

| Pantalla | Para qué |
|---|---|
| **Mi día** | El viaje de ahora (cliente, ruta, cabezal, remolque, anticipo), lo que falta antes de salir (inspección vigente, licencia, casos que impiden salir) y botones grandes: *Salí*, *En cola*, *Llegué*, *Entregué*, *Reportar incidente*. |
| **Reportar** | Evento del viaje con hora, ubicación GPS, odómetro opcional y hasta 10 fotos. *Salí* inicia el viaje en el sistema. Un incidente abre un caso. |
| **Inspección** | Lista de revisión pre viaje (cabezal y remolque). Lo que falla pide foto; un punto crítico deja la unidad fuera de servicio y abre un caso con prioridad. |
| **Combustible** | Carga con odómetro, galones, precio, estación y foto del vale. Si el odómetro salta más de lo que rinde un tanque, queda *por revisar* y el piloto confirma. |
| **Gasto** | Peaje, comida, hospedaje, reparación… con foto del recibo y si lo pagó el piloto (entra a su liquidación). |
| **Problema** | Reporta una falla del cabezal o remolque con prioridad (urgente, alta, moderada, baja) y fotos. |
| **Envíos** | Todo lo reportado y en qué quedó: *por enviar*, *enviado* o *por revisar* con el motivo, para corregir, reintentar o descartar. |
| **Más** | Cuenta, sede, servidor, sincronizar, cerrar sesión, borrar los datos del teléfono. |

## Cómo funciona sin señal

- Cada reporte se guarda primero en el teléfono, **cifrado** (XChaCha20-Poly1305, llave en el almacén seguro de Android), con la **hora en que ocurrió** y un identificador único.
- Las fotos se toman solo con la cámara (no se leen ni se guardan en la galería), se reducen a 1600 px y se guardan cifradas hasta que se suben; luego se borran.
- Cada 45 s y al volver a la app se intenta enviar, en el orden en que se capturó (la inspección antes de la salida). Primero se suben las fotos una por una y se recuerda cuáles ya subieron; si la señal se cae a medias, sigue donde se quedó.
- Si el servidor rechaza un reporte (por ejemplo, odómetro dudoso), queda *por revisar* con el motivo; lo demás sigue enviándose.
- Un reenvío nunca duplica: el servidor reconoce el identificador y responde «ya recibido».
- «Mi día» y la lista de inspección quedan guardados para consultarse sin señal.
- Al cerrar sesión se borra lo de consulta; lo que falta por enviar se conserva cifrado y se envía cuando el mismo usuario vuelve a entrar.

## Conexión con el servidor

El piloto ingresa la dirección del servidor de la empresa: por **Tailscale** (`http://100.x.x.x:4000`) o por **HTTPS**. La app avisa si la dirección no es segura ni de Tailscale.

El usuario del piloto se crea en el portal (**Administración → Usuarios**) con el rol **Piloto** y su campo **Empleado** apuntando al empleado que es ese piloto. Sin ese vínculo la app no sabe qué viajes son suyos.

## Desarrollo

```bash
npm install
npm run typecheck
npm test                       # lógica de la cola, cifrado y almacén (SQLite real de Node)
npx expo start                 # Expo Go / emulador
npx expo export --platform android   # valida que el paquete compile
```

Datos de prueba: `DEMO_CLAVE_PILOTOS='...' npm run db:demo` (en `api/`) crea los usuarios `piloto1`…`piloto5` vinculados a los pilotos de ejemplo.

## Generar el APK

```bash
npx eas build -p android --profile apk          # APK para instalar directo
npx eas build -p android --profile produccion   # AAB para Play Store
```

Paquete: `com.alexusgt.transportes.piloto`. Permisos: cámara y ubicación mientras se usa la app (sin ubicación en segundo plano, sin micrófono, sin galería). Copia de seguridad de Android desactivada.
