-- Script para eliminar la restricción UNIQUE del campo boxCode
-- Esto permite que existan códigos de caja repetidos de diferentes días/horas

-- Primero ver qué índices existen en la tabla boxes
SHOW INDEX FROM boxes WHERE Column_name = 'boxCode';

-- Eliminar el índice UNIQUE de boxCode
-- El nombre del índice suele ser el mismo que el nombre de la columna
ALTER TABLE boxes DROP INDEX boxCode;
