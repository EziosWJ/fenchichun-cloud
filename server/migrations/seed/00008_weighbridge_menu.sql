-- +goose Up
INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, icon, permission_code, sort_order, visible, status, is_builtin)
VALUES (0, '过磅管理', 'DIR', '/weighbridge', 'clipboard-list', 'weighbridge', 5, 1, 1, 1)
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '过磅单查询', 'MENU', '/weighbridge/tickets', 'weighbridge/tickets/index', 'clipboard-list', 'weighbridge:tickets', 1, 1, 1, 1
FROM sys_menu WHERE permission_code = 'weighbridge'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '总部基础资料', 'MENU', '/weighbridge/master', 'weighbridge/master/index', 'list-tree', 'weighbridge:master', 2, 1, 1, 1
FROM sys_menu WHERE permission_code = 'weighbridge'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '厂区接入', 'MENU', '/weighbridge/sites', 'weighbridge/sites/index', 'building2', 'weighbridge:sites', 3, 1, 1, 1
FROM sys_menu WHERE permission_code = 'weighbridge'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.deleted = 0 AND m.permission_code IN ('weighbridge', 'weighbridge:tickets', 'weighbridge:master')
ON CONFLICT (role_id, menu_id) DO NOTHING;

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code = 'ADMIN' AND r.deleted = 0 AND m.permission_code = 'weighbridge:sites'
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- +goose Down
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE permission_code IN ('weighbridge', 'weighbridge:tickets', 'weighbridge:master', 'weighbridge:sites') AND is_builtin = 1);
DELETE FROM sys_menu WHERE permission_code IN ('weighbridge', 'weighbridge:tickets', 'weighbridge:master', 'weighbridge:sites') AND is_builtin = 1;
