-- +goose Up
INSERT INTO sys_role (role_name, role_code, status, is_builtin)
VALUES ('酒糟出库', 'GRAIN_OUT', 1, 1)
ON CONFLICT (role_code) DO NOTHING;

-- +goose Down
DELETE FROM sys_role WHERE role_code = 'GRAIN_OUT' AND is_builtin = 1;
