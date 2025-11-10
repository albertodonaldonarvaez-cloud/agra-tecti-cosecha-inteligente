# 📦 Guía Completa de Instalación - Dashboard de Cosecha Agratec

Esta guía proporciona instrucciones detalladas para instalar y configurar el Dashboard de Cosecha de Higo en diferentes entornos.

## 📑 Tabla de Contenidos

1. [Instalación con Docker (Recomendado)](#instalación-con-docker-recomendado)
2. [Instalación Manual (Sin Docker)](#instalación-manual-sin-docker)
3. [Configuración de Variables de Entorno](#configuración-de-variables-de-entorno)
4. [Configuración de Base de Datos](#configuración-de-base-de-datos)
5. [Integración con KoboToolbox](#integración-con-kobootoolbox)
6. [Solución de Problemas](#solución-de-problemas)

---

## 🐳 Instalación con Docker (Recomendado)

Docker simplifica el proceso de instalación al encapsular todas las dependencias en contenedores.

### Requisitos Previos

- **Docker** >= 20.10 ([Instalar Docker](https://docs.docker.com/get-docker/))
- **Docker Compose** >= 2.0 ([Instalar Docker Compose](https://docs.docker.com/compose/install/))
- **Git** >= 2.30

### Paso 1: Clonar el Repositorio

```bash
git clone https://github.com/tu-usuario/agratec-dashboard.git
cd agratec-dashboard
```

### Paso 2: Configurar Variables de Entorno

Copia el archivo de ejemplo y edítalo con tus credenciales:

```bash
cp .env.example .env
nano .env  # o usa tu editor preferido
```

**Variables mínimas requeridas:**

```env
# Base de datos
MYSQL_ROOT_PASSWORD=password_root_muy_seguro
MYSQL_DATABASE=agratec_db
MYSQL_USER=agratec_user
MYSQL_PASSWORD=password_usuario_seguro

# Aplicación
DATABASE_URL=mysql://agratec_user:password_usuario_seguro@db:3306/agratec_db
JWT_SECRET=tu_jwt_secret_aleatorio_de_al_menos_32_caracteres
NODE_ENV=production

# OAuth (Manus)
VITE_APP_ID=tu_app_id_de_manus
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
OWNER_OPEN_ID=tu_owner_open_id
OWNER_NAME=Tu Nombre Completo

# Configuración básica
VITE_APP_TITLE=Agratec - Dashboard de Cosecha
VITE_APP_LOGO=/logo.svg
```

> **💡 Tip:** Genera un JWT_SECRET seguro con: `openssl rand -base64 32`

### Paso 3: Construir e Iniciar los Contenedores

```bash
# Construir las imágenes
docker-compose build

# Iniciar los servicios en segundo plano
docker-compose up -d
```

### Paso 4: Verificar que los Servicios Estén Corriendo

```bash
docker-compose ps
```

Deberías ver algo como:

```
NAME                IMAGE                    STATUS
agratec-dashboard   agratec-dashboard:latest Up 2 minutes (healthy)
agratec-db          mysql:8.0                Up 2 minutes (healthy)
```

### Paso 5: Ejecutar Migraciones de Base de Datos

```bash
docker-compose exec app pnpm db:push
```

Este comando creará todas las tablas necesarias en la base de datos.

### Paso 6: Verificar la Instalación

Abre tu navegador y visita: **http://localhost:3000**

Deberías ver la página de inicio de sesión del Dashboard de Cosecha.

### Paso 7: Ver Logs (Opcional)

Para monitorear la aplicación:

```bash
# Ver logs de todos los servicios
docker-compose logs -f

# Ver solo logs de la aplicación
docker-compose logs -f app

# Ver solo logs de la base de datos
docker-compose logs -f db
```

---

## 💻 Instalación Manual (Sin Docker)

Si prefieres no usar Docker, puedes instalar el proyecto manualmente.

### Requisitos Previos

- **Node.js** >= 22.0 ([Descargar Node.js](https://nodejs.org/))
- **pnpm** >= 10.0 (Instalar con: `npm install -g pnpm`)
- **MySQL** >= 8.0 o **TiDB** ([Instalar MySQL](https://dev.mysql.com/downloads/))
- **Git** >= 2.30

### Paso 1: Clonar el Repositorio

```bash
git clone https://github.com/tu-usuario/agratec-dashboard.git
cd agratec-dashboard
```

### Paso 2: Instalar Dependencias

```bash
pnpm install
```

### Paso 3: Configurar Base de Datos MySQL

Inicia sesión en MySQL y crea la base de datos:

```bash
mysql -u root -p
```

```sql
CREATE DATABASE agratec_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'agratec_user'@'localhost' IDENTIFIED BY 'tu_password_seguro';
GRANT ALL PRIVILEGES ON agratec_db.* TO 'agratec_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Paso 4: Configurar Variables de Entorno

```bash
cp .env.example .env
nano .env
```

Actualiza la URL de la base de datos para apuntar a tu instalación local:

```env
DATABASE_URL=mysql://agratec_user:tu_password_seguro@localhost:3306/agratec_db
```

### Paso 5: Ejecutar Migraciones

```bash
pnpm db:push
```

### Paso 6: Construir la Aplicación

```bash
pnpm build
```

### Paso 7: Iniciar el Servidor

```bash
pnpm start
```

La aplicación estará disponible en: **http://localhost:3000**

### Modo Desarrollo (Opcional)

Para desarrollo con hot-reload:

```bash
pnpm dev
```

---

## ⚙️ Configuración de Variables de Entorno

### Variables de Base de Datos

```env
# URL de conexión completa
DATABASE_URL=mysql://usuario:password@host:puerto/nombre_db

# Para Docker Compose (usa el nombre del servicio como host)
DATABASE_URL=mysql://agratec_user:password@db:3306/agratec_db

# Para instalación local
DATABASE_URL=mysql://agratec_user:password@localhost:3306/agratec_db

# Para TiDB Cloud
DATABASE_URL=mysql://usuario:password@gateway01.us-west-2.prod.aws.tidbcloud.com:4000/agratec_db?ssl={"rejectUnauthorized":true}
```

### Variables de Autenticación

```env
# Secreto para firmar tokens JWT (mínimo 32 caracteres)
JWT_SECRET=tu_secreto_aleatorio_muy_largo_y_seguro_aqui

# ID de la aplicación en Manus
VITE_APP_ID=tu_app_id

# URL del servidor OAuth
OAUTH_SERVER_URL=https://api.manus.im

# URL del portal de login
VITE_OAUTH_PORTAL_URL=https://portal.manus.im

# OpenID del propietario (administrador)
OWNER_OPEN_ID=tu_owner_open_id

# Nombre del propietario
OWNER_NAME=Tu Nombre
```

### Variables de Aplicación

```env
# Entorno de ejecución
NODE_ENV=production  # o 'development'

# Título de la aplicación
VITE_APP_TITLE=Agratec - Dashboard de Cosecha

# Logo de la aplicación (ruta relativa a /public)
VITE_APP_LOGO=/logo.svg
```

### Variables de APIs Externas (Opcional)

```env
# Manus Forge API (para LLM, storage, etc.)
BUILT_IN_FORGE_API_URL=https://forge.manus.im
BUILT_IN_FORGE_API_KEY=tu_api_key_backend
VITE_FRONTEND_FORGE_API_KEY=tu_api_key_frontend
VITE_FRONTEND_FORGE_API_URL=https://forge.manus.im

# Analytics (opcional)
VITE_ANALYTICS_ENDPOINT=https://analytics.example.com
VITE_ANALYTICS_WEBSITE_ID=tu_website_id
```

---

## 🗄️ Configuración de Base de Datos

### Opción 1: MySQL Local

**Instalación en Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install mysql-server
sudo mysql_secure_installation
```

**Instalación en macOS (con Homebrew):**

```bash
brew install mysql
brew services start mysql
```

**Instalación en Windows:**

Descarga el instalador desde [MySQL Downloads](https://dev.mysql.com/downloads/installer/)

### Opción 2: TiDB Cloud (Recomendado para Producción)

TiDB es compatible con MySQL y ofrece escalabilidad horizontal.

1. Crea una cuenta en [TiDB Cloud](https://tidbcloud.com/)
2. Crea un nuevo cluster
3. Obtén la cadena de conexión
4. Actualiza `DATABASE_URL` en `.env`

Ejemplo de cadena de conexión para TiDB:

```env
DATABASE_URL=mysql://usuario:password@gateway01.us-west-2.prod.aws.tidbcloud.com:4000/agratec_db?ssl={"rejectUnauthorized":true}
```

### Opción 3: MySQL en Docker (Incluido en docker-compose.yml)

Si usas Docker Compose, MySQL ya está configurado automáticamente. No necesitas instalación adicional.

### Verificar Conexión a la Base de Datos

```bash
# Con Docker
docker-compose exec db mysql -u agratec_user -p agratec_db

# Sin Docker
mysql -u agratec_user -p agratec_db
```

---

## 📲 Integración con KoboToolbox

KoboToolbox se usa para capturar datos de cosecha en campo mediante dispositivos móviles.

### Paso 1: Crear Cuenta en KoboToolbox

1. Visita [KoboToolbox](https://www.kobotoolbox.org/)
2. Crea una cuenta gratuita
3. Inicia sesión

### Paso 2: Crear un Formulario de Cosecha

El formulario debe incluir los siguientes campos:

- **Código de caja** (texto, formato: XX-XXXXXX)
- **Número de cortadora** (entero)
- **Código de parcela** (texto)
- **Nombre de parcela** (texto)
- **Peso** (decimal, en kilogramos)
- **Fotografía** (imagen)
- **Ubicación GPS** (geopoint)
- **Fecha de cosecha** (fecha)

### Paso 3: Obtener Credenciales de API

1. En KoboToolbox, ve a **Settings** → **API**
2. Copia tu **API Token**
3. Copia el **Asset ID** de tu formulario (aparece en la URL)

### Paso 4: Configurar en el Dashboard

1. Inicia sesión en el Dashboard como administrador
2. Ve a **Configuración** → **Integración KoboToolbox**
3. Ingresa:
   - **API URL**: `https://kf.kobotoolbox.org/api/v2`
   - **API Token**: Tu token de KoboToolbox
   - **Asset ID**: El ID de tu formulario
4. Guarda la configuración

### Paso 5: Probar la Sincronización

1. Envía un formulario de prueba desde la app móvil de KoboToolbox
2. En el Dashboard, ve a **Sincronización** → **Sincronizar Ahora**
3. Verifica que los datos aparezcan en **Cajas Registradas**

---

## 🔧 Solución de Problemas

### Problema: El contenedor de la aplicación no inicia

**Solución:**

```bash
# Ver logs detallados
docker-compose logs app

# Reconstruir la imagen
docker-compose build --no-cache app
docker-compose up -d
```

### Problema: Error de conexión a la base de datos

**Síntomas:** `Error: connect ECONNREFUSED` o `Access denied for user`

**Solución:**

1. Verifica que el contenedor de MySQL esté corriendo:
   ```bash
   docker-compose ps db
   ```

2. Verifica las credenciales en `.env`:
   ```bash
   cat .env | grep DATABASE_URL
   ```

3. Reinicia el servicio de base de datos:
   ```bash
   docker-compose restart db
   ```

### Problema: Las migraciones fallan

**Solución:**

```bash
# Eliminar y recrear la base de datos
docker-compose down -v
docker-compose up -d
docker-compose exec app pnpm db:push
```

### Problema: Puerto 3000 ya está en uso

**Solución:**

Edita `docker-compose.yml` y cambia el puerto:

```yaml
services:
  app:
    ports:
      - "8080:3000"  # Usa el puerto 8080 en lugar de 3000
```

Luego reinicia:

```bash
docker-compose down
docker-compose up -d
```

### Problema: Las imágenes de KoboToolbox no se cargan

**Solución:**

1. Verifica que el proxy de imágenes esté configurado correctamente
2. Comprueba que las URLs de las imágenes sean accesibles
3. Revisa los logs para errores de CORS:
   ```bash
   docker-compose logs -f app | grep CORS
   ```

### Problema: Fechas incorrectas (un día de diferencia)

**Solución:**

El sistema maneja automáticamente la zona horaria de México. Si ves fechas incorrectas:

1. Verifica que las fechas en KoboToolbox estén en el formato correcto
2. Recarga los datos con el script de corrección de zona horaria

### Problema: Permisos denegados en Linux

**Solución:**

```bash
# Agregar tu usuario al grupo docker
sudo usermod -aG docker $USER

# Cerrar sesión y volver a iniciar
# O ejecutar:
newgrp docker
```

### Problema: Memoria insuficiente en Docker

**Solución:**

Aumenta la memoria asignada a Docker:

- **Docker Desktop (Windows/Mac)**: Settings → Resources → Memory (mínimo 4GB)
- **Linux**: Edita `/etc/docker/daemon.json`

### Obtener Ayuda Adicional

Si ninguna de estas soluciones funciona:

1. Revisa los [Issues en GitHub](https://github.com/tu-usuario/agratec-dashboard/issues)
2. Abre un nuevo issue con:
   - Descripción del problema
   - Logs relevantes (`docker-compose logs`)
   - Sistema operativo y versión de Docker
   - Pasos para reproducir el error

---

## 🎯 Próximos Pasos

Una vez instalado exitosamente:

1. [Configurar usuarios y permisos](./docs/USER_MANAGEMENT.md)
2. [Personalizar el dashboard](./docs/CUSTOMIZATION.md)
3. [Configurar backups automáticos](./docs/BACKUP.md)
4. [Desplegar en producción](./docs/DEPLOYMENT.md)

---

¿Necesitas ayuda? Abre un [issue en GitHub](https://github.com/tu-usuario/agratec-dashboard/issues) o contacta al equipo de soporte.
