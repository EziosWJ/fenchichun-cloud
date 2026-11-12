-- +goose Up
-- 登记重试幂等键：同一操作人使用同一 clientRequestId 重试时返回原流转单。
ALTER TABLE grain_trip ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(64) NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS uk_grain_trip_client_request
    ON grain_trip(created_by, client_request_id)
    WHERE client_request_id <> '';

-- +goose Down
DROP INDEX IF EXISTS uk_grain_trip_client_request;
ALTER TABLE grain_trip DROP COLUMN client_request_id;
