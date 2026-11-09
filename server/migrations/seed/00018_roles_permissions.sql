-- +goose Up
-- 三个业务角色：化验员、保安员、库管员。
INSERT INTO sys_role (role_name, role_code, status, sort_order, is_builtin, remark) VALUES
 ('化验员', 'LAB',   1, 10, 1, '只能录入化验/目测结果'),
 ('保安员', 'GUARD', 1, 11, 1, '只能确认车辆出厂'),
 ('库管员', 'STORE', 1, 12, 1, '负责登记、卸粮、磅单、开证与审批')
ON CONFLICT (role_code) DO NOTHING;

-- 测试账号：密码分别为 lab123456 / guard123456 / store123456（BCrypt cost 10）。
INSERT INTO sys_user (username, nickname, password, gender, dept_id, status, is_builtin, remark) VALUES
 ('lab01',   '化验员', '$2a$10$wSWnDzuJ.Sfdl/7H5USKaO9tXH4GUT1MLWWbg9WwvF57dXbd74YfG', 'UNSPECIFIED', 1, 1, 1, '化验员账号'),
 ('guard01', '保安员', '$2a$10$dXwWNvGIniH.PUbO1WvKzOb8JJBYzVvqgQSNMDh5HnAXyY177WkqS', 'UNSPECIFIED', 1, 1, 1, '保安员账号'),
 ('store01', '库管员', '$2a$10$OkS6AxNJO2rCmogxJHLt1.ODVK01Emb338pzD8hXeWOjeG.GLz2LW', 'UNSPECIFIED', 1, 1, 1, '库管员账号')
ON CONFLICT (username) DO NOTHING;

INSERT INTO sys_user_role (user_id, role_id)
SELECT u.id, r.id FROM sys_user u JOIN sys_role r ON r.role_code='LAB'   WHERE u.username='lab01'   AND u.deleted=0 AND r.deleted=0
ON CONFLICT (user_id, role_id) DO NOTHING;
INSERT INTO sys_user_role (user_id, role_id)
SELECT u.id, r.id FROM sys_user u JOIN sys_role r ON r.role_code='GUARD' WHERE u.username='guard01' AND u.deleted=0 AND r.deleted=0
ON CONFLICT (user_id, role_id) DO NOTHING;
INSERT INTO sys_user_role (user_id, role_id)
SELECT u.id, r.id FROM sys_user u JOIN sys_role r ON r.role_code='STORE' WHERE u.username='store01' AND u.deleted=0 AND r.deleted=0
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 细粒度操作权限点（不在侧边栏显示）。
INSERT INTO sys_menu (parent_id, menu_name, menu_type, permission_code, sort_order, visible, status, is_builtin) VALUES
 (0, '化验录入',   'MENU', 'laboratory:inspect',            0, 0, 1, 1),
 (0, '目测记录',   'MENU', 'grain-intake:visual',           1, 0, 1, 1),
 (0, '登记与更正', 'MENU', 'grain-intake:trip-edit',        2, 0, 1, 1),
 (0, '确认卸粮',   'MENU', 'grain-intake:unload',           3, 0, 1, 1),
 (0, '关联磅单',   'MENU', 'grain-intake:ticket',           4, 0, 1, 1),
 (0, '开具出门证', 'MENU', 'grain-intake:issue-permit',     5, 0, 1, 1),
 (0, '审批出门证', 'MENU', 'grain-intake:approve-permit',   6, 0, 1, 1),
 (0, '确认出厂',   'MENU', 'grain-intake:release',          7, 0, 1, 1),
 (0, '粮仓维护',   'MENU', 'grain-intake:granaries:manage', 8, 0, 1, 1)
ON CONFLICT (permission_code) DO NOTHING;

-- 所有角色都能查看全部业务页面。
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code IN ('LAB','GUARD','STORE') AND r.deleted=0
  AND m.permission_code IN ('grain-intake:trips','grain-intake:permits','laboratory:inspections','grain-intake:granaries')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- 化验员：化验与目测。
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code='LAB' AND r.deleted=0
  AND m.permission_code IN ('laboratory:inspect','grain-intake:visual')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- 保安员：确认出厂。
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code='GUARD' AND r.deleted=0
  AND m.permission_code IN ('grain-intake:release')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- 库管员：除化验与放行外的全部流转操作。
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code='STORE' AND r.deleted=0
  AND m.permission_code IN ('grain-intake:trip-edit','grain-intake:unload','grain-intake:ticket','grain-intake:issue-permit','grain-intake:approve-permit','grain-intake:granaries:manage')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- 管理员保留全部新权限。
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code='ADMIN' AND r.deleted=0
  AND m.permission_code IN ('laboratory:inspect','grain-intake:visual','grain-intake:trip-edit','grain-intake:unload','grain-intake:ticket','grain-intake:issue-permit','grain-intake:approve-permit','grain-intake:release','grain-intake:granaries:manage')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- +goose Down
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE permission_code IN ('laboratory:inspect','grain-intake:visual','grain-intake:trip-edit','grain-intake:unload','grain-intake:ticket','grain-intake:issue-permit','grain-intake:approve-permit','grain-intake:release','grain-intake:granaries:manage'));
DELETE FROM sys_role_menu WHERE role_id IN (SELECT id FROM sys_role WHERE role_code IN ('LAB','GUARD','STORE'));
DELETE FROM sys_user_role WHERE user_id IN (SELECT id FROM sys_user WHERE username IN ('lab01','guard01','store01'));
DELETE FROM sys_user WHERE username IN ('lab01','guard01','store01');
DELETE FROM sys_role WHERE role_code IN ('LAB','GUARD','STORE');
DELETE FROM sys_menu WHERE permission_code IN ('laboratory:inspect','grain-intake:visual','grain-intake:trip-edit','grain-intake:unload','grain-intake:ticket','grain-intake:issue-permit','grain-intake:approve-permit','grain-intake:release','grain-intake:granaries:manage') AND is_builtin=1;
