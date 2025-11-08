CREATE TABLE `apiConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`apiUrl` varchar(512) NOT NULL,
	`apiToken` varchar(512) NOT NULL,
	`assetId` varchar(128) NOT NULL,
	`lastSync` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apiConfig_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `boxes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`koboId` int NOT NULL,
	`boxCode` varchar(64) NOT NULL,
	`harvesterId` int NOT NULL,
	`parcelCode` varchar(64) NOT NULL,
	`parcelName` varchar(255) NOT NULL,
	`weight` int NOT NULL,
	`photoFilename` varchar(255),
	`photoUrl` text,
	`photoLargeUrl` text,
	`photoMediumUrl` text,
	`photoSmallUrl` text,
	`latitude` varchar(64),
	`longitude` varchar(64),
	`submissionTime` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `boxes_id` PRIMARY KEY(`id`),
	CONSTRAINT `boxes_koboId_unique` UNIQUE(`koboId`),
	CONSTRAINT `boxes_boxCode_unique` UNIQUE(`boxCode`)
);
--> statement-breakpoint
CREATE TABLE `harvesters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` int NOT NULL,
	`customName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `harvesters_id` PRIMARY KEY(`id`),
	CONSTRAINT `harvesters_number_unique` UNIQUE(`number`)
);
--> statement-breakpoint
CREATE TABLE `parcels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parcels_id` PRIMARY KEY(`id`)
);
