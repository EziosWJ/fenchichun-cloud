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

-- 高粱：水分按区间比例，杂质按吨固定扣减，演示多条规则组合。
INSERT INTO grain_deduction_rule (code, material_code, category_code, mode, basis_field, amount_milli_tonne, version, effective_from, enabled, remark)
SELECT 'DR-LOCAL-GL-WATER', 'C-M-0010', 'WATER', 'percent', 'moisture', 0, 1, now() - interval '1 day', TRUE, '本地联调：高粱水分'
WHERE NOT EXISTS (SELECT 1 FROM grain_deduction_rule WHERE code = 'DR-LOCAL-GL-WATER' AND version = 1);

INSERT INTO grain_deduction_rule_range (rule_id, min_value, max_value, rate_bp, sort_order)
SELECT r.id, v.min_value, v.max_value, v.rate_bp, v.sort_order
FROM grain_deduction_rule r
CROSS JOIN (VALUES
    (0::numeric, 13.0::numeric, 0, 1),
    (13.0, 14.0, 100, 2),
    (14.0, 15.0, 150, 3),
    (15.0, NULL, 200, 4)
) AS v(min_value, max_value, rate_bp, sort_order)
WHERE r.code = 'DR-LOCAL-GL-WATER' AND r.version = 1
  AND NOT EXISTS (SELECT 1 FROM grain_deduction_rule_range x WHERE x.rule_id = r.id AND x.sort_order = v.sort_order);

INSERT INTO grain_deduction_rule (code, material_code, category_code, mode, basis_field, amount_milli_tonne, version, effective_from, enabled, remark)
SELECT 'DR-LOCAL-GL-IMPURITY', 'C-M-0010', 'IMPURITY', 'amount', '', 50, 1, now() - interval '1 day', TRUE, '本地联调：高粱每车固定扣 0.050 吨'
WHERE NOT EXISTS (SELECT 1 FROM grain_deduction_rule WHERE code = 'DR-LOCAL-GL-IMPURITY' AND version = 1);

-- 大麦：另一组水分区间和固定杂质扣减，便于切换物料核对。
INSERT INTO grain_deduction_rule (code, material_code, category_code, mode, basis_field, amount_milli_tonne, version, effective_from, enabled, remark)
SELECT 'DR-LOCAL-DM-WATER', 'C-M-0007', 'WATER', 'percent', 'moisture', 0, 1, now() - interval '1 day', TRUE, '本地联调：大麦水分'
WHERE NOT EXISTS (SELECT 1 FROM grain_deduction_rule WHERE code = 'DR-LOCAL-DM-WATER' AND version = 1);

INSERT INTO grain_deduction_rule_range (rule_id, min_value, max_value, rate_bp, sort_order)
SELECT r.id, v.min_value, v.max_value, v.rate_bp, v.sort_order
FROM grain_deduction_rule r
CROSS JOIN (VALUES
    (0::numeric, 12.5::numeric, 0, 1),
    (12.5, 13.5, 100, 2),
    (13.5, NULL, 150, 3)
) AS v(min_value, max_value, rate_bp, sort_order)
WHERE r.code = 'DR-LOCAL-DM-WATER' AND r.version = 1
  AND NOT EXISTS (SELECT 1 FROM grain_deduction_rule_range x WHERE x.rule_id = r.id AND x.sort_order = v.sort_order);

INSERT INTO grain_deduction_rule (code, material_code, category_code, mode, basis_field, amount_milli_tonne, version, effective_from, enabled, remark)
SELECT 'DR-LOCAL-DM-IMPURITY', 'C-M-0007', 'IMPURITY', 'amount', '', 30, 1, now() - interval '1 day', TRUE, '本地联调：大麦每车固定扣 0.030 吨'
WHERE NOT EXISTS (SELECT 1 FROM grain_deduction_rule WHERE code = 'DR-LOCAL-DM-IMPURITY' AND version = 1);

-- 开发库曾出现序列落后于已有主键，导致厂端磅单同步被误判为冲突。
SELECT setval(
    pg_get_serial_sequence('wb_cloud_ticket', 'id'),
    (SELECT COALESCE(MAX(id), 0) + 1 FROM wb_cloud_ticket),
    false
);

COMMIT;
