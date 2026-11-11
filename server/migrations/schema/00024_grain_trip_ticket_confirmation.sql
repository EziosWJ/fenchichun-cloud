-- +goose Up
ALTER TABLE grain_trip ADD COLUMN ticket_confirmed_at TIMESTAMPTZ;
ALTER TABLE grain_trip ADD COLUMN ticket_confirmed_by BIGINT;

-- +goose Down
ALTER TABLE grain_trip DROP COLUMN ticket_confirmed_by;
ALTER TABLE grain_trip DROP COLUMN ticket_confirmed_at;
