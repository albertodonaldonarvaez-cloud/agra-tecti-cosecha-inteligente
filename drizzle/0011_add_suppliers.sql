-- Migración 0011: Catálogo de Proveedores
-- Ejecutar: docker exec -i agratec-db mysql -u root -pPuah4ER57qbTWUbQK2u3 agratec < drizzle/0011_add_suppliers.sql

-- ===== CATÁLOGO DE PROVEEDORES =====
CREATE TABLE IF NOT EXISTS warehouseSuppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyName VARCHAR(255) NOT NULL,
  contactName VARCHAR(255),
  phone VARCHAR(50),
  phone2 VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(255),
  rfc VARCHAR(20),
  address TEXT,
  city VARCHAR(128),
  state VARCHAR(128),
  postalCode VARCHAR(10),
  category ENUM(
    'fertilizantes', 'agroquimicos', 'semillas', 'herramientas', 'maquinaria',
    'riego', 'empaques', 'servicios', 'combustible', 'otro'
  ) NOT NULL DEFAULT 'otro',
  productsOffered TEXT,
  paymentTerms VARCHAR(255),
  bankAccount VARCHAR(255),
  notes TEXT,
  rating INT,
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_category (category),
  INDEX idx_active (isActive)
);

-- ===== AGREGAR supplierId A warehouseProducts =====
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouseProducts' AND COLUMN_NAME = 'supplierId');
SET @sql = IF(@col = 0, 'ALTER TABLE warehouseProducts ADD COLUMN supplierId INT AFTER costPerUnit', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
