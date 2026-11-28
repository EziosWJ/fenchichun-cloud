-- +goose Up
-- A print that failed before the factory created any attempt still counts as
-- the first print. The next scan-based retry must therefore be recorded as a
-- reprint so it consumes one of the two allowed reprints.
ALTER TABLE wb_cloud_print_command ADD COLUMN retry_as_reprint BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE wb_cloud_print_command DROP COLUMN retry_as_reprint;
