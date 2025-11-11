# Configuración de Nginx para Dashboard Agratec

Esta guía te ayudará a configurar Nginx como proxy reverso para el Dashboard de Agratec.

## Requisitos Previos

- Nginx instalado en tu servidor
- Dashboard corriendo en Docker en el puerto 3000
- Acceso root o sudo en el servidor

---

## Paso 1: Instalar Nginx (si no está instalado)

```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Paso 2: Configurar Nginx

### Opción A: Configuración Básica (HTTP)

```bash
# Copiar archivo de ejemplo
sudo cp nginx.conf.example /etc/nginx/sites-available/agratec

# Editar el archivo
sudo nano /etc/nginx/sites-available/agratec
```

**Cambios necesarios:**
- Reemplaza `tu-dominio.com` con tu dominio real o IP pública
- Verifica que el puerto 3000 coincida con el puerto de tu contenedor Docker

```bash
# Crear enlace simbólico
sudo ln -s /etc/nginx/sites-available/agratec /etc/nginx/sites-enabled/

# Eliminar configuración por defecto (opcional)
sudo rm /etc/nginx/sites-enabled/default

# Verificar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

---

## Paso 3: Configurar Firewall

```bash
# Permitir tráfico HTTP y HTTPS
sudo ufw allow 'Nginx Full'

# O específicamente:
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Verificar estado
sudo ufw status
```

---

## Paso 4: Configurar HTTPS con Let's Encrypt (Recomendado)

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtener certificado SSL
sudo certbot --nginx -d tu-dominio.com

# Certbot configurará automáticamente Nginx para HTTPS
# Sigue las instrucciones en pantalla
```

---

## Configuraciones Importantes para Subida de Archivos

El archivo de configuración incluye estas directivas críticas:

### 1. Límite de Tamaño de Archivos
```nginx
client_max_body_size 50M;
client_body_buffer_size 50M;
```

### 2. Timeouts Extendidos
```nginx
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
```

Estos valores son necesarios porque:
- Los archivos Excel pueden ser grandes (hasta 50MB)
- El procesamiento de Excel con descarga de fotos puede tardar varios minutos
- Sin estos timeouts, Nginx cortará la conexión prematuramente

---

## Verificación

### 1. Verificar que Nginx está corriendo
```bash
sudo systemctl status nginx
```

### 2. Verificar que el Dashboard está accesible
```bash
curl -I http://tu-dominio.com
```

Deberías ver una respuesta `200 OK` o `304 Not Modified`.

### 3. Verificar logs de Nginx
```bash
# Logs de acceso
sudo tail -f /var/log/nginx/agratec_access.log

# Logs de errores
sudo tail -f /var/log/nginx/agratec_error.log
```

---

## Solución de Problemas

### Problema: "502 Bad Gateway"
**Causa:** El contenedor Docker no está corriendo o no está escuchando en el puerto 3000.

**Solución:**
```bash
# Verificar que el contenedor está corriendo
docker compose ps

# Ver logs del contenedor
docker compose logs app

# Reiniciar contenedor
docker compose restart app
```

### Problema: "413 Request Entity Too Large"
**Causa:** El archivo Excel es muy grande y Nginx lo rechaza.

**Solución:**
```bash
# Editar configuración de Nginx
sudo nano /etc/nginx/sites-available/agratec

# Aumentar client_max_body_size
client_max_body_size 100M;

# Reiniciar Nginx
sudo systemctl restart nginx
```

### Problema: "504 Gateway Timeout"
**Causa:** El procesamiento del Excel tarda más de lo que Nginx espera.

**Solución:**
```bash
# Editar configuración de Nginx
sudo nano /etc/nginx/sites-available/agratec

# Aumentar timeouts
proxy_read_timeout 600s;
send_timeout 600s;

# Reiniciar Nginx
sudo systemctl restart nginx
```

### Problema: Cookies no se guardan (login no funciona)
**Causa:** Configuración incorrecta de headers.

**Solución:**
Asegúrate de que tu configuración incluye:
```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

---

## Comandos Útiles

```bash
# Reiniciar Nginx
sudo systemctl restart nginx

# Recargar configuración sin reiniciar
sudo systemctl reload nginx

# Verificar sintaxis de configuración
sudo nginx -t

# Ver estado de Nginx
sudo systemctl status nginx

# Ver logs en tiempo real
sudo tail -f /var/log/nginx/agratec_access.log
sudo tail -f /var/log/nginx/agratec_error.log
```

---

## Configuración Adicional Recomendada

### 1. Compresión Gzip
Agrega esto en el bloque `server`:
```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;
```

### 2. Rate Limiting (Protección contra abuso)
Agrega esto antes del bloque `server`:
```nginx
limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=5r/m;

# Luego en location /api/upload-excel
location /api/upload-excel {
    limit_req zone=upload_limit burst=2;
    # ... resto de la configuración
}
```

### 3. Headers de Seguridad
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
```

---

## Soporte

Si encuentras problemas, verifica:
1. Logs de Nginx: `/var/log/nginx/agratec_error.log`
2. Logs del contenedor: `docker compose logs app`
3. Estado del firewall: `sudo ufw status`
4. Conectividad: `curl -I http://localhost:3000` (desde el servidor)
