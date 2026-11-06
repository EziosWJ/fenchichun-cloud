-- +goose Up
INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, icon, permission_code, sort_order, visible, status, is_builtin)
VALUES (0, '统计与分析', 'DIR', '/analytics', 'chart', 'weighbridge:analytics', 6, 1, 1, 1)
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '客户对账', 'MENU', '/analytics/reconciliation', 'weighbridge/analytics/statement/index', 'file-search', 'weighbridge:analytics:statement', 1, 1, 1, 1
FROM sys_menu WHERE permission_code = 'weighbridge:analytics'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code = 'ADMIN' AND r.deleted = 0
  AND m.permission_code IN ('weighbridge:analytics', 'weighbridge:analytics:statement')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- +goose Down
DELETE FROM sys_role_menu WHERE menu_id IN (
  SELECT id FROM sys_menu
  WHERE permission_code IN ('weighbridge:analytics', 'weighbridge:analytics:statement') AND is_builtin = 1
);
DELETE FROM sys_menu
WHERE permission_code IN ('weighbridge:analytics', 'weighbridge:analytics:statement') AND is_builtin = 1;
