-- +goose Up
-- 统计与分析：新增 5 个二级页面，客户对账保留并排到最后。
INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '经营总览', 'MENU', '/analytics/overview', 'weighbridge/analytics/overview/index', 'layout-dashboard', 'weighbridge:analytics:overview', 1, 1, 1, 1
FROM sys_menu WHERE permission_code = 'weighbridge:analytics'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '进出厂分析', 'MENU', '/analytics/flow', 'weighbridge/analytics/flow/index', 'arrow-left-right', 'weighbridge:analytics:flow', 2, 1, 1, 1
FROM sys_menu WHERE permission_code = 'weighbridge:analytics'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '物料分析', 'MENU', '/analytics/materials', 'weighbridge/analytics/materials/index', 'package', 'weighbridge:analytics:materials', 3, 1, 1, 1
FROM sys_menu WHERE permission_code = 'weighbridge:analytics'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '供收方分析', 'MENU', '/analytics/parties', 'weighbridge/analytics/parties/index', 'users', 'weighbridge:analytics:parties', 4, 1, 1, 1
FROM sys_menu WHERE permission_code = 'weighbridge:analytics'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, '数据质量', 'MENU', '/analytics/quality', 'weighbridge/analytics/quality/index', 'shield-check', 'weighbridge:analytics:quality', 5, 1, 1, 1
FROM sys_menu WHERE permission_code = 'weighbridge:analytics'
ON CONFLICT (permission_code) DO NOTHING;

UPDATE sys_menu SET sort_order = 6 WHERE permission_code = 'weighbridge:analytics:statement';

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code = 'ADMIN' AND r.deleted = 0
  AND m.permission_code IN (
    'weighbridge:analytics:overview',
    'weighbridge:analytics:flow',
    'weighbridge:analytics:materials',
    'weighbridge:analytics:parties',
    'weighbridge:analytics:quality'
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- +goose Down
UPDATE sys_menu SET sort_order = 1 WHERE permission_code = 'weighbridge:analytics:statement';

DELETE FROM sys_role_menu WHERE menu_id IN (
  SELECT id FROM sys_menu
  WHERE permission_code IN (
    'weighbridge:analytics:overview',
    'weighbridge:analytics:flow',
    'weighbridge:analytics:materials',
    'weighbridge:analytics:parties',
    'weighbridge:analytics:quality'
  ) AND is_builtin = 1
);

DELETE FROM sys_menu
WHERE permission_code IN (
  'weighbridge:analytics:overview',
  'weighbridge:analytics:flow',
  'weighbridge:analytics:materials',
  'weighbridge:analytics:parties',
  'weighbridge:analytics:quality'
) AND is_builtin = 1;
