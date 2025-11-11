# Instalación Rápida - Agra-Tecti Cosecha Inteligente

## 🚀 Instalación Automática (Recomendada)

### Opción 1: Script de Instalación Automática

```bash
# 1. Clonar el repositorio
git clone https://github.com/albertodonaldonarvaez-cloud/agra-tecti-cosecha-inteligente.git
cd agra-tecti-cosecha-inteligente

# 2. Ejecutar el script de instalación
./install.sh
```

El script instalará automáticamente:
- ✅ Docker (si no está instalado)
- ✅ Configuración de variables de entorno
- ✅ Construcción de contenedores
- ✅ Migraciones de base de datos
- ✅ Usuario administrador

**Acceso:**
- URL: http://localhost:3000
- Email: admin@agratec.com
- Password: admin123

---

## 📝 Instalación Manual

### Paso 1: Actualizar Código

```bash
cd ~/agra-tecti-cosecha-inteligente
git pull origin main
```

### Paso 2: Limpiar Contenedores Anteriores

```bash
docker compose down -v
docker system prune -f
```

### Paso 3: Construir e Iniciar

```bash
docker compose up -d --build
```

### Paso 4: Ver Logs

```bash
docker compose logs -f
```

Deberías ver:
```
agratec-dashboard  | Server running on http://0.0.0.0:3000
agratec-db         | ready for connections
```

### Paso 5: Ejecutar Migraciones

```bash
# Esperar 15 segundos para que la BD esté lista
sleep 15

# Ejecutar migraciones
docker compose exec app pnpm drizzle-kit push
```

Cuando pregunte, escribe `yes` y presiona Enter.

### Paso 6: Crear Usuario Administrador

```bash
# Generar hash de password
ADMIN_HASH=$(docker compose exec app node -e "console.log(require('bcryptjs').hashSync('admin123', 10))")

# Obtener password de MySQL del .env
MYSQL_PASS=$(grep MYSQL_PASSWORD .env | cut -d '=' -f2)

# Crear usuario
docker compose exec db mysql -u agratec -p$MYSQL_PASS agratec -e "
INSERT INTO users (name, email, password, role) 
VALUES ('Admin', 'admin@agratec.com', '$ADMIN_HASH', 'admin')
ON DUPLICATE KEY UPDATE password='$ADMIN_HASH';
"
```

---

## 🔧 Solución de Problemas

### Error: "Connection refused" al ejecutar docker compose

**Solución:**
```bash
# Iniciar Docker
sudo systemctl start docker
sudo systemctl enable docker

# Agregar usuario al grupo docker
sudo usermod -aG docker $USER
newgrp docker
```

### Error: "patches/wouter@3.7.1.patch not found"

**Solución:** Ya está corregido en la última versión. Ejecuta:
```bash
git pull origin main
docker compose up -d --build
```

### Error: "storage directory not found"

**Solución:** Ya está corregido en la última versión. Ejecuta:
```bash
git pull origin main
docker compose up -d --build
```

### Ver logs de errores

```bash
# Logs de la aplicación
docker compose logs -f app

# Logs de la base de datos
docker compose logs -f db

# Logs de todos los servicios
docker compose logs -f
```

### Reiniciar todo desde cero

```bash
# Detener y eliminar todo
docker compose down -v
docker system prune -af

# Volver a construir
docker compose up -d --build

# Ejecutar migraciones
sleep 15
docker compose exec app pnpm drizzle-kit push
```

---

## 📊 Verificar Instalación

### 1. Verificar que los contenedores estén corriendo

```bash
docker compose ps
```

Deberías ver:
```
NAME                STATUS              PORTS
agratec-dashboard   Up                 0.0.0.0:3000->3000/tcp
agratec-db          Up (healthy)       3306/tcp
```

### 2. Verificar logs

```bash
docker compose logs app | tail -20
```

Deberías ver:
```
Server running on http://0.0.0.0:3000
```

### 3. Verificar base de datos

```bash
docker compose exec db mysql -u agratec -p -e "SHOW DATABASES;"
```

Deberías ver la base de datos `agratec`.

### 4. Verificar tablas

```bash
docker compose exec db mysql -u agratec -p agratec -e "SHOW TABLES;"
```

Deberías ver:
- apiConfig
- boxes
- harvesters
- parcels
- uploadBatches
- uploadErrors
- users

---

## 🌐 Acceso Remoto

Si instalaste en un servidor remoto:

### 1. Abrir puerto en firewall

```bash
sudo ufw allow 3000/tcp
```

### 2. Acceder desde navegador

```
http://IP_DEL_SERVIDOR:3000
```

### 3. Configurar dominio (opcional)

Usa Nginx como proxy reverso:

```bash
sudo apt install nginx

# Crear configuración
sudo nano /etc/nginx/sites-available/agratec
```

Contenido:
```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activar:
```bash
sudo ln -s /etc/nginx/sites-available/agratec /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 📚 Documentación Adicional

- **Guía de Instalación Completa:** [GUIA_INSTALACION.md](GUIA_INSTALACION.md)
- **Cambios Realizados:** [CAMBIOS_REALIZADOS.md](CAMBIOS_REALIZADOS.md)
- **Uso del Sistema:** Ver sección de configuración en la aplicación

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa los logs: `docker compose logs -f`
2. Verifica el estado: `docker compose ps`
3. Consulta la documentación completa
4. Abre un issue en GitHub

---

## ✅ Checklist Post-Instalación

- [ ] Contenedores corriendo (`docker compose ps`)
- [ ] Aplicación accesible en http://localhost:3000
- [ ] Login exitoso con admin@agratec.com
- [ ] Cambiar contraseña del administrador
- [ ] Configurar API de KoboToolbox en Settings
- [ ] Cargar parcelas (manual o desde KML/KMZ)
- [ ] Probar carga de Excel

---

**¡Listo! Tu sistema está instalado y funcionando.** 🎉
