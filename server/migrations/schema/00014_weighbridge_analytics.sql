-- +goose Up
-- 统计与分析读取模型：从过磅单快照派生常用数值和时间列，避免分析查询逐行解析 JSON 文本。
ALTER TABLE wb_cloud_ticket
    ADD COLUMN original_gross_milli_tonne BIGINT,
    ADD COLUMN original_tare_milli_tonne BIGINT,
    ADD COLUMN final_gross_milli_tonne BIGINT,
    ADD COLUMN final_tare_milli_tonne BIGINT,
    ADD COLUMN pre_adjustment_net_milli_tonne BIGINT,
    ADD COLUMN net_adjustment_milli_tonne BIGINT,
    ADD COLUMN adjustment_known BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN adjusted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN adjustment_mode VARCHAR(20),
    ADD COLUMN adjustment_category VARCHAR(80),
    ADD COLUMN adjustment_category_name VARCHAR(200),
    ADD COLUMN first_confirmed_at TIMESTAMPTZ,
    ADD COLUMN second_confirmed_at TIMESTAMPTZ,
    ADD COLUMN weigh_interval_seconds BIGINT,
    ADD COLUMN issued_lag_seconds BIGINT,
    ADD COLUMN cross_day BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN gross_source VARCHAR(20),
    ADD COLUMN tare_source VARCHAR(20),
    ADD COLUMN issuer_name VARCHAR(200),
    ADD COLUMN driver VARCHAR(200),
    ADD COLUMN driver_phone VARCHAR(100),
    ADD COLUMN contact_name VARCHAR(200),
    ADD COLUMN contact_phone VARCHAR(100),
    ADD COLUMN material_name VARCHAR(200),
    ADD COLUMN material_spec VARCHAR(200),
    ADD COLUMN party_name VARCHAR(200),
    ADD COLUMN issued_date DATE;

CREATE INDEX idx_wb_cloud_ticket_analytics_issued
    ON wb_cloud_ticket (issued_date, status);
CREATE INDEX idx_wb_cloud_ticket_analytics_site
    ON wb_cloud_ticket (site_code, issued_date);
CREATE INDEX idx_wb_cloud_ticket_analytics_direction
    ON wb_cloud_ticket (direction, issued_date);
CREATE INDEX idx_wb_cloud_ticket_analytics_material
    ON wb_cloud_ticket (material_code, issued_date);
CREATE INDEX idx_wb_cloud_ticket_analytics_party
    ON wb_cloud_ticket (party_code, issued_date);
CREATE INDEX idx_wb_cloud_ticket_analytics_issuer
    ON wb_cloud_ticket (issuer_name, issued_date);
CREATE INDEX idx_wb_cloud_ticket_analytics_adjustment
    ON wb_cloud_ticket (adjustment_category)
    WHERE adjustment_known;

-- +goose Down
DROP INDEX IF EXISTS idx_wb_cloud_ticket_analytics_adjustment;
DROP INDEX IF EXISTS idx_wb_cloud_ticket_analytics_issuer;
DROP INDEX IF EXISTS idx_wb_cloud_ticket_analytics_party;
DROP INDEX IF EXISTS idx_wb_cloud_ticket_analytics_material;
DROP INDEX IF EXISTS idx_wb_cloud_ticket_analytics_direction;
DROP INDEX IF EXISTS idx_wb_cloud_ticket_analytics_site;
DROP INDEX IF EXISTS idx_wb_cloud_ticket_analytics_issued;

ALTER TABLE wb_cloud_ticket
    DROP COLUMN party_name,
    DROP COLUMN material_spec,
    DROP COLUMN material_name,
    DROP COLUMN contact_phone,
    DROP COLUMN contact_name,
    DROP COLUMN driver_phone,
    DROP COLUMN driver,
    DROP COLUMN issuer_name,
    DROP COLUMN tare_source,
    DROP COLUMN gross_source,
    DROP COLUMN cross_day,
    DROP COLUMN issued_lag_seconds,
    DROP COLUMN weigh_interval_seconds,
    DROP COLUMN second_confirmed_at,
    DROP COLUMN first_confirmed_at,
    DROP COLUMN adjustment_category_name,
    DROP COLUMN adjustment_category,
    DROP COLUMN adjustment_mode,
    DROP COLUMN adjusted,
    DROP COLUMN adjustment_known,
    DROP COLUMN net_adjustment_milli_tonne,
    DROP COLUMN pre_adjustment_net_milli_tonne,
    DROP COLUMN final_tare_milli_tonne,
    DROP COLUMN final_gross_milli_tonne,
    DROP COLUMN original_tare_milli_tonne,
    DROP COLUMN original_gross_milli_tonne;
