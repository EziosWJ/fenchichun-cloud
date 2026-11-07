-- +goose Up
ALTER TABLE wb_cloud_material ADD COLUMN inspection_method VARCHAR(16) NOT NULL DEFAULT 'lab'
    CHECK (inspection_method IN ('lab', 'visual'));

-- +goose Down
ALTER TABLE wb_cloud_material DROP COLUMN inspection_method;
