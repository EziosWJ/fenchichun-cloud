-- +goose Up
-- 化验单恢复容量（g/L）检测值。容量只作为化验指标保存和展示，不参与扣减。
ALTER TABLE grain_inspection ADD COLUMN bulk_density VARCHAR(32) NOT NULL DEFAULT '';

-- 容量不再是扣减依据；仅保留水分和杂质两种检测值依据。
ALTER TABLE grain_deduction_rule DROP CONSTRAINT IF EXISTS grain_deduction_rule_basis_field_check;
ALTER TABLE grain_deduction_rule ADD CONSTRAINT grain_deduction_rule_basis_field_check
    CHECK (basis_field IN ('', 'moisture', 'impurity'));

-- +goose Down
ALTER TABLE grain_deduction_rule DROP CONSTRAINT IF EXISTS grain_deduction_rule_basis_field_check;
ALTER TABLE grain_deduction_rule ADD CONSTRAINT grain_deduction_rule_basis_field_check
    CHECK (basis_field IN ('', 'moisture', 'impurity', 'bulk_density'));
ALTER TABLE grain_inspection DROP COLUMN bulk_density;
