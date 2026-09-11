# API del kiosco de báscula

Superficie que consume la app de Android. Vive en `/api/campo/v1` y **sí escribe**,
a diferencia de `/api/v1`, que quedó de solo lectura para los agentes de IA.

Están las **etiquetas**, el **pesaje** y la **foto de la caja**.

---

## 1. La sesión se comparte con la app de campo

**No hay nada nuevo que construir del lado del servidor.** El kiosco usa los mismos
dos endpoints que ya usa la app que está en los teléfonos:

```
POST /api/trpc/auth.loginMobile     { "json": { "email": "...", "password": "..." } }
POST /api/trpc/auth.refreshMobile   { "json": { "refreshToken": "..." } }
```

La respuesta viene envuelta: el token está en `result.data.json.token`.

| | Dura |
|---|---|
| Token de acceso | **30 días** |
| Token de refresco | **365 días** |

Para un kiosco eso significa que **se inicia sesión una vez al empezar el ciclo y
nadie vuelve a ver la pantalla de login** en toda la cosecha. Cuando el de acceso
caduca, la app lo canjea sola con el de refresco.

Del lado de Kotlin se puede copiar tal cual lo que ya existe en `android-app`:
`RetrofitClient` (el interceptor que pone el Bearer y el `Authenticator` que
renueva) y `AuthRepository`.

```
Authorization: Bearer <token>
X-Dispositivo: bascula-1        (opcional)
```

`X-Dispositivo` no identifica a nadie: **cada báscula tiene su propia cuenta**, y
el usuario del token ya dice qué báscula y qué operador hizo cada cosa. El
encabezado sirve solo para notar si dos aparatos están usando la misma cuenta.

---

## 2. La regla que no se puede romper

> **Nunca mandes un folio. Pide cuántos necesitas.**

El servidor reparte los folios y contesta cuáles tocaron. Es lo único que impide
que dos básculas sin señal entre ellas impriman etiquetas físicas repetidas: el
reparto lo hace el único que las ve a las dos.

Y **el folio se reinicia en cada ciclo**. Eso quiere decir que el mismo
`01-000123` existe a propósito en la cosecha pasada y en la nueva. Por eso todo
lo que busca por código lleva ciclo; si no se dice cuál, se asume el abierto.

### Imprimir para otro ciclo

Por omisión se aparta para el ciclo en curso, y esa es casi siempre la respuesta
correcta. Pero en el cambio de ciclo puede haber cortadoras terminando la cosecha
vieja mientras el nuevo ya está abierto, y sus etiquetas tienen que llevar la
numeración del ciclo al que van a pertenecer las cajas.

```bash
curl -H "Authorization: Bearer $TOKEN" https://TU-SERVIDOR/api/campo/v1/ciclos
```

Devuelve cada ciclo con `esElDeHoy` y su `ultimoFolio`. Manda `"ciclo": <id>` en
el cuerpo solo cuando de verdad quieras otro: **la caja se busca por (ciclo,
código), así que una etiqueta apartada en el ciclo equivocado no encuentra su
caja.**

Cada ciclo lleva su propia cuenta. Un ciclo recién abierto empieza en el folio 1;
uno que ya imprimió sigue desde donde se quedó, así que escoger un ciclo viejo
nunca repite un código dentro de él.

---

## 3. El flujo de impresión

Apartar e imprimir son dos pasos, y hay un tercero que cierra:

```
POST /etiquetas/lotes            → te tocan los folios 1201–1400 (lote 42)
   ↓  imprimes con tu impresora
POST /etiquetas/lotes/42/confirmar   si salió bien
POST /etiquetas/lotes/42/cancelar    si se atoró
```

**Si no confirmas, esos folios no cuentan como impresos** y no van a aparecer en
el reporte de etiquetas pendientes.

**Si cancelas, esos folios quedan quemados y no se reutilizan.** Perder doscientos
números no cuesta nada; repetirlos cuesta una recepción entera.

### Apartar

```bash
curl -X POST https://TU-SERVIDOR/api/campo/v1/etiquetas/lotes \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Dispositivo: bascula-1" \
  -H "Content-Type: application/json" \
  -d '{"cortadora": 7, "cantidad": 200, "texto": "Cosecha SR 30", "clientUuid": "..."}'
#     "ciclo": 3   ← opcional. Sin esto, el ciclo en curso.
```

```json
{
  "ok": true,
  "datos": {
    "loteId": 42,
    "cicloId": 3,
    "cicloNombre": "ciclo 2026-2027",
    "cortadora": 7,
    "cantidad": 200,
    "folioStart": 1201,
    "folioEnd": 1400,
    "etiquetas": [{ "folio": 1201, "codigo": "07-001201" }, "..."],
    "yaExistia": false,
    "siguientePaso": "Imprime y luego confirma con POST .../etiquetas/lotes/42/confirmar..."
  },
  "meta": { "generado": "...", "zonaHoraria": "America/Mexico_City", "dispositivo": "bascula-1" }
}
```

Manda siempre `clientUuid` (un UUID que genere el teléfono). Es lo que hace la
petición **idempotente**: si se cae la señal justo al mandarla y el kiosco
reintenta, recibe el mismo rango con `yaExistia: true` en vez de apartar el doble.

### Imprimir

La plantilla la sirve el servidor, no va dentro del APK:

```bash
curl -H "Authorization: Bearer $TOKEN" https://TU-SERVIDOR/api/campo/v1/impresion/plantilla
```

Trae el TSPL con dos marcadores, `{{texto}}` y `{{codigo}}`, para una etiqueta de
38 × 25 mm. Se repite el bloque cambiando `{{codigo}}` por cada uno de los que
vinieron en `etiquetas`. **Así, cambiar el diseño de la etiqueta no vuelve a
exigir un APK nuevo** ni bajar a las básculas del campo.

---

## 4. Endpoints

| | Ruta | Qué hace |
|---|---|---|
| `GET` | `/` | Portada. **No pide sesión**: es lo que se lee para saber cómo entrar |
| `GET` | `/ciclos/actual` | Qué ciclo está abierto y por dónde va el conteo de etiquetas |
| `GET` | `/ciclos` | Los ciclos entre los que se puede escoger, con su último folio |
| `GET` | `/impresion/plantilla` | El TSPL con marcadores |
| `POST` | `/etiquetas/lotes` | **Aparta N folios** |
| `POST` | `/etiquetas/lotes/{id}/confirmar` | Salió bien |
| `POST` | `/etiquetas/lotes/{id}/cancelar` | Se atoró; los folios se queman |
| `POST` | `/etiquetas/reimprimir` | Reemplaza una etiqueta dañada por un folio nuevo |
| `GET` | `/etiquetas/lotes` | Historial de impresión |
| `GET` | `/etiquetas/pendientes` | **Impresas que nunca volvieron**, por cortadora |
| `GET` | `/etiquetas/resumen` | Impresas, usadas y canceladas del ciclo |
| `GET` | `/etiquetas/{codigo}` | El expediente de una etiqueta |

Parámetros de consulta comunes: `ciclo`, `cortadora`, `desde`, `hasta`, `limite`.

Toda respuesta tiene la misma forma: `{ok, datos, meta}` o `{ok, error}`.

---

## 5. Qué hacer con cada rechazo

El campo `ayuda` dice qué hacer. Y el **código HTTP dice si tiene caso reintentar**:

| | Qué pasó | Qué hacer |
|---|---|---|
| `400` | Falta un dato o está mal | Corrige y vuelve a mandar. **Reintentar igual da el mismo error** |
| `401 sin_sesion` | No mandaste token | Manda el Bearer |
| `401 sesion_invalida` | Caducó | Renueva con `auth.refreshMobile` |
| `403 cuenta_desactivada` | Apagaron esta báscula | No reintentar. Avisa |
| `403 sin_permiso` | La cuenta no puede imprimir | Que le activen “Etiquetas” |
| `404` | Esa etiqueta o ese lote no existe | Revisa el código y el ciclo |
| `400 ciclo_desconocido` | El `ciclo` que mandaste no existe | Consulta `GET /ciclos` y manda uno de esos |
| `409 sin_ciclo_abierto` | Hoy no cae en ningún ciclo | **No reintentar en bucle.** Abre el ciclo, o di explícitamente para cuál imprimes |
| `409 folio_agotado` | El ciclo llegó a 999999 | No reintentar. Hay que cerrar el ciclo |
| `409 estado_no_permite` | Esa etiqueta ya se usó o se canceló | No reintentar |
| `503` | La base no responde | Reintentar más tarde, con espera creciente |

La diferencia entre 400 y 409 importa: un **400 lo puede arreglar el kiosco**; un
**409 no**, y reintentarlo en bucle solo llena la base de intentos.

---

## 6. Trabajar sin señal

La cosecha no se detiene porque se caiga el internet. La forma de sobrevivirlo es
**apartar de más y con tiempo**: los folios apartados son del kiosco aunque pierda
la señal, y se pueden imprimir sin conexión. Lo que sí necesita señal es apartar,
confirmar y cancelar.

Guarda en el teléfono el lote y su estado, y manda las confirmaciones pendientes
cuando vuelva la señal. Confirmar dos veces no hace daño: solo cambia de estado
las etiquetas que siguen apartadas.

---

## 7. Lo que no hay que interpretar mal

**Las cortadoras 98 y 99 no son personas.** La 98 marca segunda calidad y la 99
desperdicio. Se imprimen sus etiquetas igual que las demás, pero no cuentan como
gente en ningún reporte.

**El peso se guarda en gramos.** `weight` es el peso **neto** —es lo que se ha
capturado siempre— y el servidor lo calcula restando la tara del bruto. El bruto
y la tara se guardan aparte, que es lo que permite auditar una báscula
descalibrada.

**Un folio cancelado no vuelve.** Si el kiosco pierde el rango que apartó, pide
otro; no intentes reusar números.

---

## 8. El pesaje

```
POST /api/campo/v1/cosecha/cajas
```

Manda hasta **200 cajas por tanda**. El peso va en **gramos enteros**: `12.345 kg`
se manda como `12345`. Un decimal se rechaza, porque casi siempre significa que
alguien convirtió mal la unidad.

```bash
curl -X POST https://TU-SERVIDOR/api/campo/v1/cosecha/cajas \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Dispositivo: bascula-1" \
  -H "Content-Type: application/json" \
  -d '{"cajas": [
        {"clientUuid": "5b9f0f4a-…",
         "codigo": "07-001201",
         "pesoBrutoGramos": 13450,
         "taraGramos": 1200,
         "pesadoEn": "2026-09-10T14:23:00-06:00"}
      ]}'
```

| Campo | Obligatorio | Qué es |
|---|---|---|
| `clientUuid` | **sí** | El uuid que el kiosco generó **al guardar el pesaje**, no al mandarlo |
| `codigo` | **sí** | El código impreso, `CC-FFFFFF` |
| `pesoBrutoGramos` | sí, o `pesoNetoGramos` | Lo que marcó la báscula |
| `taraGramos` | no | La caja vacía. Sin esto se guarda que nadie aplicó tara |
| `pesoNetoGramos` | sí, si no mandas bruto | Para básculas que ya restan la tara solas |
| `tipoCajaId` | no | De aquí sale la tara si no la mandas. Ver `GET /cosecha/tipos-de-caja` |
| `pesadoEn` | no | **ISO 8601 CON zona.** Sin esto, el reloj del servidor |
| `ciclo` | no | Por omisión, el que le toque a la fecha del pesaje |
| `parcela` | no | Código de parcela. Sin esto la caja entra como `SIN_PARCELA` |

### La regla que no se puede romper

> **El `clientUuid` se genera al guardar en la tableta, no al enviar.**

Es lo único que hace inofensivo reenviar. Si la respuesta se pierde a medio camino
—que es lo normal en el campo— el reenvío trae el mismo uuid y el servidor contesta
`duplicada` con el id de la caja que ya creó. Generarlo al enviar produce un uuid
nuevo en cada intento y duplica la caja tantas veces como se reintente.

### La fecha lleva zona, siempre

`pesadoEn` tiene que ser un instante completo con zona: `2026-09-10T14:23:00-06:00`
o con `Z`. Lo demás se rechaza, y no por estricto: JavaScript acepta las tres
formas de abajo sin quejarse y ninguna guarda lo que el pesador tenía enfrente.

| Lo que mandas | Lo que se guardaría |
|---|---|
| `10/09/2026` | 9 de **octubre**, a la americana |
| `2026-09-07` | las 18:00 del día **6** en México |
| `2026-09-07T14:23:00` | la hora del contenedor, que está en UTC |

### Lo que entra marcado en vez de rechazarse

Un peso ya ocurrió. Rechazarlo borra una medición real y deja a la báscula
reintentando para siempre. Estas cajas **se guardan** y vienen con un aviso:

| Aviso | Qué pasó |
|---|---|
| `peso_alto` | Más de 15 kg. Casi siempre es un punto decimal mal puesto |
| `codigo_repetido` | Ya había una caja con ese código en el ciclo |
| `sin_etiqueta` | El código no está en la tabla de etiquetas. **Normal por ahora** |
| `etiqueta_cancelada` | Volvió una etiqueta dada por quemada |
| `sin_ciclo` | La fecha no cae en ningún ciclo registrado |
| `sin_parcela` | No se dijo de qué parcela salió |
| `sin_tara` | Nadie aplicó tara. No es lo mismo que una tara de cero |

`sin_etiqueta` va a ser lo normal durante semanas: la tabla de etiquetas nació
vacía y solo se llena con lo que se imprima de ahora en adelante.

### La respuesta va caja por caja

```json
{ "ok": true,
  "datos": {
    "recibidas": 2, "creadas": 1, "duplicadas": 1, "rechazadas": 0,
    "resultados": [
      { "indice": 0, "estado": "creada", "cajaId": 41822,
        "pesoNetoGramos": 12250, "avisos": ["sin_parcela"] },
      { "indice": 1, "estado": "duplicada", "cajaId": 41790, "avisos": ["ya_estaba"] }
    ] } }
```

El `indice` es la posición en el arreglo que mandaste: con él se sabe **cuál** de
las doscientas quedó, no solo cuántas. Solo se borran de la cola de la tableta las
que contesten `creada` o `duplicada`. Las `rechazada` se quedan, y cada una dice
en su error qué corregir.

### Las otras tres rutas

```
GET /cosecha/cajas/{codigo}?ciclo=3    ¿ya se pesó? ¿cuántas veces?
GET /cosecha/conflictos?ciclo=3        códigos con más de una caja
GET /cosecha/tipos-de-caja             el catálogo de taras
```

La primera es lo que deja al kiosco preguntar **al servidor** si una caja ya se
pesó. Su propia memoria no alcanza: dos básculas no se ven entre ellas.

### El permiso

Pesar tiene el suyo, **“Pesar cajas en la báscula”**, en Configuración → Usuarios,
y nace apagado. No se hereda del de Etiquetas: imprimir de más cuesta papel, pesar
de más mete cajas en la cosecha.

---

## 9. La foto de la caja

La foto viaja aparte de la caja: la caja va en JSON por tandas, la foto es un
archivo. Se cuelga de la caja por su `clientUuid`, que es lo único que las dos
partes comparten con certeza aunque la respuesta del pesaje se haya perdido.

```
POST /api/campo/v1/cosecha/cajas/foto        multipart/form-data
   foto        el archivo JPEG (hasta 15 MB)
   clientUuid  el mismo con el que se guardó el pesaje
```

```bash
curl -X POST https://TU-SERVIDOR/api/campo/v1/cosecha/cajas/foto \
  -H "Authorization: Bearer $TOKEN" \
  -F "clientUuid=5b9f0f4a-…" \
  -F "foto=@caja.jpg;type=image/jpeg"
```

```json
{ "ok": true,
  "datos": { "cajaId": 41822, "codigo": "07-001201",
             "fotoUrl": "/app/photos/bascula/5b9f0f4a-….jpg", "reemplazo": false,
             "nota": "Foto guardada. Ya se ve en la pantalla de cajas." } }
```

**El orden importa**: primero la caja (`creada` o `duplicada`), después la foto.
Si la caja no existe todavía contesta `404 caja_desconocida`: guarda la foto en
la tableta y vuelve a intentarlo después de que la caja entre. Reenviar la misma
foto no duplica nada: solo la reemplaza (`reemplazo: true`).

El servidor la comprime (máximo 1920 px, JPEG 80 %), la guarda en
`/app/photos/bascula/` y la apunta desde la caja, así que aparece en la pantalla
de cajas igual que las fotos que llegan de Kobo. Pide el mismo permiso que pesar.
