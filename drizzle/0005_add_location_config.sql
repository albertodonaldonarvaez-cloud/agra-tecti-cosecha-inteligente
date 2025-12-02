-- Migration: Add locationConfig table for weather data
CREATE TABLE `locationConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`locationName` varchar(255) NOT NULL,
	`latitude` varchar(64) NOT NULL,
	`longitude` varchar(64) NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Mexico_City',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `locationConfig_id` PRIMARY KEY(`id`)
);
