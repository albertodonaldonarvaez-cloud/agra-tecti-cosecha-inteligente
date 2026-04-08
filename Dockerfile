# Dockerfile para Dashboard de Cosecha de Higo - Agratec
# Imagen base con Node.js 22
FROM node:22-alpine AS base

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache libc6-compat curl

WORKDIR /app

# Copiar archivos de configuración de pnpm
COPY package.json pnpm-lock.yaml ./

# Copiar patches necesarios para pnpm
COPY patches ./patches

# Instalar pnpm globalmente
RUN npm install -g pnpm

# ===== Etapa de dependencias =====
FROM base AS deps

# Instalar dependencias de producción y desarrollo
RUN pnpm install --frozen-lockfile

# ===== Etapa de construcción =====
FROM base AS builder

# Copiar dependencias instaladas
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente
COPY . .

# Variables de entorno necesarias para el build
ENV NODE_ENV=production

# Construir la aplicación completa (cliente y servidor)
RUN pnpm run build

# ===== Etapa de producción =====
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

# Versión de la app (se pasa como build arg desde CI/CD o docker-compose)
ARG APP_VERSION=unknown
ENV APP_VERSION=$APP_VERSION

# Copiar dependencias de producción
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente del servidor
COPY server ./server
COPY drizzle ./drizzle
COPY shared ./shared

# Copiar build del servidor compilado
COPY --from=builder /app/dist/index.js ./dist/index.js

# Copiar build del cliente al directorio correcto para producción
# En producción, server/_core/vite.ts busca en path.resolve(import.meta.dirname, "public")
# que se traduce a /app/server/_core/public
COPY --from=builder /app/dist/public ./server/_core/public

# Copiar archivos de configuración
COPY package.json ./
COPY tsconfig.json ./
COPY drizzle.config.ts ./

# Copiar entrypoint
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Crear directorios para fotos y uploads temporales
RUN mkdir -p /app/photos/field-notes /app/photos/warehouse/products /tmp/uploads

# Exponer puerto 3000
EXPOSE 3000

# Señal de parada para graceful shutdown
# Docker enviará SIGTERM y esperará stop_grace_period antes de SIGKILL
STOPSIGNAL SIGTERM

# Health check — Docker verifica que el servidor esté respondiendo
# Intervalo: cada 30s | Timeout: 10s | Inicio: esperar 40s | Reintentos: 3
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Usar entrypoint que asegura permisos de directorios montados
ENTRYPOINT ["./entrypoint.sh"]
