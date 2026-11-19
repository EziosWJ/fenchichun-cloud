-- +goose Up
INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '待回磅任务', 'MENU', '/weighbridge/tasks', 'weighbridge/tasks/index', 'clipboard-list', 'weighbridge:tasks', 4, 1, 1, 1 FROM sys_menu WHERE permission_code = 'weighbridge' ON CONFLICT (permission_code) DO NOTHING;
INSERT INTO sys_role_menu (role_id, menu_id) SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m WHERE r.deleted = 0 AND m.permission_code = 'weighbridge:tasks' ON CONFLICT DO NOTHING;
-- +goose Down
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE permission_code = 'weighbridge:tasks' AND is_builtin = 1);
DELETE FROM sys_menu WHERE permission_code = 'weighbridge:tasks' AND is_builtin = 1;
