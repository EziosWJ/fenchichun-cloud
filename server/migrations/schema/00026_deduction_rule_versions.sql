-- +goose Up
-- Rule edits create a new version instead of overwriting the active row, so a
-- future effective date can leave the previous version in force until then.
ALTER TABLE grain_deduction_rule DROP CONSTRAINT grain_deduction_rule_code_key;
ALTER TABLE grain_deduction_rule ADD CONSTRAINT grain_deduction_rule_code_version_key UNIQUE (code, version);

-- +goose Down
ALTER TABLE grain_deduction_rule DROP CONSTRAINT grain_deduction_rule_code_version_key;
ALTER TABLE grain_deduction_rule ADD CONSTRAINT grain_deduction_rule_code_key UNIQUE (code);
