-- Migración: Cache de datos satelitales
-- Ejecutar en el servidor con:
-- docker exec -i agratec-db mysql -u root -pPuah4ER57qbTWUbQK2u3 agratec < migrations/satellite_cache.sql

CREATE TABLE IF NOT EXISTS parcelSatelliteCache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parcelId INT NOT NULL,
  dataType VARCHAR(16) NOT NULL,
  indexType VARCHAR(8) NOT NULL,
  mapDate VARCHAR(32) NULL,
  data LONGTEXT NOT NULL,
  fromDate VARCHAR(32) NULL,
  toDate VARCHAR(32) NULL,
  fetchedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY uq_cache (parcelId, dataType, indexType, mapDate)
);
