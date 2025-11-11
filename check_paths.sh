#!/bin/bash
echo "=== Verificando rutas en el contenedor ==="
docker compose exec app ls -la /app/ | head -20
echo ""
echo "=== Verificando /app/dist ==="
docker compose exec app ls -la /app/dist/ 2>/dev/null || echo "No existe /app/dist"
echo ""
echo "=== Verificando /app/server/_core ==="
docker compose exec app ls -la /app/server/_core/ | head -10
echo ""
echo "=== Verificando /app/server/_core/public ==="
docker compose exec app ls -la /app/server/_core/public/ 2>/dev/null || echo "No existe /app/server/_core/public"
