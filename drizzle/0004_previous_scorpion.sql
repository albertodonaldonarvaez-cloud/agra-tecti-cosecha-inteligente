CREATE TABLE `uploadBatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` varchar(64) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`totalRows` int NOT NULL,
	`successRows` int NOT NULL,
	`errorRows` int NOT NULL,
	`status` enum('processing','completed','failed') NOT NULL,
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `uploadBatches_id` PRIMARY KEY(`id`),
	CONSTRAINT `uploadBatches_batchId_unique` UNIQUE(`batchId`)
);
--> statement-breakpoint
CREATE TABLE `uploadErrors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadBatchId` varchar(64) NOT NULL,
	`errorType` enum('duplicate_box','invalid_parcel','missing_data','invalid_format','photo_download_failed','other') NOT NULL,
	`boxCode` varchar(64),
	`parcelCode` varchar(64),
	`errorMessage` text NOT NULL,
	`rowData` text,
	`resolved` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `uploadErrors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `parcels` ADD `polygon` text;--> statement-breakpoint
ALTER TABLE `parcels` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `parcels` ADD CONSTRAINT `parcels_code_unique` UNIQUE(`code`);