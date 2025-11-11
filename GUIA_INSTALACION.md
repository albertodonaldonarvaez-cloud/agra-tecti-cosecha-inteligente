# Guía de Instalación y Deployment

## Sistema Agra-Tecti Cosecha Inteligente

Esta guía proporciona instrucciones detalladas para instalar y configurar el sistema de gestión de cosecha con las nuevas funcionalidades implementadas.

---

## 📋 Requisitos Previos

El sistema utiliza **Docker** para simplificar la instalación y garantizar la consistencia del entorno. Asegúrate de tener instalado:

- **Docker** (versión 20.10 o superior)
- **Docker Compose** (versión 2.0 o superior)
- **Git** para clonar el repositorio

---

## 🚀 Instalación Rápida con Docker

### 1. Clonar el Repositorio

```bash
git clone https://github.com/albertodonaldonarvaez-cloud/agra-tecti-cosecha-inteligente.git
cd agra-tecti-cosecha-inteligente
```

### 2. Configurar Variables de Entorno

Copia el archivo de ejemplo y configura tus credenciales:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus valores:

```env
# Base de Datos
DATABASE_URL=mysql://agratec:tu_password_seguro@db:3306/agratec

# JWT Secret (genera uno único)
JWT_SECRET=tu_jwt_secret_muy_seguro_aqui

# Entorno
NODE_ENV=production

# Puerto (opcional, por defecto 3000)
PORT=3000
```

### 3. Iniciar los Servicios

```bash
docker-compose up -d
```

Este comando iniciará:
- **Base de datos MySQL** en el puerto 3306
- **Aplicación web** en el puerto 3000

### 4. Ejecutar Migraciones de Base de Datos

```bash
docker-compose exec app pnpm drizzle-kit push
```

### 5. Crear Usuario Administrador

Accede al contenedor y ejecuta el script de creación de usuario:

```bash
docker-compose exec app pnpm tsx scripts/create-admin.ts
```

O crea manualmente desde la consola de MySQL:

```bash
docker-compose exec db mysql -u agratec -p agratec
```

```sql
INSERT INTO users (name, email, password, role) 
VALUES ('Admin', 'admin@agratec.com', '$2a$10$hashedpassword', 'admin');
```

### 6. Acceder a la Aplicación

Abre tu navegador en: **http://localhost:3000**

Credenciales por defecto:
- **Email**: admin@agratec.com
- **Contraseña**: La que configuraste

---

## 🔧 Configuración Post-Instalación

### 1. Configurar API de KoboToolbox

Una vez dentro de la aplicación como administrador:

1. Ve a **Configuración** (icono de engranaje)
2. En la sección **API de KoboToolbox**, ingresa:
   - **URL de la API**: `https://kf.kobotoolbox.org` (o tu instancia)
   - **Token de API**: Tu token de KoboToolbox
   - **Asset ID**: El ID de tu formulario
3. Haz clic en **Guardar Configuración**

### 2. Configurar Google Maps API (Opcional)

Para habilitar los mapas en el modal de cajas:

1. Obtén una API Key de Google Maps en: https://console.cloud.google.com/
2. Agrega la API Key en el archivo `client/index.html`:

```html
<script src="https://maps.googleapis.com/maps/api/js?key=TU_API_KEY"></script>
```

3. Reinicia el contenedor:

```bash
docker-compose restart app
```

### 3. Crear Directorio de Fotos

El sistema descarga fotos desde KoboToolbox. Asegúrate de que el directorio exista:

```bash
docker-compose exec app mkdir -p /app/photos
docker-compose exec app chmod 755 /app/photos
```

---

## 📊 Uso del Sistema

### Gestión de Parcelas

1. **Crear Parcelas Manualmente**:
   - Ve a **Parcelas** (icono de mapa)
   - Haz clic en **Nueva Parcela**
   - Ingresa código y nombre

2. **Cargar Parcelas desde KML/KMZ**:
   - Ve a **Parcelas**
   - Haz clic en **Cargar KML/KMZ**
   - Selecciona tu archivo con polígonos
   - El sistema extraerá automáticamente las parcelas y sus coordenadas

### Carga de Datos desde Excel

1. **Preparar Archivo Excel**:
   - El archivo debe tener las siguientes columnas:
     - `Escanea la parcela`: Formato "CODIGO - NOMBRE"
     - `Escanea la caja`: Formato "XX-XXXXXX"
     - `Peso de la caja`: Peso en kilogramos
     - `foto de la caja de primera_URL`: URL de la foto
     - `_Pon tu ubicación_latitude`: Latitud GPS
     - `_Pon tu ubicación_longitude`: Longitud GPS
     - `año`, `mes`, `dia`: Fecha de registro

2. **Cargar Archivo**:
   - Ve a **Configuración**
   - En la sección **Carga desde Excel**
   - Selecciona tu archivo .xlsx
   - Marca/desmarca **Descargar fotos desde la API**
   - Haz clic en **Cargar Excel**

3. **Revisar Errores**:
   - Si hay errores, ve a **Errores** (icono de alerta)
   - Revisa los errores por tipo:
     - Cajas duplicadas
     - Parcelas inválidas
     - Datos faltantes
     - Errores de formato
     - Errores de descarga de fotos
   - Marca errores como resueltos o elimínalos

### Visualización de Cajas

1. Ve a **Cajas** para ver todas las cajas registradas
2. Haz clic en cualquier fila para ver el detalle
3. El modal mostrará:
   - Foto de la caja
   - Peso y clasificación
   - Parcela y cortadora
   - **Mapa interactivo** con la ubicación GPS
   - Fecha de registro

---

## 🔄 Actualización del Sistema

Para actualizar a la última versión:

```bash
# Detener servicios
docker-compose down

# Actualizar código
git pull origin main

# Reconstruir imágenes
docker-compose build

# Iniciar servicios
docker-compose up -d

# Ejecutar nuevas migraciones
docker-compose exec app pnpm drizzle-kit push
```

---

## 🛠️ Mantenimiento

### Ver Logs

```bash
# Logs de la aplicación
docker-compose logs -f app

# Logs de la base de datos
docker-compose logs -f db
```

### Backup de Base de Datos

```bash
# Crear backup
docker-compose exec db mysqldump -u agratec -p agratec > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker-compose exec -T db mysql -u agratec -p agratec < backup_20251110.sql
```

### Limpiar Datos

Para limpiar todas las cajas (útil para volver a sincronizar):

1. Ve a **Configuración**
2. En la sección **Zona de Peligro**
3. Haz clic en **Limpiar Todas las Cajas**
4. Confirma la acción

---

## 🐛 Solución de Problemas

### Error de Conexión a Base de Datos

```bash
# Verificar que la BD esté corriendo
docker-compose ps

# Reiniciar servicios
docker-compose restart db app
```

### Error al Cargar Excel

1. Verifica que la configuración de API esté completa
2. Revisa que las parcelas estén creadas y activas
3. Consulta la página de **Errores** para detalles específicos

### Fotos No Se Descargan

1. Verifica el token de API de KoboToolbox
2. Asegúrate de que el directorio `/app/photos` tenga permisos de escritura
3. Revisa los logs: `docker-compose logs -f app`

---

## 📚 Estructura del Proyecto

```
agra-tecti-cosecha-inteligente/
├── client/                 # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── pages/         # Páginas de la aplicación
│   │   ├── components/    # Componentes reutilizables
│   │   └── lib/           # Utilidades y configuración
├── server/                # Backend (Express + tRPC)
│   ├── routers.ts         # Definición de endpoints
│   ├── db.ts              # Funciones de base de datos
│   ├── excelProcessor.ts  # Procesador de Excel
│   ├── kmlParser.ts       # Parser de KML/KMZ
│   └── photoDownloader.ts # Descargador de fotos
├── drizzle/               # Migraciones de base de datos
│   └── schema.ts          # Esquema de tablas
├── docker-compose.yml     # Configuración de Docker
└── .env.example           # Variables de entorno de ejemplo
```

---

## 🔐 Seguridad

### Recomendaciones de Producción

1. **Cambiar contraseñas por defecto**:
   - Base de datos
   - Usuario administrador
   - JWT Secret

2. **Configurar HTTPS**:
   - Usar un proxy reverso como Nginx
   - Obtener certificado SSL (Let's Encrypt)

3. **Limitar acceso a la base de datos**:
   - No exponer el puerto 3306 públicamente
   - Usar firewall para restringir acceso

4. **Backups automáticos**:
   - Configurar cron job para backups diarios
   - Almacenar backups en ubicación segura

---

## 📞 Soporte

Para reportar problemas o solicitar ayuda:

- **GitHub Issues**: https://github.com/albertodonaldonarvaez-cloud/agra-tecti-cosecha-inteligente/issues
- **Email**: soporte@agratec.com

---

## 📄 Licencia

Este proyecto es propiedad de Agra-Tecti. Todos los derechos reservados.
