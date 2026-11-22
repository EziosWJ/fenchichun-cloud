-- +goose Up
-- 与云端财务角色的菜单配置保持一致，不分配具体用户。
INSERT INTO sys_role (role_name, role_code, status, is_builtin)
VALUES ('财务', 'FINANCE', 1, 0)
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code = 'FINANCE' AND r.deleted = 0 AND m.deleted = 0
  AND m.permission_code IN (
    'weighbridge', 'weighbridge:tickets', 'weighbridge:master',
    'weighbridge:materials', 'weighbridge:parties', 'weighbridge:tasks',
    'weighbridge:sites', 'weighbridge:sync', 'weighbridge:analytics',
    'weighbridge:analytics:overview', 'weighbridge:analytics:flow',
    'weighbridge:analytics:materials', 'weighbridge:analytics:parties',
    'weighbridge:analytics:quality', 'weighbridge:analytics:statement',
    'laboratory:inspections', 'grain-intake:visual', 'grain-intake:trip-edit',
    'grain-intake:unload', 'grain-intake:issue-permit',
    'grain-intake:approve-permit', 'grain-intake:trips',
    'grain-intake:release', 'grain-intake:permits',
    'grain-intake:granaries:manage', 'grain-intake:granaries',
    'grain-intake:deduction-rules'
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- +goose Down
-- 财务角色可能在迁移前已存在或已分配用户，回滚时保留业务数据。
SELECT 1;
