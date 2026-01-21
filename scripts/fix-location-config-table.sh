#!/bin/bash

echo "🔄 Recreando tabla locationConfig..."

# Obtener la contraseña de root desde las variables de entorno
source .env 2>/dev/null || true

if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    echo "⚠️  MYSQL_ROOT_PASSWORD no encontrada en .env, usando valor por defecto"
    MYSQL_ROOT_PASSWORD="rootpassword"
fi

# Ejecutar SQL para eliminar y recrear la tabla
docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" agratec << 'EOF'

-- Eliminar tabla si existe
DROP TABLE IF EXISTS `locationConfig`;

-- Recrear tabla con estructura correcta
CREATE TABLE `locationConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`locationName` varchar(255) NOT NULL,
	`latitude` varchar(64) NOT NULL,
	`longitude` varchar(64) NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Mexico_City',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `locationConfig_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verificar que se creó correctamente
DESC locationConfig;

SELECT 'Tabla locationConfig recreada exitosamente' AS status;

EOF

if [ $? -eq 0 ]; then
    echo "✅ Tabla locationConfig recreada exitosamente"
else
    echo "❌ Error al recrear la tabla"
    echo "💡 Intenta ejecutar manualmente:"
    echo "   docker compose exec -T db mysql -u root -p\$MYSQL_ROOT_PASSWORD agratec"
    exit 1
fi
