#!/bin/bash

# Script para ejecutar la migración de locationConfig
# Ejecutar desde el directorio raíz del proyecto

echo "🔄 Ejecutando migración de locationConfig..."

# Ejecutar SQL en el contenedor de MySQL sin contraseña (el contenedor ya tiene acceso)
docker compose exec -T db mysql -u root agratec << 'EOF'
CREATE TABLE IF NOT EXISTS `locationConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`locationName` varchar(255) NOT NULL,
	`latitude` varchar(64) NOT NULL,
	`longitude` varchar(64) NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Mexico_City',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `locationConfig_id` PRIMARY KEY(`id`)
);
EOF

if [ $? -eq 0 ]; then
    echo "✅ Migración completada exitosamente"
    echo "📋 Verificando tabla..."
    docker compose exec -T db mysql -u root agratec -e "DESC locationConfig;"
else
    echo "❌ Error en la migración"
    echo ""
    echo "💡 Intenta ejecutar manualmente:"
    echo "   docker compose exec db mysql -u root agratec"
    echo "   Luego ejecuta el SQL de la migración"
    exit 1
fi
