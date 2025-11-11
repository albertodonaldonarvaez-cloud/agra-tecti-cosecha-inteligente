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

# Construir la aplicación cliente (Vite)
RUN pnpm run build:client

# ===== Etapa de producción =====
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

# Crear usuario no-root para seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 agratec

# Copiar dependencias de producción
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente del servidor
COPY --chown=agratec:nodejs server ./server
COPY --chown=agratec:nodejs drizzle ./drizzle
COPY --chown=agratec:nodejs shared ./shared

# Copiar build del cliente
COPY --from=builder --chown=agratec:nodejs /app/client/dist ./client/dist

# Copiar archivos de configuración
COPY --chown=agratec:nodejs package.json ./
COPY --chown=agratec:nodejs tsconfig.json ./

# Crear directorio para fotos descargadas
RUN mkdir -p /app/photos && chown -R agratec:nodejs /app/photos

# Cambiar al usuario no-root
USER agratec

# Exponer puerto 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Comando para iniciar la aplicación
CMD ["pnpm", "start"]
