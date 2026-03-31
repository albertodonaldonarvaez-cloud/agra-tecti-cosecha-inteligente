#!/bin/sh
# Entrypoint: asegurar que los directorios de fotos existan y tengan permisos correctos
# Esto es necesario porque los volúmenes montados desde el host pueden no tener
# los permisos del usuario agratec (UID 1001)

# Crear subdirectorios necesarios si no existen
mkdir -p /app/photos/field-notes /app/photos/warehouse/products /tmp/uploads

# Iniciar la aplicación
exec pnpm start
