-- +goose Up
DROP INDEX IF EXISTS uk_grain_granary_site_name;
DROP INDEX IF EXISTS idx_grain_granary_site;
ALTER TABLE grain_granary DROP COLUMN site_code;
CREATE UNIQUE INDEX uk_grain_granary_name ON grain_granary(lower(name));

-- +goose Down
DROP INDEX IF EXISTS uk_grain_granary_name;
ALTER TABLE grain_granary ADD COLUMN site_code VARCHAR(80) NOT NULL DEFAULT '';
CREATE UNIQUE INDEX uk_grain_granary_site_name ON grain_granary(site_code, lower(name));
CREATE INDEX idx_grain_granary_site ON grain_granary(site_code, enabled);
