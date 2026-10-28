CREATE TABLE `image_storage` (
	`id` integer PRIMARY KEY NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploaded_images` (
	`key` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	`bytes` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO image_storage (id, bytes) VALUES (1, 0);
--> statement-breakpoint
CREATE TRIGGER uploaded_images_validate BEFORE INSERT ON uploaded_images
BEGIN
  SELECT CASE WHEN NEW.bytes < 1 OR NEW.bytes > 1048576
    OR typeof(NEW.data) <> 'blob' OR NEW.bytes <> length(NEW.data)
    OR NEW.mime NOT IN ('image/jpeg', 'image/png', 'image/webp')
    THEN RAISE(ABORT, 'image_storage_invalid') END;
  SELECT CASE WHEN COALESCE((SELECT bytes FROM image_storage WHERE id = 1), 52428800) + NEW.bytes > 52428800
    THEN RAISE(ABORT, 'image_storage_limit') END;
END;
--> statement-breakpoint
CREATE TRIGGER uploaded_images_inserted AFTER INSERT ON uploaded_images
BEGIN
  UPDATE image_storage SET bytes = bytes + NEW.bytes WHERE id = 1;
END;
--> statement-breakpoint
CREATE TRIGGER uploaded_images_immutable BEFORE UPDATE ON uploaded_images
BEGIN
  SELECT RAISE(ABORT, 'image_storage_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER uploaded_images_deleted AFTER DELETE ON uploaded_images
BEGIN
  UPDATE image_storage SET bytes = bytes - OLD.bytes WHERE id = 1;
END;
