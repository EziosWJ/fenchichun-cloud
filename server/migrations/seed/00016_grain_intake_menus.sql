-- +goose Up
INSERT INTO sys_menu (parent_id,menu_name,menu_type,path,component,icon,permission_code,sort_order,visible,status,is_builtin)
VALUES
 (0,'流转单','MENU','/grain-intake/trips','grain-intake/trips/index','clipboard-list','grain-intake:trips',7,1,1,1),
 (0,'出门证','MENU','/grain-intake/permits','grain-intake/permits/index','shield-check','grain-intake:permits',8,1,1,1)
ON CONFLICT (permission_code) DO NOTHING;
INSERT INTO sys_role_menu(role_id,menu_id)
SELECT r.id,m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code='ADMIN' AND r.deleted=0 AND m.permission_code IN ('grain-intake:trips','grain-intake:permits')
ON CONFLICT(role_id,menu_id) DO NOTHING;
-- +goose Down
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE permission_code IN ('grain-intake:trips','grain-intake:permits') AND is_builtin=1);
DELETE FROM sys_menu WHERE permission_code IN ('grain-intake:trips','grain-intake:permits') AND is_builtin=1;
