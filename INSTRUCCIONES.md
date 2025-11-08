# Dashboard de Cosecha de Higo - Agratec

## Descripción

Dashboard completo para la gestión de cosecha de higo con conexión a la API de KoboToolbox. Incluye autenticación de usuarios, visualización de datos con gráficas, gestión de cajas, cortadoras y análisis de calidad.

## Características Principales

### 🎨 Diseño Liquid Glass
- Interfaz moderna con efectos de transparencia y desenfoque (backdrop-blur)
- Paleta de colores verde inspirada en el logo de Agratec
- Barra de navegación flotante en la parte inferior
- Animaciones suaves y transiciones

### 📊 Dashboard Principal
- Resumen de cosecha con estadísticas en tiempo real
- Total de cajas registradas
- Peso total acumulado
- Distribución de calidad (Primera, Segunda, Desperdicio)
- Gráficas de barras con porcentajes

### 📦 Gestión de Cajas
- Vista de lista con todas las cajas registradas
- Previsualización de imágenes
- Información detallada: código, peso, parcela, cortadora, fecha
- Filtrado y búsqueda

### 🔧 Configuración (Solo Administradores)

#### API de KoboToolbox
- Configurar URL de la API
- Token de autenticación
- Asset ID del formulario
- Sincronización automática de datos
- Carga manual de archivos JSON

#### Gestión de Cortadoras
- Asignar nombres personalizados a cortadoras
- Identificación de categorías especiales:
  - **97**: Recolecta (Primera Calidad)
  - **98**: Segunda Calidad
  - **99**: Desperdicio

#### Gestión de Usuarios
- Listar todos los usuarios registrados
- Cambiar roles (Usuario / Administrador)
- Control de acceso basado en roles

## Sistema de Calidad

El sistema clasifica las cajas según el número de cortadora:

- **Números 01-96**: Cortadoras regulares (Primera Calidad)
- **Número 97**: Recolecta - Primera calidad sin cortadora específica
- **Número 98**: Segunda Calidad
- **Número 99**: Desperdicio

## Formato de Datos

### Código de Caja
Formato: `XX-XXXXXX`
- Primeros 2 dígitos: Número de cortadora
- Últimos 6 dígitos: Número único de caja

### Estructura JSON de KoboToolbox
```json
{
  "results": [
    {
      "_id": 448,
      "escanea_la_parcela": "367 -EL CHATO",
      "escanea_la_caja": "99-001359",
      "peso_de_la_caja": "2.065",
      "foto_de_la_caja": "1762199768151.jpg",
      "_submission_time": "2025-11-04T00:50:18",
      "_attachments": [...]
    }
  ]
}
```

## Primeros Pasos

### 1. Iniciar Sesión
- Al acceder al dashboard, serás redirigido a la página de login de Manus
- Inicia sesión con tu cuenta

### 2. Configurar API (Solo Admin)
1. Ve a la sección **Configuración** (icono de engranaje)
2. Completa los campos:
   - URL de la API: `https://kf.kobotoolbox.org` (o tu servidor)
   - Token de API: Tu token de KoboToolbox
   - Asset ID: ID de tu formulario
3. Haz clic en **Guardar Configuración**

### 3. Sincronizar Datos
- En la misma página de Configuración, haz clic en **Sincronizar Datos**
- El sistema descargará automáticamente todos los registros de KoboToolbox
- Las imágenes se cargarán directamente desde la API

### 4. Carga Manual (Alternativa)
Si prefieres cargar datos manualmente:
1. Exporta los datos desde KoboToolbox en formato JSON
2. Ve a **Configuración** > **Carga Manual de JSON**
3. Pega el contenido JSON
4. Haz clic en **Cargar JSON**

### 5. Personalizar Cortadoras (Solo Admin)
1. Ve a la sección **Cortadoras** (icono de tijeras)
2. Asigna nombres personalizados a cada cortadora
3. Haz clic en el icono de guardar

### 6. Gestionar Usuarios (Solo Admin)
1. Ve a la sección **Usuarios** (icono de personas)
2. Cambia el rol de usuarios entre "Usuario" y "Admin"
3. Los usuarios regulares solo pueden ver datos, no modificarlos

## Datos de Prueba

Se incluye un archivo `test-data.json` con datos de ejemplo que puedes usar para probar el sistema:

1. Ve a **Configuración**
2. Copia el contenido de `test-data.json`
3. Pégalo en **Carga Manual de JSON**
4. Haz clic en **Cargar JSON**

## Navegación

La barra flotante inferior contiene:

### Para Todos los Usuarios:
- 📊 **Dashboard**: Vista principal con estadísticas
- 📦 **Cajas**: Lista de todas las cajas

### Solo para Administradores:
- ✂️ **Cortadoras**: Configuración de nombres
- 👥 **Usuarios**: Gestión de usuarios
- ⚙️ **Configuración**: API y sincronización

## Tecnologías Utilizadas

- **Frontend**: React 19 + TypeScript
- **Estilos**: Tailwind CSS 4
- **Backend**: Node.js + Express + tRPC
- **Base de Datos**: MySQL/TiDB
- **Autenticación**: Manus OAuth
- **ORM**: Drizzle

## Soporte

Para cualquier problema o pregunta, contacta al equipo de desarrollo de Agratec.
