#!/bin/bash
# ============================================
# DEPLOY SCRIPT — Agra-Tecti Cosecha Inteligente
# Uso: ./scripts/deploy.sh
# Ejecutar desde el directorio raíz del proyecto en el servidor
# ============================================

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    🌿 Agra-Tecti Deploy Script     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════╝${NC}"
echo -e "${BLUE}📅 $(date)${NC}"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "docker-compose.yml" ]; then
  echo -e "${RED}❌ Error: docker-compose.yml no encontrado.${NC}"
  echo -e "${RED}   Ejecuta este script desde el directorio raíz del proyecto.${NC}"
  exit 1
fi

# Verificar que estamos en la rama main
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${YELLOW}⚠️  No estás en la rama main (actual: $CURRENT_BRANCH)${NC}"
  read -p "¿Continuar de todas formas? (s/N): " CONFIRM
  if [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "S" ]; then
    echo "Deploy cancelado."
    exit 0
  fi
fi

# Guardar commit actual para rollback
PREV_COMMIT=$(git rev-parse HEAD)
echo -e "${BLUE}📌 Commit actual (rollback): ${PREV_COMMIT:0:8}${NC}"

# Pull últimos cambios
echo -e "${BLUE}📥 Pulling cambios...${NC}"
git fetch origin main
git reset --hard origin/main

NEW_COMMIT=$(git rev-parse HEAD)
echo -e "${BLUE}📌 Nuevo commit: ${NEW_COMMIT:0:8}${NC}"

if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
  echo -e "${GREEN}✅ Ya estás en el commit más reciente. No hay cambios que desplegar.${NC}"
  exit 0
fi

# Mostrar cambios
echo ""
echo -e "${BLUE}📋 Cambios a desplegar:${NC}"
git log --oneline "${PREV_COMMIT}..${NEW_COMMIT}" | head -20
echo ""

# Build
echo -e "${BLUE}🏗️  Rebuilding Docker image...${NC}"
docker compose build app

# Deploy con zero-downtime
echo -e "${BLUE}🔄 Reiniciando servicio...${NC}"
docker compose up -d --no-deps app

# Health check
echo -e "${BLUE}⏳ Verificando health check...${NC}"
HEALTH_OK=false
for i in $(seq 1 12); do
  sleep 5
  RESPONSE=$(curl -sf http://localhost:3000/api/health 2>/dev/null || echo "")
  if [ -n "$RESPONSE" ]; then
    STATUS=$(echo "$RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ "$STATUS" = "ok" ]; then
      HEALTH_OK=true
      echo -e "${GREEN}✅ Health check OK después de $((i * 5))s${NC}"
      echo -e "${GREEN}   Response: $RESPONSE${NC}"
      break
    fi
  fi
  echo -e "${YELLOW}⏳ Intento $i/12 — esperando...${NC}"
done

if [ "$HEALTH_OK" = false ]; then
  echo ""
  echo -e "${RED}╔════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ❌ HEALTH CHECK FALLÓ — ROLLBACK  ║${NC}"
  echo -e "${RED}╚════════════════════════════════════╝${NC}"
  echo -e "${RED}🔙 Restaurando commit: ${PREV_COMMIT:0:8}${NC}"
  
  git reset --hard "$PREV_COMMIT"
  docker compose build app
  docker compose up -d --no-deps app
  
  echo -e "${YELLOW}⏳ Esperando rollback health check...${NC}"
  for i in $(seq 1 12); do
    sleep 5
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
      echo -e "${GREEN}✅ Rollback exitoso — servicio restaurado${NC}"
      break
    fi
  done
  
  echo -e "${RED}❌ Deploy falló. Producción restaurada al commit anterior.${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    🎉 DEPLOY EXITOSO!              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════╝${NC}"
echo -e "${GREEN}Commit: ${NEW_COMMIT:0:8}${NC}"
echo -e "${GREEN}Fecha: $(date)${NC}"
echo ""
