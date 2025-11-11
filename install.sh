#!/bin/bash

# Script de instalación automatizada para Agra-Tecti Cosecha Inteligente
# Este script instala y configura todo el sistema automáticamente

set -e  # Detener en caso de error

echo "=================================================="
echo "  Instalación de Agra-Tecti Cosecha Inteligente"
echo "=================================================="
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Verificar si Docker está instalado
print_info "Verificando Docker..."
if ! command -v docker &> /dev/null; then
    print_error "Docker no está instalado. Instalando Docker..."
    
    # Actualizar repositorios
    sudo apt update
    
    # Instalar dependencias
    sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
    
    # Agregar clave GPG de Docker
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Agregar repositorio de Docker
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Instalar Docker
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Iniciar Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # Agregar usuario al grupo docker
    sudo usermod -aG docker $USER
    
    print_success "Docker instalado correctamente"
else
    print_success "Docker ya está instalado"
fi

# Verificar si Docker está corriendo
print_info "Verificando servicio de Docker..."
if ! sudo systemctl is-active --quiet docker; then
    print_info "Iniciando Docker..."
    sudo systemctl start docker
fi
print_success "Docker está corriendo"

# Verificar si existe el archivo .env
print_info "Configurando variables de entorno..."
if [ ! -f .env ]; then
    print_info "Creando archivo .env desde .env.example..."
    cp .env.example .env
    
    # Generar JWT_SECRET aleatorio
    JWT_SECRET=$(openssl rand -base64 32)
    MYSQL_PASSWORD=$(openssl rand -base64 16)
    
    # Actualizar .env con valores generados
    sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|g" .env
    sed -i "s|MYSQL_PASSWORD=.*|MYSQL_PASSWORD=$MYSQL_PASSWORD|g" .env
    sed -i "s|MYSQL_ROOT_PASSWORD=.*|MYSQL_ROOT_PASSWORD=$MYSQL_PASSWORD|g" .env
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=mysql://agratec:$MYSQL_PASSWORD@db:3306/agratec|g" .env
    
    print_success "Archivo .env creado con valores seguros"
else
    print_success "Archivo .env ya existe"
fi

# Detener contenedores existentes
print_info "Deteniendo contenedores existentes (si los hay)..."
docker compose down 2>/dev/null || true

# Construir e iniciar contenedores
print_info "Construyendo e iniciando contenedores..."
docker compose up -d --build

print_success "Contenedores iniciados"

# Esperar a que la base de datos esté lista
print_info "Esperando a que la base de datos esté lista..."
sleep 20

# Verificar estado de contenedores
print_info "Verificando estado de contenedores..."
docker compose ps

# Ejecutar migraciones
print_info "Ejecutando migraciones de base de datos..."
docker compose exec -T app pnpm drizzle-kit push <<EOF
yes
EOF

print_success "Migraciones ejecutadas"

# Crear usuario administrador
print_info "Creando usuario administrador..."

# Generar hash de password
ADMIN_PASSWORD="admin123"
ADMIN_HASH=$(docker compose exec -T app node -e "console.log(require('bcryptjs').hashSync('$ADMIN_PASSWORD', 10))")

# Insertar usuario en la base de datos
docker compose exec -T db mysql -u agratec -p$(grep MYSQL_PASSWORD .env | cut -d '=' -f2) agratec <<EOF
INSERT INTO users (name, email, password, role) 
VALUES ('Admin', 'admin@agratec.com', '$ADMIN_HASH', 'admin')
ON DUPLICATE KEY UPDATE password='$ADMIN_HASH';
EOF

print_success "Usuario administrador creado"

echo ""
echo "=================================================="
echo -e "${GREEN}✓ Instalación completada exitosamente!${NC}"
echo "=================================================="
echo ""
echo "Accede a la aplicación en: http://localhost:3000"
echo ""
echo "Credenciales de acceso:"
echo "  Email: admin@agratec.com"
echo "  Password: admin123"
echo ""
echo "IMPORTANTE: Cambia la contraseña después del primer login"
echo ""
echo "Comandos útiles:"
echo "  Ver logs:        docker compose logs -f"
echo "  Detener:         docker compose down"
echo "  Reiniciar:       docker compose restart"
echo "  Ver estado:      docker compose ps"
echo ""
