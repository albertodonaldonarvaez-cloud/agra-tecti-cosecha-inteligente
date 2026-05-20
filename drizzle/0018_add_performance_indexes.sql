-- =============================================
-- 0018: Índices de rendimiento para notas de campo
-- Mejora la velocidad de consultas frecuentes
-- =============================================

-- Notas de campo: filtros por estado, reportero y parcela
ALTER TABLE `fieldNotes` ADD INDEX IF NOT EXISTS `idx_fn_status` (`status`);
ALTER TABLE `fieldNotes` ADD INDEX IF NOT EXISTS `idx_fn_reportedBy` (`reportedByUserId`);
ALTER TABLE `fieldNotes` ADD INDEX IF NOT EXISTS `idx_fn_parcelId` (`parcelId`);
ALTER TABLE `fieldNotes` ADD INDEX IF NOT EXISTS `idx_fn_createdAt` (`createdAt`);

-- Fotos de notas: JOIN por fieldNoteId (se consulta en CADA listado de notas)
ALTER TABLE `fieldNotePhotos` ADD INDEX IF NOT EXISTS `idx_fnp_fieldNoteId` (`fieldNoteId`);

-- Asignaciones de colaboradores: consultas por colaborador y actividad
ALTER TABLE `fieldActivityAssignments` ADD INDEX IF NOT EXISTS `idx_faa_collaboratorId` (`collaboratorId`);
ALTER TABLE `fieldActivityAssignments` ADD INDEX IF NOT EXISTS `idx_faa_activityId` (`activityId`);

-- Parcelas de actividades: JOIN por activityId
ALTER TABLE `fieldActivityParcels` ADD INDEX IF NOT EXISTS `idx_fap_activityId` (`activityId`);
