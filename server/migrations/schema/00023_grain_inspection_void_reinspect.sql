-- +goose Up
-- 作废的化验单保留历史，但不应占用“一单一化验”的唯一位置。
DROP INDEX IF EXISTS uk_grain_inspection_trip;
CREATE UNIQUE INDEX uk_grain_inspection_trip_active
    ON grain_inspection(trip_id)
    WHERE trip_id IS NOT NULL AND status <> 'void';

-- +goose Down
DROP INDEX IF EXISTS uk_grain_inspection_trip_active;
CREATE UNIQUE INDEX uk_grain_inspection_trip
    ON grain_inspection(trip_id)
    WHERE trip_id IS NOT NULL;
