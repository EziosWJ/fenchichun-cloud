-- +goose Up
-- Container/bulk-density inspection and deduction were removed from the grain
-- intake business. Historical values are not carried forward.
ALTER TABLE grain_inspection DROP COLUMN bulk_density;

-- +goose Down
ALTER TABLE grain_inspection ADD COLUMN bulk_density VARCHAR(32) NOT NULL DEFAULT '';
