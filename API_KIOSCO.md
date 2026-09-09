# API del kiosco de báscula

Superficie que consume la app de Android. Vive en `/api/campo/v1` y **sí escribe**,
a diferencia de `/api/v1`, que quedó de solo lectura para los agentes de IA.

En esta fase están las etiquetas. El pesaje de cajas con tara entra en la fase 3.

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
| `409 sin_ciclo_abierto` | Hoy no cae en ningún ciclo | **No reintentar en bucle.** Hay que abrir el ciclo |
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

**El peso se guarda en gramos.** Cuando entre el pesaje en la fase 3, `weight`
sigue siendo el peso **neto** —es lo que se ha capturado siempre— y el servidor lo
calcula restando la tara del bruto.

**Un folio cancelado no vuelve.** Si el kiosco pierde el rango que apartó, pide
otro; no intentes reusar números.
