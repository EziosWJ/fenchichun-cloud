-- +goose Up
INSERT INTO grain_deduction_category (code, name, enabled, sort_order) VALUES
 ('DENSITY', '容重', TRUE, 4)
ON CONFLICT (code) DO NOTHING;

-- +goose Down
DELETE FROM grain_deduction_category WHERE code = 'DENSITY';
