-- +goose Up
-- Historical data backfill lives in seed 00033_mark_mobile_direct_tickets.sql.
-- Keep this schema version as a harmless no-op so upgrade ordering stays stable.
COMMENT ON TABLE wb_cloud_ticket IS '云端过磅单';

-- +goose Down
COMMENT ON TABLE wb_cloud_ticket IS '云端过磅单';
