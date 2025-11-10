# 🌱 Dashboard de Cosecha de Higo - Agratec

Sistema integral de gestión y análisis de cosecha de higo desarrollado para Agratec. Permite el registro, seguimiento y análisis de datos de cosecha en tiempo real con integración a KoboToolbox.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-22.x-green.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

## ✨ Características Principales

### 📊 Dashboard Interactivo
- Visualización en tiempo real de estadísticas de cosecha
- Métricas de productividad por cortadora y parcela
- Gráficas de calidad de producto (primera, segunda, desperdicio)
- Indicadores de peso total y número de cajas procesadas

### 📈 Análisis de Datos
- Filtros por rango de fechas personalizables
- Estadísticas por parcela con desglose de calidad
- Estadísticas por cortadora con métricas de productividad
- Análisis diario detallado día por día
- Visualización de tendencias y patrones de cosecha

### 📦 Gestión de Cajas
- Registro completo de cada caja cosechada
- Fotografías de cajas con proxy de imágenes de KoboToolbox
- Ubicación GPS de cada punto de cosecha
- Trazabilidad completa (cortadora, parcela, fecha, peso, calidad)

### 🔄 Sincronización Automática
- Integración con KoboToolbox para captura de datos en campo
- Sincronización automática de datos
- Carga manual de datos desde archivos Excel/JSON
- Manejo inteligente de zona horaria (México)

## 🛠️ Tecnologías Utilizadas

### Frontend
- **React 19** - Biblioteca de interfaz de usuario
- **TypeScript** - Tipado estático
- **Tailwind CSS 4** - Framework de estilos
- **shadcn/ui** - Componentes de UI
- **Recharts** - Gráficas y visualizaciones
- **tRPC** - Type-safe API calls
- **Wouter** - Enrutamiento ligero

### Backend
- **Node.js 22** - Runtime de JavaScript
- **Express 4** - Framework web
- **tRPC 11** - Type-safe API
- **Drizzle ORM** - ORM para base de datos
- **MySQL/TiDB** - Base de datos relacional
- **JWT** - Autenticación

### DevOps
- **Docker** - Containerización
- **Docker Compose** - Orquestación de servicios
- **pnpm** - Gestor de paquetes
- **Vite** - Build tool

## 📋 Requisitos Previos

- **Docker** >= 20.10
- **Docker Compose** >= 2.0
- **Git** >= 2.30

O para instalación sin Docker:
- **Node.js** >= 22.0
- **pnpm** >= 10.0
- **MySQL** >= 8.0

## 🚀 Instalación Rápida con Docker

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/agratec-dashboard.git
cd agratec-dashboard
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:

```env
# Base de datos
MYSQL_ROOT_PASSWORD=tu_password_seguro
MYSQL_DATABASE=agratec_db
MYSQL_USER=agratec_user
MYSQL_PASSWORD=tu_password_db

# Aplicación
DATABASE_URL=mysql://agratec_user:tu_password_db@db:3306/agratec_db
JWT_SECRET=tu_jwt_secret_muy_seguro_aqui
NODE_ENV=production

# OAuth y Autenticación (Manus)
VITE_APP_ID=tu_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
OWNER_OPEN_ID=tu_owner_open_id
OWNER_NAME=Tu Nombre

# Configuración de la aplicación
VITE_APP_TITLE=Agratec - Dashboard de Cosecha
VITE_APP_LOGO=/logo.svg

# APIs de Manus (opcional)
BUILT_IN_FORGE_API_URL=https://forge.manus.im
BUILT_IN_FORGE_API_KEY=tu_forge_api_key
VITE_FRONTEND_FORGE_API_KEY=tu_frontend_forge_key
VITE_FRONTEND_FORGE_API_URL=https://forge.manus.im

# Analytics (opcional)
VITE_ANALYTICS_ENDPOINT=tu_analytics_endpoint
VITE_ANALYTICS_WEBSITE_ID=tu_website_id
```

### 3. Iniciar los servicios

```bash
docker-compose up -d
```

### 4. Ejecutar migraciones de base de datos

```bash
docker-compose exec app pnpm db:push
```

### 5. Acceder a la aplicación

Abre tu navegador en: **http://localhost:3000**

## 📖 Documentación Completa

Para instrucciones detalladas de instalación, configuración y uso, consulta:

- [**INSTALL.md**](./INSTALL.md) - Guía completa de instalación
- [**docs/CONFIGURATION.md**](./docs/CONFIGURATION.md) - Configuración avanzada
- [**docs/API.md**](./docs/API.md) - Documentación de API
- [**docs/DEPLOYMENT.md**](./docs/DEPLOYMENT.md) - Guía de despliegue en producción

## 🗂️ Estructura del Proyecto

```
agratec-dashboard/
├── client/                 # Aplicación frontend (React + Vite)
│   ├── public/            # Archivos estáticos
│   ├── src/
│   │   ├── components/    # Componentes reutilizables
│   │   ├── pages/         # Páginas de la aplicación
│   │   ├── lib/           # Utilidades y configuración
│   │   └── contexts/      # Contextos de React
├── server/                # Aplicación backend (Express + tRPC)
│   ├── _core/             # Núcleo del servidor
│   ├── db.ts              # Funciones de base de datos
│   ├── routers.ts         # Rutas de tRPC
│   └── koboSync.ts        # Sincronización con KoboToolbox
├── drizzle/               # Esquemas y migraciones de BD
│   └── schema.ts          # Definición de tablas
├── shared/                # Código compartido
├── storage/               # Integración con S3
├── docker-compose.yml     # Orquestación de servicios
├── Dockerfile             # Imagen de Docker
└── package.json           # Dependencias del proyecto
```

## 🔧 Comandos Útiles

### Desarrollo

```bash
# Iniciar en modo desarrollo
pnpm dev

# Verificar tipos de TypeScript
pnpm check

# Formatear código
pnpm format

# Ejecutar tests
pnpm test
```

### Docker

```bash
# Ver logs de la aplicación
docker-compose logs -f app

# Ver logs de la base de datos
docker-compose logs -f db

# Reiniciar servicios
docker-compose restart

# Detener servicios
docker-compose down

# Detener y eliminar volúmenes
docker-compose down -v
```

### Base de Datos

```bash
# Generar y aplicar migraciones
docker-compose exec app pnpm db:push

# Acceder a MySQL
docker-compose exec db mysql -u agratec_user -p agratec_db
```

## 📊 Carga de Datos

### Desde KoboToolbox (Automático)

El sistema se sincroniza automáticamente con KoboToolbox. Configura las credenciales en la interfaz de administración.

### Desde Excel/JSON (Manual)

1. Prepara tu archivo Excel con las columnas requeridas
2. Accede a la sección de "Sincronización Manual"
3. Sube el archivo y confirma la importación

## 🔐 Seguridad

- Autenticación mediante JWT
- Contraseñas hasheadas con bcrypt
- Variables de entorno para secretos
- Usuario no-root en contenedor Docker
- Health checks para monitoreo

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo [LICENSE](LICENSE) para más detalles.

## 👥 Autores

- **Agratec Team** - Desarrollo y mantenimiento

## 🙏 Agradecimientos

- KoboToolbox por la plataforma de captura de datos
- Manus por la infraestructura de autenticación
- Comunidad de código abierto por las herramientas utilizadas

## 📞 Soporte

Para reportar bugs o solicitar features, por favor abre un [issue](https://github.com/tu-usuario/agratec-dashboard/issues).

---

Hecho con ❤️ por Agratec
