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
