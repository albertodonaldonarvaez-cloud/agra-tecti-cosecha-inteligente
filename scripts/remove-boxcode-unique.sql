-- Script para eliminar la restricción UNIQUE del campo boxCode
-- Esto permite que existan códigos de caja repetidos de diferentes días/horas

-- Primero verificar si existe el índice
-- El nombre del índice puede variar, así que intentamos los nombres más comunes

-- Opción 1: Si el índice se llama 'boxCode'
DROP INDEX IF EXISTS `boxCode` ON `boxes`;

-- Opción 2: Si el índice se llama 'boxes_boxCode_unique'
DROP INDEX IF EXISTS `boxes_boxCode_unique` ON `boxes`;

-- Opción 3: Si el índice se llama 'boxes_boxCode_key'
DROP INDEX IF EXISTS `boxes_boxCode_key` ON `boxes`;

-- Verificar que se eliminó correctamente
SHOW INDEX FROM boxes WHERE Column_name = 'boxCode';
