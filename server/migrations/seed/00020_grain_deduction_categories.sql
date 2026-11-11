-- +goose Up
INSERT INTO grain_deduction_category (code, name, enabled, sort_order) VALUES
 ('WATER', '水分', TRUE, 1),
 ('IMPURITY', '杂质', TRUE, 2),
 ('OTHER', '其他', TRUE, 3)
ON CONFLICT (code) DO NOTHING;

-- +goose Down
DELETE FROM grain_deduction_category WHERE code IN ('WATER','IMPURITY','OTHER');
