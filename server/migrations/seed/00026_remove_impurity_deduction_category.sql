-- +goose Up
-- 杂质扣减改由称重台二次称重时录入，移除云端杂质扣减类别和已有规则。
DELETE FROM grain_deduction_rule WHERE category_code = 'IMPURITY' OR basis_field = 'impurity';
DELETE FROM grain_deduction_category WHERE code = 'IMPURITY';

-- +goose Down
INSERT INTO grain_deduction_category (code, name, enabled, sort_order)
VALUES ('IMPURITY', '杂质', TRUE, 2)
ON CONFLICT (code) DO NOTHING;
