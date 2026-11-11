-- +goose Up
UPDATE sys_menu SET menu_name = '仓库维护', update_time = CURRENT_TIMESTAMP
WHERE permission_code IN ('grain-intake:granaries', 'grain-intake:granaries:manage')
  AND is_builtin = 1 AND deleted = 0;

-- +goose Down
UPDATE sys_menu SET menu_name = '粮仓维护', update_time = CURRENT_TIMESTAMP
WHERE permission_code IN ('grain-intake:granaries', 'grain-intake:granaries:manage')
  AND is_builtin = 1 AND deleted = 0;
