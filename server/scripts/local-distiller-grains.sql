-- Local development accounts for 酒糟出库 mobile weighing and 酒糟统计.
-- Run after `task db:migrate`:
--   docker exec -i postgres psql -U postgres -d base_go_api < server/scripts/local-distiller-grains.sql
-- or `task db:seed:local-distiller-grains`.
-- The script is idempotent.
--   outbound01 / outbound123456  酒糟出库手机过磅
--   finance01  / finance123456   财务查看酒糟统计
BEGIN;

-- Roles are normally created by seed migrations 00028 and 00031. Keep the
-- inserts here so a fresh local database can be bootstrapped in one step.
INSERT INTO sys_role (role_name, role_code, status, is_builtin)
VALUES ('财务', 'FINANCE', 1, 0)
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO sys_role (role_name, role_code, status, is_builtin)
VALUES ('酒糟出库', 'GRAIN_OUT', 1, 1)
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO sys_user (username, nickname, password, gender, dept_id, status, is_builtin, remark)
VALUES (
    'outbound01',
    '酒糟出库',
    '$2a$10$AKMLaX3PY0QEOXuB7VMwauX8v5jHRsbglJbZJ7xJH1HDzpuzMrdxG',
    'UNSPECIFIED',
    1,
    1,
    1,
    '酒糟出库测试账号'
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO sys_user (username, nickname, password, gender, dept_id, status, is_builtin, remark)
VALUES (
    'finance01',
    '财务',
    '$2a$10$6.lg1DzyRIRGPSbG8qgxNekrBnNQWFg63CKE4scdUc44yWPsDjoTG',
    'UNSPECIFIED',
    1,
    1,
    1,
    '酒糟统计财务测试账号'
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO sys_user_role (user_id, role_id)
SELECT u.id, r.id
FROM sys_user u
JOIN sys_role r ON r.role_code = 'GRAIN_OUT' AND r.deleted = 0
WHERE u.username = 'outbound01' AND u.deleted = 0
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO sys_user_role (user_id, role_id)
SELECT u.id, r.id
FROM sys_user u
JOIN sys_role r ON r.role_code = 'FINANCE' AND r.deleted = 0
WHERE u.username = 'finance01' AND u.deleted = 0
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Bind the outbound account to a real customer, plate and site in the local
-- database. The mobile page never trusts plate/party values from the client.
INSERT INTO grain_outbound_account (user_id, party_code, plate, site_code, scale_code, enabled)
SELECT u.id, 'C-P-0031', '晋JN0429', 'F001', 'WB01', TRUE
FROM sys_user u
WHERE u.username = 'outbound01' AND u.deleted = 0
ON CONFLICT (user_id) DO UPDATE SET
    party_code = EXCLUDED.party_code,
    plate = EXCLUDED.plate,
    site_code = EXCLUDED.site_code,
    scale_code = EXCLUDED.scale_code,
    enabled = TRUE,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
