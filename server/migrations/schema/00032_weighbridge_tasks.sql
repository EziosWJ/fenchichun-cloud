-- +goose Up
CREATE TABLE wb_cloud_task_sync (site_code varchar(80) PRIMARY KEY REFERENCES wb_cloud_site(code) ON UPDATE CASCADE, last_synced_at timestamptz NOT NULL);
CREATE TABLE wb_cloud_task (site_code varchar(80) NOT NULL REFERENCES wb_cloud_site(code) ON UPDATE CASCADE, task_no varchar(200) NOT NULL, version bigint NOT NULL, status varchar(32) NOT NULL, first_weighed_at timestamptz NOT NULL, ticket_site_code varchar(80), ticket_no varchar(200), snapshot jsonb NOT NULL, PRIMARY KEY(site_code,task_no));
CREATE INDEX idx_wb_cloud_task_status ON wb_cloud_task(status, first_weighed_at DESC, task_no);
-- +goose Down
DROP TABLE wb_cloud_task;
DROP TABLE wb_cloud_task_sync;
