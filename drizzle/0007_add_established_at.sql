-- Agregar fecha de establecimiento a parcelDetails
ALTER TABLE parcelDetails ADD COLUMN establishedAt VARCHAR(32) DEFAULT NULL AFTER varietyId;
