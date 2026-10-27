-- +goose Up
-- Rewrite only the canonical access URL this service wrote for existing files.
-- Other values are left untouched, and file content, identifiers and metadata
-- are preserved.
UPDATE sys_file
SET access_url = '/api/v1/system/file/' || id || '/view'
WHERE access_url = '/api/system/file/' || id || '/view';

-- +goose Down
UPDATE sys_file
SET access_url = '/api/system/file/' || id || '/view'
WHERE access_url = '/api/v1/system/file/' || id || '/view';
