# Actualización: Ciclos de Producción + Libreta de Campo al frente

**Fecha:** Agosto 2026

> **Segunda entrega (misma fecha):** jornadas de trabajo multi-día con horas,
> colaboradores de campo desde la app, fotos múltiples de actividades,
> distribución del APK con auto-actualización, parcelas con actividad en el
> dashboard (mapa satelital) y resumen semanal generado con IA.
> Ver sección "Segunda entrega" abajo.

Esta versión convierte el sistema de "revisar la cosecha" en la base de agricultura de
precisión por **ciclos de producción de higo**: cada ciclo inicia con la **poda/dormancia**
y registra su **fin de cosecha** y **fin de ciclo**. El dashboard ahora pone la **libreta de
campo** al frente cuando no hay cosecha activa, y agrupa la cosecha por ciclos.

---

## Qué cambia para el usuario

### 🌐 Web
1. **Nueva página "Ciclos"** (`/cycles`, icono de ciclo en el menú):
   - Crear ciclo con nombre y fecha de inicio (sugiere la fecha de la última poda registrada en la libreta).
   - Botones **"Finalizar cosecha"** y **"Cerrar ciclo"** en el ciclo activo.
   - Editar todas las fechas (inicio, inicio de cosecha, fin de cosecha, fin de ciclo).
   - Al crear un ciclo nuevo, el anterior se cierra solo (fecha = día anterior al nuevo inicio).
   - El inicio de cosecha se **detecta automáticamente** con la primera caja dentro del ciclo (o se captura manual).
2. **Dashboard**:
   - **Sin ciclos configurados → se ve exactamente igual que antes** (transición sin sorpresas).
     Solo el admin ve una invitación discreta a configurar el primer ciclo.
   - Con ciclos: banda del ciclo activo arriba + tarjetas de cosecha por ciclo.
   - **Sin cosecha activa** → la **Libreta de Campo** roba la atención: actividades por realizar
     (con atrasadas en rojo) y realizadas recientemente.
   - **Cuando arranca la cosecha del ciclo actual** → la cosecha vuelve a ser la protagonista
     (KPIs, distribución de calidad, gráfica y tabla de temperatura acotadas al ciclo), con la
     libreta compacta abajo.
   - Tocar cualquier ciclo muestra su detalle de cosecha completo.

### 📱 App Android (v1.1.0)
- Nueva sección **Libreta de Campo** (botón "Libreta" en la barra inferior):
  - Ver actividades **planificadas desde la web** (se bajan al sincronizar).
  - **Crear actividades offline** (tipo, subtipo, descripción, fecha, parcelas, realizada/planificada).
  - **Marcar actividades como completadas** con un toque (sincroniza el cambio a la web).
  - Todo offline-first con sincronización automática cada 15 min + inmediata al guardar.
- Las notas de campo siguen funcionando igual que siempre.
- La base local migra automáticamente **sin borrar notas pendientes** de sincronizar.

---

## Cómo desplegar (transición automática)

### Web (Docker, producción)
```bash
git pull
docker-compose up -d --build
```
Nada más. El `entrypoint` corre `migrate.cjs`, que ahora crea de forma **idempotente**:
- Tabla `productionCycles`
- Columna `fieldActivities.clientUuid` + índice único (idempotencia del sync móvil)
- Columnas `users.canViewCycles`, `users.canViewReports`, `users.canViewLabels`

Si prefieres aplicar el SQL a mano: `drizzle/0019_add_production_cycles.sql`.

**No se toca ningún dato existente** (cajas, actividades, notas y usuarios quedan igual).
La pertenencia de cajas a un ciclo se resuelve **por rango de fechas** — sin FKs nuevas.

### App Android
1. Compilar release desde Android Studio (o `gradle :app:assembleRelease`) y firmar como siempre.
2. Instalar sobre la versión anterior — la migración de Room 2→3 conserva todo lo local.

---

## Primer uso recomendado
1. Entrar a **Ciclos** y crear el ciclo pasado (ej. "Ciclo 2025-2026") con su inicio, fin de cosecha y fin de ciclo.
2. Crear el ciclo actual (ej. "Ciclo 2026-2027") con la fecha de la última poda.
3. Listo: el dashboard agrupa la cosecha por ciclo y muestra la libreta al frente hasta que
   arranque la cosecha del ciclo actual.

---

## Detalle técnico (para desarrollo)

| Capa | Cambio |
|---|---|
| `drizzle/schema.ts` | Tabla `productionCycles` (fechas en modo string "YYYY-MM-DD"); `fieldActivities.clientUuid`; permisos `canViewCycles`/`canViewReports` |
| `migrate.cjs` | Aplica el 0019 idempotente en cada arranque del contenedor |
| `server/routers.ts` | Router `cycles` (overview/create/update/delete); `fieldNotebook.dashboard` (resumen ligero sin N+1); `offlineSync.syncFieldActivities` + `offlineSync.getActivities` (sync móvil idempotente con fallback por serverId); `boxes.dashboardStats`/`dailyChartData`/`availableMonths` aceptan rango de fechas opcional |
| `server/db.ts` | `getDashboardStats`, `getDailyChartData`, `getAvailableMonths` con rango opcional (retrocompatibles) |
| `client/src/pages/Cycles.tsx` | Página nueva de gestión de ciclos |
| `client/src/pages/Home.tsx` | Dashboard por ciclos + panel de libreta de campo |
| `client/src/config/fieldNotebook.ts` | Constantes de la libreta extraídas (compartidas Home ↔ FieldNotebook) |
| `client/src/config/pages.ts`, `App.tsx`, `ProtectedPage.tsx` | Registro de la página Ciclos + permisos |
| `android-app` | Entidad+DAO `FieldActivityEntity`, Room v3 con migración real, `FieldActivityRepository`, pantallas `ActivitiesListScreen`/`CreateActivityScreen`, pasos 3-4 del `SyncWorker`, barra inferior con switch Notas↔Libreta |

**Orden de despliegue:** primero el servidor, después la app. Si la app 1.1.0 corre contra
un servidor viejo, la libreta móvil no sincroniza (reintenta sin perder datos) pero las
notas siguen funcionando.

Pendientes conocidos (no bloquean):
- Fotos de actividades desde la app móvil (las notas sí llevan foto; las actividades aún no).
- `reports` aún no incluye actividades de la libreta en el PDF.
- Las actividades eliminadas en la web no se borran de los teléfonos (quedan localmente,
  pero ya no se pueden "resucitar" en el servidor).
- La app baja hasta 500 actividades recientes; con historiales más grandes convendrá paginar.

---

# Segunda entrega: precisión en actividades, app 1.2.0 e IA semanal

## Qué hay de nuevo

### 🌐 Web
1. **Jornadas de trabajo**: cada actividad puede registrar de qué hora a qué hora
   se trabajó, y si tomó varios días, un renglón por día con sus horas (el total
   de horas se calcula solo). Editor en la Libreta de Campo, visible en el detalle.
2. **Dashboard**:
   - **Panorama Semanal (IA)**: tarjeta arriba del dashboard con el resumen de la
     **semana pasada** — actividades realizadas/pendientes, clima, NDVI por parcela,
     cosecha y la etapa fenológica estimada del ciclo. Se genera **cada lunes**
     automáticamente (o con el botón "Generar ahora" del admin). La tarjeta indica
     claramente que se actualiza cada semana.
   - **Parcelas con trabajo en curso**: las parcelas con actividades recientes o
     planificadas aparecen con su mapa satelital NDVI (del cache de Copernicus) y
     el resumen de lo que se está haciendo en cada una.
3. **Configuración → App Móvil (APK)**: sube el APK nuevo con su versionCode y
   versionName; los teléfonos lo detectan al abrir la app y ofrecen descargarlo.

### 📱 App Android (v1.2.0)
- **Estado "En proceso"** además de Realizada/Planificada.
- **Horas de trabajo**: de qué hora a qué hora se hizo la actividad; con el switch
  "¿Varios días?" se capturan varias jornadas (día + horas cada una).
- **Colaboradores de campo**: alta desde el teléfono (nombre + rol) y selección
  en cada actividad para saber quién la hizo; se sincronizan con la web
  (aparecen en Equipo y en las asignaciones de la Libreta).
- **Fotos múltiples por actividad**: varios ángulos al crearla, al completarla
  o tocando una completada; se comprimen y suben solas al sincronizar.
- **Auto-actualización**: al abrir la app con internet revisa si hay APK más
  nuevo publicado en la web y ofrece descargarlo.

## Requisitos
- **Resumen semanal**: requiere la API key de DeepSeek en Ajustes (la misma de
  los reportes). Sin key, la tarjeta simplemente no genera y lo indica.
- **Mapas satelitales en el dashboard**: usa el cache de Copernicus (se llena al
  visitar Análisis de Parcela o con el sync satelital normal); no hace llamadas
  extra a la API.

## Despliegue
Igual que siempre: `git pull && docker-compose up -d --build` (migración 0020
automática e idempotente vía migrate.cjs; SQL manual en
`drizzle/0020_work_sessions_photos_weekly.sql`). Primero servidor, luego publicar
el APK 1.2.0 desde Configuración.

## Endurecimiento aplicado en esta entrega
- **Anti-CSRF en endpoints REST**: si la autenticación llega por cookie (navegador)
  y el `Origin` es de otro sitio, se rechaza. Así una página maliciosa no puede
  usar la sesión del admin para publicar un APK a todos los teléfonos. El token
  Bearer de la app no se ve afectado.
- **Anti path traversal**: `localPhotoId`, `activityClientUuid` y `fieldNoteFolio`
  se validan (`[A-Za-z0-9_-]{1,64}`) antes de formar rutas de archivo; `versionName`
  se sanitiza para el nombre del APK y el header de descarga.
- **APK hasta 300MB** con error en JSON (antes: HTML 500 ilegible al pasarse).
- **Resumen semanal**: `weekStart` único + upsert (el scheduler y el botón manual
  ya no pueden duplicar la semana); mensajes de error distinguen "falta la key"
  de "falló la IA", y una regeneración fallida ya no reporta éxito falso.
- **Dashboard ligero**: los mapas NDVI se sirven por `/api/parcel-ndvi-map/:id`
  (imagen cacheable) en vez de base64 inline — el payload pasó de varios MB a ~1KB.
- **App**: las fotos y el formulario sobreviven a que la cámara mate el proceso
  (`rememberSaveable`); las actividades ya no se atascan por colaboradores
  rechazados; el botón Sync reintenta lo que había fallado 8 veces; las
  actividades borradas en la web se eliminan del teléfono (ya no resucitan) y los
  colaboradores dados de baja desaparecen del selector.

---

# Tercera entrega: arreglo de sincronización y fotos inteligentes (app 1.3.0)

## El bug que impedía sincronizar actividades

En la app 1.2.0 los pasos de sincronización eran **secuenciales con aborto**: si
fallaba la subida de una foto (o de una nota), el worker hacía `return Result.retry()`
y **nunca llegaba al paso de las actividades**. Con fotos de 48MP sobre la red del
campo, la subida se pasaba del timeout, tumbaba el ciclo completo y las actividades
se quedaban sin subir para siempre — sin ningún mensaje que lo explicara.

Verificado: el servidor de producción estaba correcto (endpoints respondiendo);
el problema era 100% de la app.

**Arreglado**: cada paso es independiente. Los datos suben aunque las fotos fallen.

## Qué hay de nuevo (v1.3.0)

### Datos primero, fotos después
- **Con datos móviles**: se sincronizan siempre actividades, notas, parcelas y
  colaboradores (pesan poco). Las fotos esperan.
- **Con WiFi**: se sincroniza todo, incluidas las fotos.
- La primera vez que la app detecta datos móviles **pregunta** qué prefieres:
  *"Solo con WiFi"* o *"Usar datos también"*, por separado para **subir** y
  **descargar** fotos. Se puede cambiar cuando quieras con el engrane de la
  pantalla Libreta.

### Fotos más ligeras (procesadas en el teléfono)
- Máximo **8 megapíxeles** y calidad JPEG media (80) antes de guardarlas.
- Respeta la orientación de la cámara (ya no salen giradas).
- Las fotos **ya tomadas** que estén atoradas también se recomprimen antes de subir,
  así se destraba el rezago.
- Si el procesamiento falla por lo que sea, la foto original se conserva intacta.

### La app ahora te dice qué pasó
- Banda de estado en la Libreta: *"3 registros sincronizados · 14:32"*, o el motivo
  exacto del fallo (*"Tu sesión expiró"*, *"El servidor no tiene soporte para…"*,
  *"Sin conexión"*, *"Actividad rechazada: …"*).
- Aviso de cuántas fotos esperan WiFi, tocable para cambiar la preferencia.
- Al tocar Sincronizar te dice qué va a hacer según la red que tengas.

### Todo al día desde el servidor
Cada sincronización refresca parcelas, colaboradores y actividades (incluidas las
planificadas desde la web), y elimina del teléfono lo que se borró o desactivó en
la web.

## Despliegue
El servidor **no requiere cambios** para esta entrega (solo trae el endurecimiento
de la entrega anterior). Compila el APK **1.3.0 (versionCode 4)**, súbelo en
Configuración → App Móvil, y los teléfonos lo ofrecerán al abrir la app.

---

# Cuarta entrega: sesión que no caduca, IA Tecti, resumen nocturno y actividades en el reporte

## 1. Se acabaron las sesiones caídas (app 1.4.0)
El token de acceso caducaba y la app se quedaba "logueada" pero sin poder
sincronizar nada, en silencio. Ahora:
- El login entrega también un **token de refresco de larga duración (1 año)**.
- Cuando el servidor responde 401, la app **renueva la sesión sola** y reintenta
  la petición: el usuario ni se entera.
- Si el refresco ya no sirve (usuario borrado, secreto rotado), la app **cierra
  sesión y manda al login** con un aviso claro: *"Por seguridad tu sesión terminó…
  nada de lo que capturaste se pierde"*.
- Seguridad: el token de refresco **no sirve** para autenticar peticiones normales
  (verificado); un refresco inválido responde con mensaje claro.

## 2. "IA Tecti" en lugar de DeepSeek
El nombre del proveedor ya no aparece en nada que vea el cliente. El Panorama
Semanal del dashboard muestra el distintivo **IA Tecti**, y el reporte PDF ya
usaba **IA AGRA TEC-TI**. (En Ajustes, que solo ve el administrador, se conserva
el nombre técnico del proveedor porque ahí es donde se configura la llave.)

## 3. El panorama se genera de noche
El resumen se **regenera cada madrugada (2-5 AM, hora de México)**, así el
productor lo encuentra fresco por la mañana con todo lo capturado el día anterior.
La tarjeta lo indica: *"se actualiza cada noche"*. Si por un despliegue faltara
el resumen de la semana, se genera en cuanto se detecta.

## 4. El reporte ahora incluye el trabajo de campo
Nueva sección **"Trabajo de Campo"** en el reporte general (en pantalla y en el PDF):
- KPIs: actividades del periodo, completadas, pendientes y **horas de labor**.
- **Dónde se trabajó**: conteo de actividades por parcela.
- **Labores por tipo**: riegos, podas, fertilizaciones, etc.
- **Detalle**: fecha (con los días si duró varias jornadas), labor y subtipo,
  parcela(s), responsable, horas y estado.
- El análisis de IA del reporte ahora también recibe las labores ejecutadas y en
  qué parcelas, así sus conclusiones consideran el trabajo real de campo.

## Despliegue
Servidor: `git pull && docker-compose up -d --build` (sin migraciones nuevas).
App: compilar **1.4.0 (versionCode 5)** y publicarla en Configuración → App Móvil.

> Al instalar la 1.4.0, cada usuario debe iniciar sesión **una última vez** para
> recibir el token de refresco. A partir de ahí la sesión se mantiene sola.

---

# Quinta entrega: mapas de parcela legibles y resumen con pronóstico

## Los mapitas del dashboard ahora se ven bien
Antes la imagen satelital se recortaba (`object-cover`) y solo se veía un pedazo
con pixeles de colores, sin saber qué parte era la parcela. Ahora:
- **Se ve el mapa completo**, con la **proporción real del terreno** (se corrige
  incluso la deformación que introduce el muestreo de Sentinel).
- Se dibuja el **contorno real de la parcela** encima (línea blanca con halo), y
  **lo que queda fuera se oscurece**: de un vistazo se entiende qué es tu terreno
  y cómo está el vigor por zonas.
- **Escala de vigor** (rojo → verde) y fecha de la imagen en la tarjeta.
- La imagen se sirve desde un endpoint cacheable, así que sigue siendo ligera.

## El resumen de IA ahora ve el futuro
Al prompt se agregó:
- **Clima día a día de la semana pasada** (antes solo iba el promedio), para que
  relacione cada labor con el clima de ese día.
- **Pronóstico de los próximos 7 días** (temperatura, lluvia, probabilidad y viento).
- **Actividades planeadas para los próximos 14 días** y **actividades atrasadas**.
- Instrucción explícita de **cruzar el pronóstico con lo planeado**: qué días
  convienen o no para cada labor (no fumigar antes de lluvia o con viento, ajustar
  el riego si viene lluvia, aprovechar días secos para poda, etc.).

Verificado en ejecución: el contexto enviado a la IA incluye 7 días de clima
pasado, 7 de pronóstico y las actividades próximas/atrasadas.

## Despliegue
Solo servidor y web: `git pull && docker-compose up -d --build`. Sin migraciones
ni cambios en la app móvil.

---

# Sexta entrega: se arregla el análisis con IA y botón de actualizaciones

## Por qué fallaba el resumen con IA (y el análisis de parcela y del reporte)
El modelo configurado **razona antes de responder**, y esos tokens de
razonamiento cuentan dentro de `max_tokens`. Con el presupuesto que traía el
código (900 en el resumen, 800 en análisis de parcela, 600 en el reporte) el
modelo **gastaba TODO pensando** y devolvía el texto final **vacío**, que el
código interpretaba como fallo.

Comprobado contra la API real: con 900 tokens → `finish_reason: length`,
`reasoning_tokens: 900`, contenido vacío. Con 4000 → razonamiento ~400 tokens y
respuesta completa de ~1,500 caracteres en 10 segundos.

**Arreglado** en los tres lugares (resumen semanal, análisis de parcela y reporte
general): presupuesto de 4000 tokens y manejo explícito de respuesta vacía con
mensaje claro (*"se quedó sin espacio para responder"*) en vez de un error genérico.

## Botón para buscar actualizaciones
- En la Libreta, el engrane ahora abre **Ajustes** con la **versión instalada** y
  un botón **"Buscar actualización"**.
- Si hay una nueva, ofrece descargarla; si no, avisa *"Ya tienes la última versión"*;
  si no hay conexión, lo dice claramente.

> **Importante sobre la actualización automática:** sí funciona, pero solo avisa
> cuando el `versionCode` publicado es MAYOR al instalado. Hasta ahora estaba
> publicada la 1.2.0 (código 3) y los teléfonos tienen esa misma, por eso nunca
> ofrecía nada. Al publicar la **1.5.0 (código 6)** los teléfonos la ofrecerán al
> abrir la app.

## Despliegue
Servidor y web: `git pull && docker-compose up -d --build` (sin migraciones).
App: compilar **1.5.0 (versionCode 6)** y publicarla en Configuración → App Móvil.

---

# Séptima entrega: IA por ciclo, Personal y Almacén en la app, y evidencia desde la web

## 1. La IA solo analiza el ciclo actual

El resumen que aparece en el Dashboard mezclaba la libreta de todos los ciclos:
labores de hace un año seguían apareciendo como "atrasadas" y ensuciaban el
diagnóstico. Ahora **todo el análisis se acota al ciclo de producción activo**:

- Actividades de la semana, atrasadas y próximas: solo las que caen dentro del
  ciclo actual.
- **Notas de campo**: se agregaron al análisis, también solo las del ciclo actual
  (antes la IA ni siquiera las veía).
- El prompt empieza declarando el alcance: *"solo se incluye información del
  CICLO ACTUAL … los ciclos anteriores NO forman parte de este análisis"*.

Si todavía no hay ciclos registrados, se comporta como antes (toma toda la
libreta), para no dejar al productor sin resumen.

### Una parcela sin poda NO va atrasada

El ciclo del higo arranca con la poda. Si una parcela aún no la registra, es que
**apenas le va a tocar**, no que vaya retrasada. El prompt ahora incluye:

- El estado de la poda parcela por parcela dentro del ciclo (con su fecha).
- La lista de **parcelas sin poda registrada en este ciclo** y una regla
  obligatoria para la IA: *"en estas parcelas la labor APENAS VA A COMENZAR.
  NO las califiques como atrasadas…"*.

Verificado con datos de prueba: el prompt excluye las labores y notas del ciclo
anterior, incluye las del actual, y lista correctamente la parcela sin poda con
su instrucción.

## 2. Módulo de Personal en la app

Sección propia **Personal** en la app, con la misma lógica offline/online que ya
se usa para todo:

- Con internet **baja la lista del servidor**, así alguien dado de alta en otro
  teléfono o en la web aparece en todos los dispositivos.
- Sin internet **se puede dar de alta y editar**; sube solo al recuperar señal.
- **Puestos desde el catálogo del servidor** (`collaboratorRoles`). Si eliges
  **"Otro"** escribes el puesto a mano: queda en el catálogo del teléfono al
  instante y se registra en el servidor al sincronizar, de modo que aparece
  después en la web y en los demás teléfonos.
- El mismo catálogo se usa ahora en la página de Colaboradores de la web.

## 3. Módulo de Almacén en la app

Sección **Almacén** con exactamente la misma mecánica que Personal:

- Catálogo de productos que baja del servidor y permite altas offline.
- Cada producto guarda su **unidad de medida** (kg, g, lt, ml, ton, oz, lb, gal,
  bulto, saco, unidad).

### Consumo de productos en las actividades

Al crear una actividad en la app se pueden asociar productos del almacén y
registrar **cantidad planeada** y **cantidad utilizada**. Al elegir el producto,
**su unidad de medida se carga sola**. En la libreta, una actividad con productos
ofrece la acción *"Registrar lo que se usó"* para capturar el consumo real
comparándolo con lo planeado.

En la web se agregaron los dos campos (Planeada / Utilizada) al formulario de la
libreta y ambos se muestran en el detalle de la actividad.

> No se lleva control de existencias ni de stock mínimo desde la app: solo el
> registro de lo planeado contra lo usado.

**Cuidado tomado:** cuando el teléfono reporta el consumo de una actividad que ya
existía, el servidor **solo actualiza las cantidades**; la dosis por hectárea, el
método de aplicación y las notas capturadas en la web se conservan intactas.

## 4. Evidencia fotográfica desde la web

- **App:** se mantiene la restricción de **cámara en vivo** (sin galería): la
  evidencia de campo debe tomarse en el momento.
- **Web:** en el detalle de cada actividad hay un botón **"Subir fotos"** que
  acepta archivos locales (hasta 10 por vez, 50 MB cada una), con selector de
  tipo (antes / durante / después / producto) y opción de eliminar. Sirve para
  regularizar la evidencia que no se subió desde el teléfono.

## 5. La app se siente una sola cosa

Se unificó el diseño de todas las pantallas con piezas compartidas
(`AgraScaffold.kt`): mismo fondo, mismo encabezado, mismas tarjetas, chips,
campos, botones y estados vacíos.

- **Barra de navegación única** con las cuatro secciones: Notas · Libreta ·
  Personal · Almacén, siempre visible.
- **Botón de crear** flotante que cambia según la sección donde estés.
- **Sincronizar** y **Ajustes** viven en el encabezado, iguales en todas partes.
- **Ajustes** concentra ahora las fotos con datos móviles, la versión instalada
  con "Buscar actualización" y **cerrar sesión**.

## Cambios en la base de datos (automáticos)

`migrate.cjs` corre solo al arrancar Docker y es idempotente:

- Tabla nueva `collaboratorRoles`, sembrada con los puestos habituales y con los
  que ya se usaban en los colaboradores existentes.
- `warehouseProducts.clientUuid` (+ índice único) para las altas desde la app.
- `fieldActivityProducts.productId` y `plannedQuantity`.
- Unidades nuevas (oz, lb, gal) agregadas **al final** del ENUM, de modo que los
  valores ya guardados no cambian de significado.

La base local de la app sube a la **versión 5** con una migración real (no
destructiva): nada de lo capturado en el campo se pierde.

## Despliegue

Servidor y web:

```bash
git pull && docker-compose up -d --build
```

App: publicar **1.6.0 (versionCode 7)** en Configuración → App Móvil. Los
teléfonos la ofrecerán al abrir la app.

---

# Octava entrega: los borrados llegan al teléfono y las notas se cierran en campo

## 1. Por qué la app no reflejaba los borrados

Al bajar el personal y el almacén, la app solo quitaba lo eliminado **si el
servidor devolvía al menos un registro**:

```kotlin
if (activeIds.isNotEmpty()) dao.deleteSyncedNotIn(activeIds)   // ← el error
```

Esa guarda era para no vaciar el teléfono si la respuesta venía mal, pero como
la respuesta ya se valida antes (código HTTP correcto y cuerpo válido), una
**lista vacía significa de verdad que ya no queda nada activo**. Con la guarda,
si vaciabas el catálogo en la web el teléfono se quedaba con todo.

Ahora una lista vacía también se refleja: el cache se vacía. Lo que aún no ha
subido (altas hechas en el campo) **nunca se toca**.

## 2. Lo mismo para las notas de campo

Las notas ni siquiera se bajaban: la app solo mostraba las que ella misma había
creado. Ahora:

- **Se descargan del servidor**, incluidas las capturadas en la web o por
  Telegram: en el campo se ve todo lo reportado.
- **Los borrados llegan al teléfono.** El servidor manda también la lista de
  folios vivos y la app quita lo que ya no está.
- Nunca se pisa ni se borra una nota con cambios locales pendientes de subir.

> Detalle técnico: la comparación de folios se hace en memoria y el borrado en
> lotes de 200. Un `NOT IN` con miles de folios excede el límite de parámetros
> de SQLite y habría reventado cuando la huerta acumulara notas.

## 3. Seguimiento y cierre de notas desde la app

Tocando una nota se abre su seguimiento:

- Estados: **Abierta · En revisión · En proceso · Resuelta · Descartada**.
- Al cerrarla se captura **qué se hizo para resolverla**.
- Queda registrado **quién la cerró y cuándo**, igual que si se hiciera desde la
  web, y se manda el mismo aviso por Telegram.
- Funciona **sin señal**: el cambio se aplica al instante en el teléfono y se
  sube solo al recuperar la red.
- Si mientras tanto la nota se borró en la web, el servidor lo avisa y la app la
  quita en lugar de reintentar para siempre.

La lista de notas ahora se filtra por **Abiertas · Cerradas · Todas**, muestra el
estado de cada una y las cerradas se ven atenuadas con su nota de resolución.

## Cambios en la base de datos

- **Servidor:** ninguno. Se aprovechan las columnas de estado que ya existían en
  `fieldNotes` (`status`, `resolutionNotes`, `resolvedByUserId`, `resolvedAt`).
- **Teléfono:** base local a la **versión 6** con migración real (no destructiva);
  se agregan a las notas el estado, la nota de resolución, el id del servidor y
  la marca de cambio pendiente. Verificada contra el esquema que Room espera.

## Despliegue

Servidor y web:

```bash
git pull && docker-compose up -d --build
```

App: publicar **1.7.0 (versionCode 8)** en Configuración → App Móvil.

---

# Novena entrega: la imagen satelital es la última pasada realmente despejada

## Qué significaba la fecha del Dashboard (y por qué casi nunca aparecía)

El recuadro con la fecha mostraba `parcelSatelliteCache.mapDate`, que **no es
cuándo pasó el satélite**: es la fecha que se pidió cuando se guardó la imagen.
Peor aún, la imagen tampoco era de un día concreto: se pedía un **mosaico de los
15 días previos** quedándose con lo menos nublado de cada píxel.

Además:

- El sync semanal guardaba `mapDate = 'latest'`, y como eso no es una fecha, el
  Dashboard ocultaba el recuadro. Por eso solo dos parcelas mostraban fecha: las
  que alguien había consultado a mano desde Análisis de Parcela.
- Esas dos fechas (24 oct y 25 nov de 2025) eran de esa consulta manual, no de
  la imagen que se estaba viendo.

## Ahora se busca la última pasada despejada de ESA parcela

Antes de traer la imagen, el sistema pregunta a Copernicus **qué días pasó el
satélite sobre la parcela y qué tan despejada se veía cada vez**, usando la banda
de clasificación de escena (SCL) de Sentinel-2 para descartar nubes, sombras de
nube, cirros y nieve.

Lo importante: **la nubosidad se mide sobre el polígono de la parcela**, no sobre
la escena completa (que cubre unos 110 km). Una escena puede venir marcada como
muy nublada y tener la huerta perfectamente despejada — y al revés. El filtro
anterior (`maxCloudCoverage: 30` sobre la escena) descartaba pasadas buenas solo
porque había nubes a kilómetros de distancia.

Con eso:

1. Se elige la **pasada más reciente con al menos 85% de la parcela despejada**.
2. Se trae la imagen **de ese día exacto** (una sola pasada, ya no un mosaico).
3. Se guarda la **fecha real de captura** y el porcentaje despejado.
4. Si en 60 días no hubo ninguna pasada que llegue al 85% (temporada de lluvias),
   se usa la mejor disponible; y si no hubo ninguna, se cae al mosaico de antes y
   **no se muestra fecha**, para no enseñar una que no corresponde.

El recuadro del Dashboard ahora muestra la fecha real con un icono de satélite, y
al pasar el cursor dice cuánto se veía despejada la parcela ese día.

> La búsqueda de la pasada depende de la parcela, no del índice: en el sync
> semanal se hace **una vez por parcela** y se reutiliza para NDVI, NDRE y NDMI.

## Un problema de fondo que apareció de paso

`parcelSatelliteCache` **no tenía índice único**, así que el `ON DUPLICATE KEY
UPDATE` que usaba el código nunca aplicaba: cada sincronización **insertaba una
fila más** con la imagen en base64 y la tabla crecía sin control. La migración:

1. Depura los duplicados conservando la fila más reciente de cada combinación.
2. Crea el índice único `(parcelId, dataType, indexType, mapDate)`.

Verificado con datos sembrados: de 7 filas con duplicados quedaron las 4
correctas (la imagen más reciente de cada ranura, la de fecha manual y la de la
otra parcela), y a partir de ahí el guardado reemplaza en lugar de duplicar.

## Cambios en la base de datos (automáticos)

- `parcelSatelliteCache.captureDate` — fecha real de la pasada del satélite.
- `parcelSatelliteCache.clearPct` — porcentaje de la parcela despejado ese día.
- Índice único + depuración de duplicados (descrito arriba).

## Despliegue

```bash
git pull && docker-compose up -d --build
```

Las fechas correctas aparecen conforme se refresque el cache: en la
sincronización satelital semanal, o de inmediato al entrar a Análisis de Parcela
(el cache de mapas dura 7 días). Sin cambios en la app móvil.

---

# Décima entrega: refresco satelital automático y comparativo de ciclos

## Por qué seguía apareciendo una foto de 2025

Dos causas, las dos corregidas:

1. **No existía ningún refresco automático.** `syncAllParcels` solo corría si
   alguien apretaba el botón en Configuración. Las imágenes se quedaban tal cual
   hasta que alguien se acordaba de sincronizar.
2. **El Dashboard tomaba la fila más reciente sin importar de qué consulta
   venía.** Si alguien abría Análisis de Parcela pidiendo una fecha vieja, esa
   consulta quedaba como "la más reciente" y **secuestraba la tarjeta**: se veía
   una foto de octubre de 2025 aunque hubiera una imagen nueva guardada.

Ahora el Dashboard lee siempre la ranura `latest`, que es la que mantiene al día
el refresco automático.

## Refresco semanal automático

Nuevo módulo `satelliteAutoSync.ts`:

- Corre **los lunes a la 1:00 AM** (hora de México), justo antes del resumen con
  IA de las 2:00 AM, para que la IA lea datos satelitales frescos.
- Para cada parcela busca la **última pasada despejada** y refresca imagen e
  índices (NDVI, NDRE, NDMI).
- **Se pone al día al arrancar:** si la imagen más nueva tiene más de 8 días
  (por ejemplo si el servidor estuvo apagado el lunes), sincroniza unos minutos
  después de encender. Si están frescas no gasta llamadas a Copernicus.
- Avisa por Telegram igual que la sincronización manual, y el botón de
  Configuración usa exactamente el mismo código.

> Sentinel-2 vuelve a pasar por la misma zona cada ~5 días, así que una vez por
> semana siempre hay material nuevo.

**Al desplegar:** unos 3 minutos después de arrancar el servidor se dispara la
puesta al día y las tarjetas quedan con imagen y fecha nuevas. Si alguna parcela
solo tenía imágenes de consultas manuales, se queda sin foto hasta que termine
esa primera sincronización.

## Comparativo de ciclos en Análisis de Datos

Sección nueva al inicio de Análisis de Datos, independiente del filtro de fechas.

**Lo importante: la comparación se alinea por SEMANA DESDE EL INICIO DE COSECHA
de cada ciclo, no por fecha de calendario.** Cada ciclo poda en un momento
distinto; comparar "agosto contra agosto" no dice nada. Alineando por el arranque
propio de cada ciclo sí se puede responder: *¿voy mejor o peor que el ciclo
pasado a estas alturas?*

Incluye:

- **Ciclo actual vs anterior "a estas alturas"**: kilos acumulados de cada uno
  hasta la semana que lleva el ciclo nuevo, con el porcentaje de diferencia
  arriba o abajo. Aparece en cuanto el ciclo nuevo registre su primera caja.
- **Tarjeta por ciclo**: cajas, kilos, % de primera calidad, kg por caja, fecha
  de poda, fecha de inicio de cosecha y **cuántos días tardó en cosechar tras la
  poda** (muy útil para comparar ciclos entre sí).
- **Gráfica de kilos por semana de cosecha** con una línea por ciclo (el ciclo en
  curso en línea sólida, los anteriores punteados).
- **Kilos por parcela** en cada ciclo, lado a lado.
- **Labores realizadas por ciclo** (riegos, podas, fertilizaciones…), que es lo
  que da contexto a las diferencias de producción.

Verificado con los dos ciclos de la base de prueba: el comparativo calculó bien
la curva alineada (S1, S2…), los días entre poda y cosecha (168 vs 159) y el
desglose por parcela.

## Despliegue

```bash
git pull && docker-compose up -d --build
```

Sin migraciones nuevas ni cambios en la app móvil.

---

# Undécima entrega: menos peticiones al satélite y diagnóstico por zonas para la IA

## Todo se guarda en local; al satélite se le pregunta lo mínimo

La lista de pasadas de cada parcela ahora se **guarda en la base y se reutiliza
72 horas**. Abrir el Dashboard o la vista satelital varias veces ya no genera una
consulta a Copernicus cada vez: solo se vuelve a preguntar cuando la lista vence
o cuando corre el refresco semanal, que sí exige datos frescos.

Verificado: tres consultas seguidas → **una sola petición al satélite**; las otras
dos salieron del cache local. El sync semanal sí fuerza el refresco.

Sentinel-2 repite cada ~5 días, así que con 72 horas nunca se pierde una pasada
nueva. Sumado al refresco de los lunes y al cache de imágenes de 7 días, el
consumo queda acotado.

## La información queda separada por ciclo

Cada captura guardada ahora anota **a qué ciclo de producción pertenece**
(`cycleId`), resuelto por la fecha real de la pasada. Así se sabe si un dato es
del ciclo en curso o todavía del anterior — importante porque una imagen de
agosto puede pertenecer a cualquiera de los dos según cuándo se podó.

Eso se refleja también en lo que lee la IA: cada parcela llega etiquetada como
*"captura 2026-08-05, de este ciclo"* o *"de un ciclo anterior"*.

## La IA ahora sabe DÓNDE se ve seco

Antes recibía un solo número por parcela (*"Micaela: NDVI 0.57"*), que esconde
justo lo que hay que atender: un promedio bueno puede tapar una esquina seca.

Ahora, de cada parcela se calcula el **vigor por zonas**: se baja un raster
pequeño del NDVI y se mide sobre una cuadrícula de 3×3 con los nombres que usaría
cualquiera en el campo (noroeste, norte, noreste, oeste, centro…). A la IA le
llega:

- NDVI promedio, mínimo y máximo.
- **Reparto del terreno por nivel de vigor**: qué % está en suelo/seco (<0.2),
  vigor bajo (0.2-0.4), medio (0.4-0.6) y alto (>0.6).
- **El NDVI de cada zona**, y explícitamente cuál es la más débil y cuál la más
  vigorosa, con la diferencia entre ambas para saber si el lote es parejo.
- Una guía de interpretación del NDVI para higo.
- La lista de **parcelas donde sí se está trabajando**, para que se centre ahí.

Y se le pide un diagnóstico concreto: decir **dónde** (*"el noreste de Micaela
está seco, NDVI 0.18, contra 0.55 del resto"*) y **cruzarlo con las labores**: si
ahí se regó hace poco puede ser falla de riego; si está recién podada, el vigor
bajo es normal y no hay que alarmar. Si el vigor es parejo, que lo diga en vez de
inventar problemas.

El análisis por zonas se calcula **una sola vez por pasada** y se guarda: la IA
lo lee del cache local sin tocar el satélite.

Verificado con un raster de prueba con la esquina noreste seca: detectó el
noreste como zona más débil (0.15 contra 0.62 del resto), calculó el 11.5% del
área como seca, ignoró los píxeles fuera del polígono y marcó el lote como no
uniforme. Y se comprobó que ese detalle llega íntegro al prompt de la IA.

## Cambios en la base de datos (automáticos)

- `parcelSatelliteCache.cycleId` — ciclo al que pertenece cada captura.
- Nuevas ranuras de cache en la misma tabla: `passes` (lista de pasadas) y
  `zones` (vigor por zonas). No hacen falta tablas nuevas.

## Despliegue

```bash
git pull && docker-compose up -d --build
```

El detalle por zonas aparece en el resumen con IA después del primer refresco
satelital (automático al arrancar si las imágenes están vencidas, o desde el
botón de Configuración). Sin cambios en la app móvil.

---

# Duodécima entrega: revisión cada 72 h, historial por parcela e IA que sí conoce la libreta

## Revisión de parcelas cada 72 horas

El refresco pasó de "lunes a la 1 AM" a **cada 72 horas**, y ya no depende del
día de la semana sino de la antigüedad real de los datos:

- **Revisa al arrancar el sistema.** Si los datos tienen menos de 72 horas no
  gasta llamadas; si están vencidos, se pone al día solo.
- Después comprueba cada hora si ya toca. Si el servidor estuvo apagado varios
  días, al volver actualiza sin esperar al lunes.
- Todo se guarda en el servidor: imágenes, índices, vigor por zonas y la lista
  de pasadas.

## Historial de cada parcela

Cada captura nueva se guarda en `parcelSatelliteHistory` (una fila por parcela y
fecha, sin duplicar), con su NDVI, el reparto del terreno, el detalle por zonas,
qué tan despejada se veía y **a qué ciclo pertenece**.

En **Análisis de Parcela → Telemetría Satelital** hay una tarjeta nueva,
*Historial de capturas*: una barra por captura con su NDVI, el % de terreno seco,
la zona más débil de ese día y la nubosidad, **agrupadas por ciclo** y con un
indicador de si el vigor subió o bajó respecto de la captura anterior. Así se ve
la evolución del ciclo, no solo la última foto.

## El análisis de IA de la parcela ahora sí sabe qué se hizo ahí

Antes el prompt solo llevaba los índices espectrales y la cosecha: la IA hablaba
del NDVI sin tener idea de las labores. Ahora recibe, **de esa parcela en
concreto**:

- Ficha: cultivo, variedad, superficie, árboles, densidad, fecha de plantación.
- Ciclo en curso y días transcurridos desde la poda.
- Estado satelital **por zonas** (dónde está débil, dónde vigorosa, si el lote es
  parejo) y la **evolución del vigor** captura tras captura.
- **Libreta de campo de la parcela**: labores realizadas y pendientes, con fecha,
  responsable, horas trabajadas y **productos aplicados con lo planeado contra lo
  realmente usado**.
- **Notas de campo** de la parcela, marcando las que siguen sin resolver.
- Cosecha de la parcela: histórico y la del ciclo actual, semana por semana.
- Clima de los últimos 14 días y pronóstico de los próximos 5.

Y se le pide explícitamente **cruzar el satélite con la libreta**: si una zona
está débil y ahí se regó hace poco, sospechar falla de riego; si la parcela está
recién podada, el vigor bajo es normal y no hay que alarmar; si se aplicó
fertilizante y el NDVI no subió, señalarlo; si se usó menos producto del
planeado, considerarlo.

## Se regenera a diario, pero solo si hay algo nuevo

Cada madrugada (3-5 AM hora de México, después del refresco satelital) se revisan
las parcelas activas y **se regenera solo el análisis de las que tienen
información nueva**: una captura satelital más reciente o movimiento en la
libreta de campo (labores o notas, incluidos borrados). Si nada cambió, no se
gasta una llamada a la IA.

Verificado: primera generación → 1 llamada; repetir sin novedades → 0 llamadas
(devuelve el guardado); al entrar una labor nueva → regenera. Y se comprobó que
el prompt lleva ciclo, zonas, evolución, labores, productos con planeado vs
usado, notas sin resolver y las instrucciones de cruzar todo.

## Cambios en la base de datos (automáticos)

- Tabla `parcelSatelliteHistory` con clave única por parcela y fecha de captura.
- `parcelAiAnalysis`: `cycleId`, `lastCaptureDate` y `lastNotebookStamp` (de qué
  datos salió cada análisis, que es lo que permite no regenerarlo de más).

## Despliegue

```bash
git pull && docker-compose up -d --build
```

Unos 3 minutos después de arrancar se dispara la revisión satelital si toca, y el
historial se va llenando con cada captura. Sin cambios en la app móvil.

---

# Decimotercera entrega: la fecha de la captura, siempre visible en el Dashboard

## Qué pasaba

El sello con la fecha solo aparecía si la imagen guardada traía `captureDate`.
Las imágenes descargadas antes de que existiera ese campo —o las que cayeron al
mosaico de respaldo por no haber pasada despejada— dejaban la esquina **vacía**:
no había forma de saber de cuándo era lo que se estaba viendo.

## Ahora siempre dice de cuándo es

El sello se arma con una cadena de respaldos, sin inventar nunca una fecha:

1. **Fecha real de la pasada** del satélite, si se conoce.
2. Si la imagen no la trae, se busca **la captura más reciente en el historial**
   de esa parcela (lo llena el mismo refresco de 72 horas).
3. Si aún así no hay, se muestra **cuándo se descargó la imagen**, etiquetado
   como "descarga" para no hacerlo pasar por fecha de captura.

Además:

- Se agrega **qué tan reciente es** ("hace 3 días", "ayer", "hoy"), que es lo que
  de verdad se quiere saber de un vistazo.
- Si pasan más de 10 días sin captura nueva, el sello se pone **ámbar** para que
  salte a la vista que el satélite no ha vuelto a ver la parcela.
- Al pasar el cursor se ve el detalle completo: fecha, antigüedad, **qué tan
  despejada se veía la parcela** y **a qué ciclo pertenece** la captura.

Verificado en pantalla con las tres situaciones:

| Parcela | Sello | Color |
|---|---|---|
| Con fecha de pasada | `8 ago 2026 · hace 3 días` (tooltip: 96% despejada, ciclo) | normal |
| Sin fecha en la imagen, con historial | `6 ago 2026 · hace 5 días` | normal |
| Sin fecha alguna | `descarga 2 jul 2026 · hace 40 días` | ámbar |

## Despliegue

```bash
git pull && docker-compose up -d --build
```

Sin migraciones ni cambios en la app móvil.

---

# Decimocuarta entrega: la fecha de la pasada, ahora sí casi siempre

## Qué faltaba

Una parcela mostraba "descarga hoy" pero sin fecha de pasada. Eso significa que
para esa parcela la detección de pasadas no devolvió nada y el sistema cayó al
**mosaico de 15 días**, que por definición no tiene una fecha única. La imagen se
veía bien, pero el dato importante —de cuándo es— se perdía.

Había tres formas de quedarse sin fecha y las tres están cubiertas:

## 1. Segunda fuente: el catálogo de Copernicus

La medición fina de nubosidad se hace sobre el polígono de la parcela con la
banda SCL. Es lo más preciso, pero si falla (polígono con geometría rara, error
del servicio) antes se devolvía una lista vacía y adiós fecha.

Ahora, si esa medición falla **o responde vacía**, se consulta el **catálogo**:
un endpoint distinto y mucho más simple que solo responde "qué escenas cubren
este rectángulo y de qué día son". De ahí sale igual la **fecha real de la
pasada**, aunque la nubosidad sea la de la escena completa y no la de la parcela.
El origen queda registrado para no confundir un dato con el otro.

## 2. Ventana más amplia antes de rendirse

Si en 60 días no aparece ninguna pasada, se busca en **120** antes de darse por
vencido. Más vale una captura algo más vieja pero fechada, que una imagen sin
fecha.

## 3. Varias candidatas, no solo una

Antes se elegía una única pasada y, si el satélite no devolvía imagen para ese
día exacto, se caía al mosaico y se perdía la fecha. Ahora se prueban **hasta 4
pasadas** (primero las despejadas, luego las demás de más a menos despejada)
hasta obtener imagen. El mosaico sin fecha queda como último recurso y se
registra en el log cuando ocurre.

Verificado simulando las cuatro situaciones:

| Situación | Resultado |
|---|---|
| Todo bien | Usa la medición fina sobre la parcela |
| La medición falla (error 400) | Saca la fecha del catálogo |
| La medición responde vacía | Saca la fecha del catálogo |
| Nada en 60 días | Amplía a 120 y encuentra fecha |

Además, en los tres casos con catálogo se descarta la escena nublada (55%) y se
toma la despejada (96%).

## Despliegue

```bash
git pull && docker-compose up -d --build
```

La fecha aparece en cuanto corra la revisión satelital (unos 3 minutos después de
arrancar, o desde el botón de Configuración). En el log de cada parcela se ve la
línea `última pasada AAAA-MM-DD (NN% despejado)`, y si se usó el catálogo lo dice
con "(nubosidad de la escena)". Sin migraciones ni cambios en la app móvil.

---

# Decimoquinta entrega — bitácora de la app, almacén con foto y subida en segundo plano

App **v1.8.0 (versionCode 9)** · base local Room **v7** · migración de servidor **0023**

## 1. Bitácora de la app enviada al servidor

La app ahora deja constancia de lo que pasa en el teléfono y lo sube por lotes:
entradas y salidas de sesión (incluidos los intentos fallidos), qué sección se
abre, cada foto tomada con lo que pesaba y lo que pesa ya comprimida, alta de
notas, actividades, personal y productos, cambios de estado de una nota, y el
resumen de cada sincronización.

Cómo funciona:

- El evento se guarda **primero en el teléfono** (tabla `app_logs`), porque en
  el campo casi nunca hay señal. La subida es posterior y por lotes de 200.
- `clientLogId` es la clave de idempotencia: si el lote se reintenta, el
  servidor no duplica nada. Solo se borran del teléfono los eventos que el
  servidor confirmó haber guardado.
- Se guarda la **hora real del teléfono** (`occurredAt`) además de la de
  recepción: un evento capturado el martes sin señal y subido el jueves se
  muestra con la fecha del martes.
- Todo cae en la misma tabla que ya usaba la web (`userActivityLogs`) con
  `source = 'app'`, así se ve junto y por usuario. En **Usuarios → Actividad**
  cada renglón de la app trae su distintivo 📱, el detalle y el modelo del
  teléfono.
- Red de seguridad: si un teléfono pasa meses sin subir, la bitácora local se
  recorta a los 2 000 eventos más recientes.
- Al cerrar sesión se intenta subir lo pendiente **antes** de borrar el token:
  sin token el servidor ya no sabría de quién eran esos eventos.

Registrar nunca puede tumbar la app: todo va en un hilo aparte y cualquier
error se traga.

## 2. Cuánto se están comprimiendo las fotos

Se midió y se corrigió. El servidor **ya reescalaba** cada foto recibida a
1920 px con calidad 80 antes de guardarla, así que todo lo que el teléfono
subía por encima de eso se tiraba en el servidor: ancho de banda del campo
gastado a cambio de nada.

Ahora la app deja la foto exactamente en ese tamaño. **La evidencia archivada
queda idéntica**; lo único que cambia es lo que viaja por la red.

Medido con una foto de 12 MP (4000×3000) con detalle fino de follaje:

| | Tamaño | Peso por foto | 40 fotos (una jornada) |
|---|---|---|---|
| Antes (8 MP, q80) | 3265×2449 | 1.94 MB | 77.7 MB |
| **Ahora (1920 px, q80)** | 1920×1440 | **449 KB** | **18.0 MB** |
| Ahorro de datos (1280 px, q70) | 1280×960 | 106 KB | 4.2 MB |

**4.3 veces menos** por foto. Además hay un tope duro de 700 KB: si una foto
sigue pesando de más se le baja la calidad por pasos, porque una sola foto
pesada podía tumbar la sincronización completa en una red de campo.

Dónde se ve el número:

- **En la app** (Ajustes): "N fotos · 486 MB → 61 MB · te has ahorrado 425 MB
  (87 % menos)".
- **En la web** (Usuarios → Actividad): la misma cuenta de los últimos 30 días,
  con el promedio por foto y el total ahorrado, sacada de la bitácora.

También se agregó un interruptor **"Ahorro de datos"** en Ajustes para las
cuadrillas con señal muy mala (1280 px / calidad 70). Viene apagado, porque el
tamaño normal ya es el que el servidor conserva.

Las fotos tomadas con versiones anteriores de la app se reducen antes de
subirse si pasan de 900 KB.

## 3. Almacén: foto y edición de productos desde la app

- Tocar un producto abre el formulario de edición, con todos sus datos.
- Se puede editar cualquier producto, **incluidos los creados en la web**: se
  identifican por `serverId`.
- Además del nombre, marca, unidad y tipo, ahora se capturan desde el campo el
  ingrediente activo, la concentración, la presentación, dónde está guardado y
  las notas.
- **Foto del producto**, con cámara o galería. Aquí sí se permite la galería
  (a diferencia de la evidencia de campo, que sigue exigiendo cámara en vivo):
  lo normal es fotografiar la etiqueta o reusar la foto del proveedor. Se
  comprime en el teléfono y se sube a `/api/sync/product-photo`.
- Todo funciona sin señal y sube solo al recuperarla.

Lo importante de la implementación: **el servidor solo toca los campos que el
teléfono manda**. Stock, costos, proveedor, lote y caducidad se capturan en la
oficina y el teléfono ni los conoce; sobrescribirlos con null habría borrado
trabajo. Y si el producto se borró en la web mientras el teléfono estaba sin
señal, el servidor responde `deleted` y la app lo quita en vez de recrearlo a
escondidas.

## 4. Subida en segundo plano con notificación de progreso

Antes, si el usuario salía de la app con fotos a medio subir, la subida seguía
a ciegas y el sistema podía matarla.

Ahora, mientras haya algo pendiente, la sincronización corre **en primer plano**
con una notificación de progreso ("Subiendo 3 de 12"), el sistema no la
interrumpe y al terminar queda un aviso con el resultado:

- "Todo subido ✅ · 4 registros sincronizados · 8 fotos subidas"
- "Subida en curso · 6 fotos sin subir todavía; la app lo sigue intentando"
- "Quedó algo sin subir · <el problema concreto>"

La notificación **solo aparece cuando de verdad había algo que subir**: una por
cada revisión rutinaria (cada 15 minutos) sería puro ruido. Si el usuario niega
el permiso de notificaciones o el fabricante bloquea el primer plano, la
sincronización sigue funcionando igual: solo se queda sin aviso.

Permisos nuevos: `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE` y
`FOREGROUND_SERVICE_DATA_SYNC`.

## Verificaciones

- **Migración de la base del teléfono (v6 → v7)**: se reconstruyó una base v6
  igual a la que traen los teléfonos, se le aplicaron los `ALTER` escritos a
  mano y se comparó columna por columna contra lo que Room espera en la v7. Las
  8 tablas quedan idénticas, así que Room no recrea la base y nadie pierde lo
  capturado sin subir.
- **ENUM de acciones**: comprobado que `schema.ts` y `migrate.cjs` declaran la
  misma lista en el mismo orden y que las 4 acciones originales siguen en las
  posiciones 0-3. MySQL guarda los ENUM por índice: moverlas habría cambiado el
  significado de todo lo ya registrado.
- **Endpoints** (`server/offlineSyncApp.test.ts`, 7 pruebas): alta de producto
  desde el campo; edición de un producto de la web sin tocar stock/costo/
  proveedor/lote; vaciado de un campo; producto borrado en la web; bitácora con
  `source='app'`, dispositivo y hora real; reloj del teléfono corrido; acción
  fuera del catálogo rechazada.
- **Compresión**: medida con la misma librería JPEG y una foto de 12 MP con
  detalle fino (tabla de arriba).
- App compilada (debug y release con R8) y web compilada; `tsc` sigue en 204
  errores previos.

No se pudo probar contra una base MySQL real ni contra el servidor levantado
(no hay Docker ni credenciales de base en este equipo).

## Despliegue

```bash
git pull && docker-compose up -d --build
```

La migración `0023` corre sola al arrancar y es idempotente. Después hay que
publicar el APK v1.8.0 para que los teléfonos reciban la bitácora, la foto de
productos y la notificación de progreso.

---

# Decimosexta entrega — telemetría satelital diaria y comparativo por ciclos

Sin migraciones ni cambios en la app móvil. Solo servidor y web.

## El problema de fondo

Al revisar por qué la pestaña satelital tardaba tanto en abrir apareció un bug
viejo: **el cache satelital nunca funcionaba**. El código leía mal la respuesta
de la base de datos —`drizzle.execute` devuelve `[filas, columnas]` y se estaba
usando el arreglo entero como si fuera una fila—, así que la condición de
"cache encontrado" jamás se cumplía.

Consecuencia: **cada vez que alguien abría Análisis de Parcela se bajaban seis
archivos de Copernicus** (mapa y serie de NDVI, NDRE y NDMI), más hasta ocho
imágenes de la línea de tiempo histórica. Cada visita, de cada usuario.

## 1. El backend busca todos los días; el frontend solo lee

Ahora hay un reparto claro de responsabilidades:

**El servidor** revisa **todos los días** (antes cada 72 h) si el satélite pasó
de nuevo sobre cada parcela. Esa revisión cuesta **una sola consulta por
parcela**. Si la pasada más reciente es la que ya está guardada, **no se
descarga nada** y la parcela se salta entera. Sentinel-2 repite cada ~5 días,
así que la mayoría de los días no hay nada que bajar.

**La pantalla** ya no llama a Copernicus. Un endpoint nuevo (`getTelemetry`)
devuelve todo lo guardado —los tres mapas con su fecha de pasada, las tres
series y el vigor por zonas— en **una sola consulta a la base**.

En la práctica: abrir Análisis de Parcela pasó de **6 descargas satelitales a 0**.

La línea de tiempo histórica quedó plegada por omisión, con un botón para
desplegarla: son fechas sueltas que sí hay que bajar la primera vez, y no tiene
sentido pagarlas cada vez que alguien entra a ver otra cosa.

También se agregó una franja que dice de cuándo es la captura, cuándo se revisó
el servidor y a qué ciclo pertenece, con un botón **"Buscar ahora"** para
forzar la revisión de esa parcela. Y una limpieza automática que tira las
imágenes históricas con más de 90 días sin uso, para que la tabla de cache no
crezca sin fin.

El aviso de Telegram ya no se manda cuando no pasó nada: un mensaje diario
diciendo "sin novedades" solo enseña a ignorar las notificaciones.

## 2. Comparativo por ciclos

La tarjeta nueva de Análisis de Parcela pone un ciclo encima del otro. Lo
importante está en el eje X: **no son fechas del calendario, son días desde que
arrancó el ciclo**. Así el día 90 del ciclo pasado queda justo encima del día 90
del actual y se puede ver cuál venía mejor en el mismo momento del cultivo,
aunque hayan empezado en fechas distintas.

Debajo, una tabla por ciclo con:

- Promedio, máximo y **en qué día del ciclo se alcanzó el pico** de cada índice
- La diferencia contra el ciclo en curso, en verde o rojo
- Capturas satelitales disponibles
- **Cosecha del ciclo** (kg, cajas y días de corte) y **labores registradas**

Se puede cambiar entre NDVI (vigor), NDRE (nitrógeno) y NDMI (humedad).

## 3. La IA de la parcela ahora compara

El análisis por parcela recibe un bloque nuevo que corta el ciclo anterior **en
el mismo día de avance** que lleva el actual. Comparar contra el promedio del
ciclo completo anterior sería tramposo: un ciclo a la mitad siempre perdería.

Con eso el diagnóstico deja de ser "el NDVI está en 0.51" y pasa a ser "va
0.042 arriba de como venía el ciclo pasado a estas alturas, que terminó dando
12,340 kg".

## Verificaciones

`server/parcelTelemetry.test.ts`, 9 pruebas, con Copernicus sustituido por un
doble que cuenta cuántas veces se le llama:

| Prueba | Resultado |
|---|---|
| Abrir la telemetría guardada | 0 llamadas al satélite, 1 sola consulta a la base |
| Parcela sin datos | responde vacío, no revienta |
| **Pasada ya guardada** | **1 consulta para preguntar, 0 descargas** |
| Pasada nueva | 3 series + 3 mapas + vigor, y escribe el historial |
| Refresco a mano (force) | descarga aunque la fecha sea la misma |
| Guardado incompleto | descarga aunque la fecha coincida |
| Reparto por ciclo | cada ciclo se queda con sus capturas, alineadas por día del ciclo |
| Texto comparativo para la IA | corta el ciclo anterior en el mismo día de avance |
| Un solo ciclo con datos | no inventa comparación |

Más las 7 pruebas de la entrega anterior: 16 en total, todas pasan. Web
compilada; `tsc` sigue en los 204 errores previos.

No se pudo probar contra una base MySQL real ni contra Copernicus (no hay
Docker, credenciales de base ni credenciales de CDSE en este equipo).

## Despliegue

```bash
git pull && docker-compose up -d --build
```

Sin migraciones. La primera revisión corre unos 3 minutos después de arrancar y
descargará lo que falte; a partir de ahí solo baja lo que de verdad sea nuevo.
En el log se distingue una cosa de la otra:

- `El Higueral: pasada nueva 2026-08-09 (96% despejado)` → sí descargó
- `El Higueral: sin pasada nueva (la del 2026-08-09 ya estaba)` → no descargó nada
