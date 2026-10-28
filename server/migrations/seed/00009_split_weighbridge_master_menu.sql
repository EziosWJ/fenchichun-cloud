-- +goose Up
UPDATE sys_menu SET menu_name = '物料分类' WHERE permission_code = 'weighbridge:master' AND is_builtin = 1;

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, icon, permission_code, sort_order, visible, status, is_builtin)
SELECT id, v.name, 'MENU', v.path, v.component, 'list-tree', v.permission, v.sort_order, 1, 1, 1
FROM sys_menu CROSS JOIN (VALUES
  ('物料', '/weighbridge/master/materials', 'weighbridge/master/materials', 'weighbridge:materials', 3),
  ('往来主体', '/weighbridge/master/parties', 'weighbridge/master/parties', 'weighbridge:parties', 4)
) AS v(name, path, component, permission, sort_order)
WHERE permission_code = 'weighbridge'
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT rm.role_id, new_menu.id FROM sys_role_menu rm
JOIN sys_menu old_menu ON old_menu.id = rm.menu_id AND old_menu.permission_code = 'weighbridge:master'
JOIN sys_menu new_menu ON new_menu.permission_code IN ('weighbridge:materials', 'weighbridge:parties')
ON CONFLICT (role_id, menu_id) DO NOTHING;

UPDATE sys_menu SET sort_order = 5 WHERE permission_code = 'weighbridge:sites' AND is_builtin = 1;

-- +goose Down
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE permission_code IN ('weighbridge:materials', 'weighbridge:parties') AND is_builtin = 1);
DELETE FROM sys_menu WHERE permission_code IN ('weighbridge:materials', 'weighbridge:parties') AND is_builtin = 1;
UPDATE sys_menu SET menu_name = '总部基础资料' WHERE permission_code = 'weighbridge:master' AND is_builtin = 1;
UPDATE sys_menu SET sort_order = 3 WHERE permission_code = 'weighbridge:sites' AND is_builtin = 1;
