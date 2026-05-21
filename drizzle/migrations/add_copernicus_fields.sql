-- Migration: Add Copernicus CDSE credentials to apiConfig
-- Safe for production: nullable columns only, no data loss
ALTER TABLE `apiConfig` ADD COLUMN `copernicusClientId` VARCHAR(256) NULL;
ALTER TABLE `apiConfig` ADD COLUMN `copernicusClientSecret` VARCHAR(1024) NULL;
