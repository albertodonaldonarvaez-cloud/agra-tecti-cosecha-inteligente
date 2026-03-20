-- Migración 0010: Almacén de Productos y Herramientas
-- Ejecutar: docker exec -i agratec-db mysql -u root -pPuah4ER57qbTWUbQK2u3 agratec < drizzle/0010_add_warehouse.sql

-- ===== CATÁLOGO DE PRODUCTOS (ALMACÉN) =====
CREATE TABLE IF NOT EXISTS warehouseProducts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(255),
  category ENUM(
    'fertilizante_granular', 'fertilizante_liquido', 'fertilizante_foliar', 'fertilizante_organico',
    'herbicida_preemergente', 'herbicida_postemergente', 'herbicida_selectivo', 'herbicida_no_selectivo',
    'insecticida', 'fungicida', 'acaricida', 'nematicida',
    'regulador_crecimiento', 'bioestimulante', 'enmienda_suelo', 'nutriente_foliar',
    'semilla', 'sustrato', 'agua', 'otro'
  ) NOT NULL DEFAULT 'otro',
  description TEXT,
  activeIngredient VARCHAR(255),
  concentration VARCHAR(128),
  presentation VARCHAR(128),
  unit ENUM('kg', 'g', 'lt', 'ml', 'ton', 'bulto', 'saco', 'unidad', 'otro') NOT NULL DEFAULT 'kg',
  currentStock DECIMAL(12,2) NOT NULL DEFAULT 0,
  minimumStock DECIMAL(12,2) DEFAULT 0,
  costPerUnit DECIMAL(12,2),
  supplier VARCHAR(255),
  supplierContact VARCHAR(255),
  lotNumber VARCHAR(128),
  expirationDate DATE,
  storageLocation VARCHAR(255),
  photoUrl TEXT,
  safetyDataSheet TEXT,
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdByUserId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);

-- ===== MOVIMIENTOS DE INVENTARIO DE PRODUCTOS =====
CREATE TABLE IF NOT EXISTS warehouseProductMovements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  productId INT NOT NULL,
  movementType ENUM('entrada', 'salida', 'ajuste', 'devolucion') NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  previousStock DECIMAL(12,2) NOT NULL,
  newStock DECIMAL(12,2) NOT NULL,
  reason VARCHAR(512),
  relatedActivityId INT,
  invoiceNumber VARCHAR(128),
  supplier VARCHAR(255),
  costPerUnit DECIMAL(12,2),
  totalCost DECIMAL(12,2),
  performedByUserId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_product (productId),
  INDEX idx_activity (relatedActivityId),
  INDEX idx_date (createdAt)
);

-- ===== CATÁLOGO DE HERRAMIENTAS/EQUIPOS =====
CREATE TABLE IF NOT EXISTS warehouseTools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category ENUM(
    'tractor', 'aspersora_manual', 'aspersora_motorizada', 'bomba_riego',
    'sistema_goteo', 'motosierra', 'tijera_poda', 'machete',
    'azadon', 'rastrillo', 'desbrozadora', 'fumigadora', 'drone',
    'vehiculo', 'medicion', 'proteccion', 'transporte', 'otro'
  ) NOT NULL DEFAULT 'otro',
  brand VARCHAR(255),
  model VARCHAR(255),
  serialNumber VARCHAR(255),
  description TEXT,
  status ENUM('disponible', 'en_uso', 'mantenimiento', 'dañado', 'baja') NOT NULL DEFAULT 'disponible',
  conditionState ENUM('nuevo', 'bueno', 'regular', 'malo') NOT NULL DEFAULT 'bueno',
  acquisitionDate DATE,
  acquisitionCost DECIMAL(12,2),
  currentValue DECIMAL(12,2),
  storageLocation VARCHAR(255),
  assignedTo VARCHAR(255),
  lastMaintenanceDate DATE,
  nextMaintenanceDate DATE,
  maintenanceNotes TEXT,
  photoUrl TEXT,
  quantity INT NOT NULL DEFAULT 1,
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdByUserId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);

-- ===== HISTORIAL DE USO/ASIGNACIÓN DE HERRAMIENTAS =====
CREATE TABLE IF NOT EXISTS warehouseToolAssignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  toolId INT NOT NULL,
  assignmentType ENUM('asignacion', 'devolucion', 'mantenimiento', 'baja') NOT NULL,
  assignedTo VARCHAR(255),
  relatedActivityId INT,
  notes TEXT,
  performedByUserId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_tool (toolId),
  INDEX idx_activity (relatedActivityId),
  INDEX idx_date (createdAt)
);

-- ===== PERMISO PARA VER ALMACENES =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS canViewWarehouse BOOLEAN NOT NULL DEFAULT TRUE;
-- Dar acceso a todos los usuarios
UPDATE users SET canViewWarehouse = TRUE;

-- ===== AGREGAR productId a fieldActivityProducts para vincular con almacén =====
ALTER TABLE fieldActivityProducts ADD COLUMN IF NOT EXISTS warehouseProductId INT;

-- ===== AGREGAR toolId a fieldActivityTools para vincular con almacén =====
ALTER TABLE fieldActivityTools ADD COLUMN IF NOT EXISTS warehouseToolId INT;

-- ===== PERMISO PARA LIBRETA DE CAMPO =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS canViewFieldNotebook BOOLEAN NOT NULL DEFAULT TRUE;
