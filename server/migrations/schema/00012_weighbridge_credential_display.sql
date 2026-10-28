-- +goose Up
ALTER TABLE wb_cloud_credential ADD COLUMN token_value TEXT;

-- +goose Down
ALTER TABLE wb_cloud_credential DROP COLUMN token_value;
