-- Migration: Add assignedToCollaboratorId to fieldNotes
ALTER TABLE `fieldNotes` ADD COLUMN `assignedToCollaboratorId` INT NULL AFTER `resolvedLongitude`;
