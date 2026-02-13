-- Migration: Add crops, varieties, parcel notes, and crop assignment to parcels

-- Tabla de cultivos
CREATE TABLE IF NOT EXISTS `crops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crops_id` PRIMARY KEY(`id`),
	CONSTRAINT `crops_name_unique` UNIQUE(`name`)
);

-- Tabla de variedades de cultivo (un cultivo puede tener muchas variedades)
CREATE TABLE IF NOT EXISTS `cropVarieties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cropId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cropVarieties_id` PRIMARY KEY(`id`)
);

-- Tabla de notas de parcela (con autor y fecha)
CREATE TABLE IF NOT EXISTS `parcelNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parcelId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parcelNotes_id` PRIMARY KEY(`id`)
);

-- Agregar columnas de cultivo y variedad a parcelDetails
ALTER TABLE `parcelDetails` ADD COLUMN `cropId` int NULL;
ALTER TABLE `parcelDetails` ADD COLUMN `varietyId` int NULL;

-- Agregar permiso para la página de cultivos y variedades
ALTER TABLE `users` ADD COLUMN `canViewCrops` boolean NOT NULL DEFAULT false;
