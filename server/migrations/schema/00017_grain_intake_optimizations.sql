-- +goose Up
-- Inspections belong to a site so a trip can never use another site's result.
ALTER TABLE grain_inspection ADD COLUMN site_code VARCHAR(80) NOT NULL DEFAULT '';
UPDATE grain_inspection i SET site_code = t.site_code FROM grain_trip t WHERE i.trip_id = t.id AND i.site_code = '';
CREATE INDEX idx_grain_inspection_site ON grain_inspection(site_code, created_at DESC, id DESC);

-- System events (for example a voided ticket auto-unlinking a trip) have no human actor.
ALTER TABLE grain_trip_event ALTER COLUMN actor_id DROP NOT NULL;

-- +goose Down
ALTER TABLE grain_trip_event ALTER COLUMN actor_id SET NOT NULL;
DROP INDEX idx_grain_inspection_site;
ALTER TABLE grain_inspection DROP COLUMN site_code;
