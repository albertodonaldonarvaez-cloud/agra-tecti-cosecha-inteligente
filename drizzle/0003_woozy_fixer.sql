ALTER TABLE `boxes` DROP INDEX `boxes_koboId_unique`;--> statement-breakpoint
ALTER TABLE `boxes` MODIFY COLUMN `koboId` int;