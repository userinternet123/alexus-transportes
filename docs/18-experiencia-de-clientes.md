# Experiencia de clientes: uso, opiniones y perfil (para ALEXUS)

## Qué se recolecta y cómo
| Qué | Quién lo da | Cuándo |
|---|---|---|
| **Uso del sistema**: pantallas visitadas y funciones usadas (vender, cotizar, enviar por WhatsApp…), por rol y tipo de equipo | Automático, **solo si el administrador lo aceptó** | Se suma por día y viaja después de cada latido (cada 6 h) |
| **Recomendación** (0 a 10) con comentario | Quien administra | Cada 90 días; se puede posponer 14 días |
| **«¿Le sirvió esta pantalla?»** 👍/👎 con comentario | Cualquier usuario | Al pie de Salud financiera, Temporadas y Mis análisis |
| **Sugerencias** (con nombre solo si la persona lo autoriza) | Cualquier usuario | Ayuda y soporte |
| **Perfil del negocio**: giro, empleados, cómo conoció SPVI, qué quiere lograr | Quien administra | Opcional, después de decidir sobre el uso |

**Nunca** se envían montos, precios, ventas, nombres de clientes o productos, ni quién hizo cada cosa. Tres capas lo garantizan:
1. El portal solo acepta nombres de pantalla o función: un texto con nombres o montos ni siquiera sale del navegador.
2. El servidor de la tienda vuelve a filtrar y normaliza las rutas: `/home/ventas/123?cliente=Ana` queda como `/home/ventas/:id`.
3. Central valida el contenido recibido y rechaza lo que no cumpla.

## Cifrado de extremo a extremo
- **Llave de Central:** Central crea una llave RSA-4096 una sola vez y la guarda en su base, así que viaja con sus respaldos. La privada nunca sale de Central.
- **Envío desde la tienda:** el paquete se comprime y se cifra con AES-256-GCM, usando una llave nueva por envío, protegida a su vez con la llave pública de Central. Ni Cloudflare ni nadie en el camino puede leerlo o alterarlo.
- **Llave fijada:** la tienda **fija** la llave de Central la primera vez. Si después recibe otra distinta, **no envía nada** y lo registra, porque podría ser alguien haciéndose pasar por Central. Si ALEXUS la cambió a propósito, en la tienda se borra el parámetro `central.llave_datos`.
- **Envío confirmado:** lo enviado se marca así solo cuando Central confirma que lo recibió.
- **Si una tienda deja de compartir:** su uso pendiente se borra en la tienda, y Central **borra lo recibido** de ella.

## En el panel de SPVI Central › «Experiencia de clientes»
- **Recomendación (NPS, de −100 a 100):** cuántos recomiendan SPVI, cuántos son neutros y cuántos no lo recomiendan.
- **Tiendas:** si comparten su uso, cuánto usan SPVI, cuándo fue el último uso, su recomendación y su giro. Las que comparten pero **no han usado** el sistema en el período se marcan «Sin uso»: riesgo de que cancelen.
- **Funciones y pantallas más usadas**, y dispositivos (computadora o celular).
- **Lo que quieren lograr**, y los giros de los negocios.
- **Opiniones recientes:** sugerencias y comentarios, con la tienda y el contacto si se autorizó.

## Aplicar
**Tienda (API):**
1. Aplique `api-acumulado-lotes-16-al-27.zip`.
2. Cree la migración sin aplicarla: `npx --no-install prisma migrate dev --create-only --name experiencia`. Debe crear solo `uso_diario` y `opiniones`. **Ningún DROP.**
3. Aplíquela: `npx --no-install prisma migrate dev`.
4. `npm run typecheck`.

**Portal:** aplique `frontend-acumulado-lotes-16-al-31.zip`.

**Central:** aplique `spvi-central.zip` y reconstruya:
```
docker compose -f docker-compose.local.yml up -d --build
```
Central crea sus tablas nuevas al arrancar y genera su llave en la primera petición.

## Lo que NO está verificado
- **El intercambio con las aplicaciones corriendo:** no se probó con la tienda y Central en ejecución real conectadas por el túnel. Sí se probaron con las clases reales y el SQL en PostgreSQL: el cifrado, la llave fijada, la recepción, el borrado al retirar el consentimiento y el panel.
- **Revisión legal:** el texto de consentimiento conviene revisarlo con un abogado e incluirlo en el contrato con sus clientes.
