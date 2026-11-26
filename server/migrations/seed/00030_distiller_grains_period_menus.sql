-- +goose Up
INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '昨日出库', 'MENU', '/distiller-grains/yesterday', 'distiller-grains/yesterday/index', 'clipboard-list', 'distiller-grains:yesterday', 2, 1, 1, 1
FROM sys_menu WHERE permission_code = 'distiller-grains'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '上周出库', 'MENU', '/distiller-grains/last-week', 'distiller-grains/last-week/index', 'chart', 'distiller-grains:last-week', 4, 1, 1, 1
FROM sys_menu WHERE permission_code = 'distiller-grains'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '上月出库', 'MENU', '/distiller-grains/last-month', 'distiller-grains/last-month/index', 'chart', 'distiller-grains:last-month', 6, 1, 1, 1
FROM sys_menu WHERE permission_code = 'distiller-grains'
ON CONFLICT (permission_code) DO NOTHING;

UPDATE sys_menu SET sort_order = 3 WHERE permission_code = 'distiller-grains:week';
UPDATE sys_menu SET sort_order = 5 WHERE permission_code = 'distiller-grains:month';
UPDATE sys_menu SET sort_order = 7 WHERE permission_code = 'distiller-grains:detail';

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.deleted = 0
  AND r.role_code IN ('ADMIN', 'FINANCE', 'STORE')
  AND m.permission_code IN (
    'distiller-grains:yesterday', 'distiller-grains:last-week', 'distiller-grains:last-month'
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- +goose Down
DELETE FROM sys_role_menu WHERE menu_id IN (
  SELECT id FROM sys_menu WHERE permission_code IN (
    'distiller-grains:yesterday', 'distiller-grains:last-week', 'distiller-grains:last-month'
  ) AND is_builtin = 1
);
DELETE FROM sys_menu WHERE permission_code IN (
  'distiller-grains:yesterday', 'distiller-grains:last-week', 'distiller-grains:last-month'
) AND is_builtin = 1;
UPDATE sys_menu SET sort_order = 2 WHERE permission_code = 'distiller-grains:week';
UPDATE sys_menu SET sort_order = 3 WHERE permission_code = 'distiller-grains:month';
UPDATE sys_menu SET sort_order = 4 WHERE permission_code = 'distiller-grains:detail';
