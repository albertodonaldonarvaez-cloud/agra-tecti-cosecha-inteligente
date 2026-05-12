# 📱 Instrucciones — App Android de Campo (Agra Field App)

## Requisitos Previos

| Requisito | Versión Mínima |
|-----------|---------------|
| **Android Studio** | Ladybug (2024.2) o superior |
| **JDK** | 17 (viene incluido en Android Studio) |
| **Android SDK** | API 35 (compileSdk) / API 26 mínimo |
| **Gradle** | 8.7 (wrapper incluido) |
| **Dispositivo/Emulador** | Android 8.0+ (API 26+) |

---

## 📂 Cómo Abrir el Proyecto

1. Abre **Android Studio**
2. Selecciona **File → Open**
3. Navega a la carpeta `android-app/` dentro del repositorio
4. **IMPORTANTE**: Abre la carpeta `android-app/`, NO la raíz del proyecto
5. Android Studio detectará automáticamente el archivo `build.gradle.kts`
6. Espera a que termine la sincronización de Gradle (puede tomar 2-5 minutos la primera vez)
7. Ejecuta en un emulador o dispositivo físico

> ⚠️ **No abras la raíz del proyecto** en Android Studio. El proyecto Android es un módulo independiente dentro de `android-app/`.

---

## 🏗️ Arquitectura Offline-First

### Filosofía

La app sigue el principio **"Local First, Sync Later"**:

```
┌─────────────────────────────────────────────┐
│                USUARIO                       │
│                                              │
│  Crear Nota → Room (SQLite) → isSynced=false │
│  Tomar Foto → Almacenamiento → isSynced=false│
│                                              │
│           ↓ (cuando hay red)                 │
│                                              │
│  WorkManager ← Constraints(CONNECTED)        │
│      ↓                                       │
│  SyncWorker:                                 │
│    1. Lee notas isSynced=false (batch 10)    │
│    2. POST /api/trpc/offlineSync.syncFieldNotes│
│    3. Si 200 OK → isSynced=true              │
│    4. Lee fotos isSynced=false               │
│    5. POST /api/sync/photo (multipart)       │
│    6. Si 200 OK → isSynced=true              │
│    7. Si falla → Result.retry() (backoff)    │
│                                              │
└─────────────────────────────────────────────┘
```

### Componentes Clave

| Componente | Tecnología | Responsabilidad |
|-----------|-----------|----------------|
| **Base de datos local** | Room (SQLite) | Almacenar notas y fotos offline |
| **Capa de red** | Retrofit + OkHttp | Comunicación con el servidor |
| **Sincronización** | WorkManager | Ejecutar sync en background |
| **Autenticación** | EncryptedSharedPreferences | Almacenar JWT de forma segura |
| **Idempotencia** | UUID (folio) | Evitar duplicados en el servidor |

### Flujo de Datos

1. **Sin internet**: El usuario crea notas normalmente. Se guardan en Room con `isSynced = false`. La UI siempre lee de Room, por lo que la experiencia es instantánea.

2. **Con internet**: WorkManager ejecuta `SyncWorker` cada 15 minutos (o inmediatamente al crear una nota). El worker envía las notas pendientes al servidor.

3. **Idempotencia**: Cada nota tiene un `folio` UUID generado en el dispositivo. El servidor usa `INSERT ... ON DUPLICATE KEY UPDATE` para evitar duplicados si el worker se ejecuta dos veces para la misma nota.

4. **Fotos**: Se sincronizan **después** de las notas (la foto necesita que su nota ya exista en el servidor). Se envían una por una via multipart POST.

---

## 🔧 Configuración del Servidor

### Desarrollo Local

Para conectar la app a tu servidor de desarrollo en tu red local:

1. Abre `android-app/app/build.gradle.kts`
2. En el bloque `debug`, descomenta y cambia la IP:

```kotlin
buildTypes {
    debug {
        // Cambiar a la IP de tu máquina en la red local
        buildConfigField("String", "BASE_URL", "\"http://192.168.1.100:3000\"")
    }
}
```

3. **Encontrar tu IP local**:
   - Windows: `ipconfig` → busca "IPv4 Address"
   - macOS/Linux: `ifconfig` o `ip addr`

4. **IMPORTANTE**: No uses `localhost` ni `127.0.0.1` — eso apunta al propio dispositivo Android, no a tu PC.

5. Si usas emulador Android, puedes usar `10.0.2.2` que apunta al host de la máquina.

### Producción

La URL de producción ya está configurada por defecto:

```kotlin
buildConfigField("String", "BASE_URL", "\"https://smart-harvest.tecti-cloud.com\"")
```

Para generar APK de producción:
```bash
cd android-app
./gradlew assembleRelease
```

El APK estará en: `app/build/outputs/apk/release/app-release.apk`

---

## 🧪 Pruebas del SyncWorker

### Probar sin red (simular offline)

1. **En emulador**:
   - Abre el emulador
   - Ve a **Settings → Network & Internet → Wi-Fi** y desactívalo
   - O usa el panel del emulador → **Extended Controls → Cellular → Network Type: No Connection**

2. **En dispositivo físico**:
   - Activa **Modo Avión**

3. **Crear notas offline**:
   - Con la red desactivada, crea varias notas de campo
   - Verifica que aparecen en la lista con indicador "pendiente de sincronizar"

4. **Restaurar conexión**:
   - Activa Wi-Fi / desactiva Modo Avión
   - El `SyncWorker` se activará automáticamente (WorkManager detecta el cambio de red)
   - Verifica en los logs: `adb logcat -s SyncWorker`

### Forzar ejecución del Worker (debug)

Puedes usar `adb` para forzar la ejecución:

```bash
# Listar workers programados
adb shell dumpsys jobscheduler | grep -i agra

# Forzar sync inmediato desde la app (agregar botón temporal si lo necesitas)
```

O desde Android Studio:
1. Ve a **App Inspection → Background Task Inspector**
2. Verás el worker `agra_field_sync` en la lista
3. Puedes cancelarlo o ver su estado

### Verificar en el servidor

Después de sincronizar, verifica que las notas llegaron:

```bash
# En tu servidor
docker exec -it agratec-db mysql -u root -p agratec_db -e "SELECT folio, description, syncSource FROM fieldNotes WHERE syncSource = 'mobile' ORDER BY id DESC LIMIT 10;"
```

---

## 📦 Estructura del Proyecto

```
android-app/
├── build.gradle.kts                    # Configuración raíz
├── settings.gradle.kts                 # Módulos del proyecto
├── gradle.properties                   # Propiedades de Gradle
├── app/
│   ├── build.gradle.kts                # Dependencias del módulo
│   ├── proguard-rules.pro              # Reglas de ofuscación (release)
│   └── src/main/
│       ├── AndroidManifest.xml         # Permisos y actividades
│       ├── java/com/agratec/fieldapp/
│       │   ├── AgraApp.kt             # Application (init WorkManager)
│       │   ├── data/
│       │   │   ├── local/
│       │   │   │   ├── AppDatabase.kt          # Room DB singleton
│       │   │   │   ├── entity/
│       │   │   │   │   ├── FieldNoteEntity.kt  # Nota de campo
│       │   │   │   │   └── PhotoEntity.kt      # Foto asociada
│       │   │   │   └── dao/
│       │   │   │       ├── FieldNoteDao.kt     # Queries de notas
│       │   │   │       └── PhotoDao.kt         # Queries de fotos
│       │   │   ├── remote/
│       │   │   │   ├── ApiService.kt           # Retrofit interface
│       │   │   │   ├── RetrofitClient.kt       # Singleton + auth
│       │   │   │   └── dto/                    # Data Transfer Objects
│       │   │   └── repository/
│       │   │       ├── AuthRepository.kt       # Login/logout
│       │   │       └── FieldNoteRepository.kt  # CRUD + sync status
│       │   ├── sync/
│       │   │   └── SyncWorker.kt               # Background sync
│       │   └── ui/
│       │       └── MainActivity.kt             # Pantalla principal
│       └── res/
│           ├── values/
│           │   ├── strings.xml
│           │   └── themes.xml
│           └── xml/
│               └── file_paths.xml              # FileProvider paths
```

---

## 🔐 Seguridad

- **Token JWT** almacenado con `EncryptedSharedPreferences` (AES-256)
- **Sesión de 30 días** para mantener la app activa en zonas sin cobertura
- **Bearer token** en header `Authorization` (no cookies)
- **cleartext traffic** habilitado solo para desarrollo (HTTP local)
- En producción, toda comunicación va por **HTTPS**

---

## 🚀 Deploy del Backend

El backend ya tiene CI/CD configurado. Solo haz push a `main`:

```bash
git add .
git commit -m "feat: add offline sync support + Android app scaffolding"
git push origin main
```

GitHub Actions:
1. Hace `git pull` en el servidor de producción
2. Ejecuta `docker compose build app`
3. Reinicia con `docker compose up -d --no-deps app`
4. Verifica health check automáticamente
5. Si falla, hace rollback automático

### Migración de Base de Datos

Después del deploy, ejecuta la migración manualmente:

```bash
# En tu servidor
docker exec -it agratec-db mysql -u root -p agratec_db < /app/drizzle/0016_offline_sync_fields.sql
```

O copia y ejecuta el SQL directamente:
```sql
ALTER TABLE `fieldNotes` MODIFY COLUMN `folio` VARCHAR(64) NOT NULL;
ALTER TABLE `fieldNotes` ADD COLUMN `syncSource` ENUM('web', 'telegram', 'mobile') NOT NULL DEFAULT 'web';
ALTER TABLE `fieldNotePhotos` ADD COLUMN `localPhotoId` VARCHAR(64) DEFAULT NULL;
ALTER TABLE `fieldNotePhotos` ADD UNIQUE INDEX `idx_localPhotoId` (`localPhotoId`);
```
