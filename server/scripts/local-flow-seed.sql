-- Local end-to-end test data for the cloud development database.
-- Run with:
--   docker exec -i postgres psql -U postgres -d base_go_api < server/scripts/local-flow-seed.sql
-- The script is idempotent: re-running keeps existing rows and does not
-- overwrite edited rules or business data.

BEGIN;

INSERT INTO wb_cloud_site (code, name, enabled)
VALUES ('SITE01', '本地联调厂', TRUE)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, enabled = TRUE;

INSERT INTO wb_cloud_site_code (code, site_code)
VALUES ('SITE01', 'SITE01')
ON CONFLICT (code) DO NOTHING;

INSERT INTO grain_granary (name, enabled, remark)
VALUES ('1号仓', TRUE, '本地联调默认卸粮点')
ON CONFLICT DO NOTHING;

-- 水分扣减规则：本地测试数据，按物料配置起扣阈值和区间。
-- 高粱 14.0 起扣；豌豆 13.0；大麦 12.5；稻壳、谷糠 12.0。
-- 超出阈值 0.2 内扣 0.1%，0.2 至 1.0 扣 0.2%，超出 1.0 扣 0.5%。
INSERT INTO grain_deduction_rule (code, material_code, category_code, mode, basis_field, amount_milli_tonne, version, effective_from, enabled, remark)
VALUES
    ('DR-LOCAL-GL-WATER', 'C-M-0010', 'WATER', 'percent', 'moisture', 0, 1, now() - interval '1 day', TRUE, '本地测试：高粱水分'),
    ('DR-LOCAL-PD-WATER', 'C-M-0001', 'WATER', 'percent', 'moisture', 0, 1, now() - interval '1 day', TRUE, '本地测试：豌豆水分'),
    ('DR-LOCAL-DM-WATER', 'C-M-0007', 'WATER', 'percent', 'moisture', 0, 1, now() - interval '1 day', TRUE, '本地测试：大麦水分'),
    ('DR-LOCAL-DK-WATER', 'C-M-0003', 'WATER', 'percent', 'moisture', 0, 1, now() - interval '1 day', TRUE, '本地测试：稻壳水分'),
    ('DR-LOCAL-GK-WATER', 'C-M-0009', 'WATER', 'percent', 'moisture', 0, 1, now() - interval '1 day', TRUE, '本地测试：谷糠水分')
ON CONFLICT (code, version) DO NOTHING;

INSERT INTO grain_deduction_rule_range (rule_id, min_value, max_value, rate_bp, sort_order)
SELECT r.id, v.min_value, v.max_value, v.rate_bp, v.sort_order
FROM grain_deduction_rule r
JOIN (VALUES
    ('DR-LOCAL-GL-WATER', 0::numeric, 14.0::numeric, 0, 1),
    ('DR-LOCAL-GL-WATER', 14.0, 14.2, 10, 2),
    ('DR-LOCAL-GL-WATER', 14.2, 15.0, 20, 3),
    ('DR-LOCAL-GL-WATER', 15.0, NULL, 50, 4),
    ('DR-LOCAL-PD-WATER', 0::numeric, 13.0::numeric, 0, 1),
    ('DR-LOCAL-PD-WATER', 13.0, 13.2, 10, 2),
    ('DR-LOCAL-PD-WATER', 13.2, 14.0, 20, 3),
    ('DR-LOCAL-PD-WATER', 14.0, NULL, 50, 4),
    ('DR-LOCAL-DM-WATER', 0::numeric, 12.5::numeric, 0, 1),
    ('DR-LOCAL-DM-WATER', 12.5, 12.7, 10, 2),
    ('DR-LOCAL-DM-WATER', 12.7, 13.5, 20, 3),
    ('DR-LOCAL-DM-WATER', 13.5, NULL, 50, 4),
    ('DR-LOCAL-DK-WATER', 0::numeric, 12.0::numeric, 0, 1),
    ('DR-LOCAL-DK-WATER', 12.0, 12.2, 10, 2),
    ('DR-LOCAL-DK-WATER', 12.2, 13.0, 20, 3),
    ('DR-LOCAL-DK-WATER', 13.0, NULL, 50, 4),
    ('DR-LOCAL-GK-WATER', 0::numeric, 12.0::numeric, 0, 1),
    ('DR-LOCAL-GK-WATER', 12.0, 12.2, 10, 2),
    ('DR-LOCAL-GK-WATER', 12.2, 13.0, 20, 3),
    ('DR-LOCAL-GK-WATER', 13.0, NULL, 50, 4)
) AS v(code, min_value, max_value, rate_bp, sort_order) ON v.code = r.code
WHERE r.version = 1
  AND NOT EXISTS (SELECT 1 FROM grain_deduction_rule_range x WHERE x.rule_id = r.id AND x.sort_order = v.sort_order);

-- 开发库曾出现序列落后于已有主键，导致厂端磅单同步被误判为冲突。
SELECT setval(
    pg_get_serial_sequence('wb_cloud_ticket', 'id'),
    (SELECT COALESCE(MAX(id), 0) + 1 FROM wb_cloud_ticket),
    false
);

COMMIT;
