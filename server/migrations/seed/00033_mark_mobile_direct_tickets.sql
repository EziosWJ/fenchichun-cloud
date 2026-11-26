-- +goose Up
UPDATE wb_cloud_ticket
SET snapshot = jsonb_set(snapshot::jsonb, '{entryType}', '"mobile_direct"')::text
WHERE gross_source = 'mobile'
  AND (snapshot::jsonb ->> 'entryType') IS NULL;

-- +goose Down
UPDATE wb_cloud_ticket
SET snapshot = (snapshot::jsonb - 'entryType')::text
WHERE snapshot::jsonb ->> 'entryType' = 'mobile_direct';
