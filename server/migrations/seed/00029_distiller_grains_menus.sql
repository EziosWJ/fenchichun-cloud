-- +goose Up
INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
VALUES (0, '酒糟统计', 'DIR', '/distiller-grains', NULL, 'chart', 'distiller-grains', 6, 1, 1, 1)
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '本日出库', 'MENU', '/distiller-grains/today', 'distiller-grains/today/index', 'clipboard-list', 'distiller-grains:today', 1, 1, 1, 1
FROM sys_menu WHERE permission_code = 'distiller-grains'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '本周出库', 'MENU', '/distiller-grains/week', 'distiller-grains/week/index', 'chart', 'distiller-grains:week', 2, 1, 1, 1
FROM sys_menu WHERE permission_code = 'distiller-grains'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '本月出库', 'MENU', '/distiller-grains/month', 'distiller-grains/month/index', 'chart', 'distiller-grains:month', 3, 1, 1, 1
FROM sys_menu WHERE permission_code = 'distiller-grains'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '详细查询', 'MENU', '/distiller-grains/detail', 'distiller-grains/detail/index', 'file-search', 'distiller-grains:detail', 4, 1, 1, 1
FROM sys_menu WHERE permission_code = 'distiller-grains'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.deleted = 0
  AND r.role_code IN ('ADMIN', 'FINANCE', 'STORE')
  AND m.permission_code IN (
    'distiller-grains', 'distiller-grains:today', 'distiller-grains:week',
    'distiller-grains:month', 'distiller-grains:detail'
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- +goose Down
DELETE FROM sys_role_menu WHERE menu_id IN (
  SELECT id FROM sys_menu WHERE permission_code IN (
    'distiller-grains', 'distiller-grains:today', 'distiller-grains:week',
    'distiller-grains:month', 'distiller-grains:detail'
  ) AND is_builtin = 1
);
DELETE FROM sys_menu WHERE permission_code IN (
  'distiller-grains:today', 'distiller-grains:week', 'distiller-grains:month', 'distiller-grains:detail'
) AND is_builtin = 1;
DELETE FROM sys_menu WHERE permission_code = 'distiller-grains' AND is_builtin = 1;
