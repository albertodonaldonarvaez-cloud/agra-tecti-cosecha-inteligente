#!/bin/bash

echo "🔄 Recreando tabla locationConfig..."

# Ejecutar SQL para eliminar y recrear la tabla
docker compose exec db mysql -u root agratec << 'EOF'

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
    exit 1
fi
