-- +goose Up
-- 库管需要在小程序完成目测接收/拒收，补齐目测权限。
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r
CROSS JOIN sys_menu m
WHERE r.role_code = 'STORE' AND r.deleted = 0
  AND m.permission_code = 'grain-intake:visual' AND m.deleted = 0
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- +goose Down
DELETE FROM sys_role_menu
WHERE role_id IN (SELECT id FROM sys_role WHERE role_code = 'STORE')
  AND menu_id IN (SELECT id FROM sys_menu WHERE permission_code = 'grain-intake:visual');
