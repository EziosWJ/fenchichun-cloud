-- +goose Up
-- Remove the bulk-density deduction category and any rules that referenced it.
DELETE FROM grain_deduction_rule WHERE category_code = 'DENSITY' OR basis_field = 'bulk_density';
DELETE FROM grain_deduction_category WHERE code = 'DENSITY';

-- +goose Down
INSERT INTO grain_deduction_category (code, name, enabled, sort_order) VALUES
 ('DENSITY', '容重', TRUE, 4)
ON CONFLICT (code) DO NOTHING;
