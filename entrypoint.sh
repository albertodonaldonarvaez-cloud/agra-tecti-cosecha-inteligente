#!/bin/sh
# Entrypoint: migraciones automáticas + inicio de la aplicación

# Crear subdirectorios necesarios si no existen
mkdir -p /app/photos/field-notes /app/photos/warehouse/products /app/photos/sync-uploads /tmp/uploads
# Carpeta de las fotos descargadas de KoboToolbox (vive en el volumen ./photos)
mkdir -p "${PHOTOS_DIR:-/app/photos}/kobo"

# Ejecutar migraciones pendientes (archivo .cjs para evitar ESM)
echo "[Entrypoint] Ejecutando migraciones de base de datos..."
node migrate.cjs

# Iniciar la aplicación
exec pnpm start
