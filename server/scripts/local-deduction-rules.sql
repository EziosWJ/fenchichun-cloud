-- Refresh local test moisture deduction rules for five materials.
-- Run with:
--   docker exec -i postgres psql -U postgres -d base_go_api < server/scripts/local-deduction-rules.sql
-- This script replaces the water rules for these five materials, so it is
-- intended for the local development database only.
BEGIN;

DELETE FROM grain_deduction_rule
WHERE code IN (
    'DR-LOCAL-GL-WATER',
    'DR-LOCAL-PD-WATER',
    'DR-LOCAL-DM-WATER',
    'DR-LOCAL-DK-WATER',
    'DR-LOCAL-GK-WATER'
);

INSERT INTO grain_deduction_rule (code, material_code, category_code, mode, basis_field, amount_milli_tonne, version, effective_from, enabled, remark)
VALUES
    ('DR-LOCAL-GL-WATER', 'C-M-0010', 'WATER', 'percent', 'moisture', 0, 1, now(), TRUE, '本地测试：高粱水分'),
    ('DR-LOCAL-PD-WATER', 'C-M-0001', 'WATER', 'percent', 'moisture', 0, 1, now(), TRUE, '本地测试：豌豆水分'),
    ('DR-LOCAL-DM-WATER', 'C-M-0007', 'WATER', 'percent', 'moisture', 0, 1, now(), TRUE, '本地测试：大麦水分'),
    ('DR-LOCAL-DK-WATER', 'C-M-0003', 'WATER', 'percent', 'moisture', 0, 1, now(), TRUE, '本地测试：稻壳水分'),
    ('DR-LOCAL-GK-WATER', 'C-M-0009', 'WATER', 'percent', 'moisture', 0, 1, now(), TRUE, '本地测试：谷糠水分');

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
WHERE r.version = 1;

COMMIT;
