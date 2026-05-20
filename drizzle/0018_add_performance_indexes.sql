-- =============================================
-- 0018: Índices de rendimiento para notas de campo
-- Compatible con MySQL 8.0
-- =============================================

-- Helper: procedimiento para crear índice solo si no existe
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS add_index_if_not_exists(
  IN p_table VARCHAR(128),
  IN p_index VARCHAR(128),
  IN p_columns VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- Notas de campo
CALL add_index_if_not_exists('fieldNotes', 'idx_fn_status', '`status`');
CALL add_index_if_not_exists('fieldNotes', 'idx_fn_reportedBy', '`reportedByUserId`');
CALL add_index_if_not_exists('fieldNotes', 'idx_fn_parcelId', '`parcelId`');
CALL add_index_if_not_exists('fieldNotes', 'idx_fn_createdAt', '`createdAt`');

-- Fotos de notas
CALL add_index_if_not_exists('fieldNotePhotos', 'idx_fnp_fieldNoteId', '`fieldNoteId`');

-- Asignaciones de colaboradores
CALL add_index_if_not_exists('fieldActivityAssignments', 'idx_faa_collaboratorId', '`collaboratorId`');
CALL add_index_if_not_exists('fieldActivityAssignments', 'idx_faa_activityId', '`activityId`');

-- Parcelas de actividades
CALL add_index_if_not_exists('fieldActivityParcels', 'idx_fap_activityId', '`activityId`');

-- Limpiar el procedimiento temporal
DROP PROCEDURE IF EXISTS add_index_if_not_exists;
