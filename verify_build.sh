#!/bin/bash
echo "=== Verificando archivos del build del cliente ==="
docker compose exec app ls -lh /app/server/_core/public/assets/ 2>/dev/null | head -10
echo ""
echo "=== Verificando index.html ==="
docker compose exec app cat /app/server/_core/public/index.html | head -30
