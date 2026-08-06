# Actualización: Ciclos de Producción + Libreta de Campo al frente

**Fecha:** Agosto 2026

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
