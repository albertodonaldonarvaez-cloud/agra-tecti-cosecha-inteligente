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
