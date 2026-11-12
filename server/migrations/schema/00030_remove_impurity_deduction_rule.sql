-- +goose Up
-- 杂质由称重台在二次称重时按实际情况录入，不再由云端规则自动下发。
-- 这里只移除检测依据约束；类别和规则数据由 seed 迁移删除。
ALTER TABLE grain_deduction_rule DROP CONSTRAINT IF EXISTS grain_deduction_rule_basis_field_check;
ALTER TABLE grain_deduction_rule ADD CONSTRAINT grain_deduction_rule_basis_field_check
    CHECK (basis_field IN ('', 'moisture')) NOT VALID;

-- +goose Down
ALTER TABLE grain_deduction_rule DROP CONSTRAINT IF EXISTS grain_deduction_rule_basis_field_check;
ALTER TABLE grain_deduction_rule ADD CONSTRAINT grain_deduction_rule_basis_field_check
    CHECK (basis_field IN ('', 'moisture', 'impurity'));
