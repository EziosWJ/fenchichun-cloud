-- +goose Up
ALTER TABLE grain_trip ADD COLUMN inspection_method VARCHAR(16) NOT NULL DEFAULT 'lab' CHECK (inspection_method IN ('lab','visual'));
ALTER TABLE grain_trip ADD COLUMN visual_conclusion VARCHAR(16) NOT NULL DEFAULT '' CHECK (visual_conclusion IN ('','accept','reject'));
ALTER TABLE grain_trip ADD COLUMN visual_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE grain_trip ADD COLUMN visual_inspected_at TIMESTAMPTZ;
ALTER TABLE grain_trip ADD COLUMN visual_inspected_by BIGINT REFERENCES sys_user(id);
ALTER TABLE grain_exit_permit ALTER COLUMN inspection_id DROP NOT NULL;

-- +goose Down
-- Refuse rollback if visual permits exist; their evidence cannot be represented by the old schema.
ALTER TABLE grain_exit_permit ALTER COLUMN inspection_id SET NOT NULL;
ALTER TABLE grain_trip DROP COLUMN visual_inspected_by, DROP COLUMN visual_inspected_at, DROP COLUMN visual_reason, DROP COLUMN visual_conclusion, DROP COLUMN inspection_method;
