-- +goose Up
-- The template/sidebar frontend replaces the legacy shadcn/ui example pages.
-- Retire their built-in menu entries so no sidebar link points at a page that
-- no longer exists in the local route registry. Historical rows are kept.
UPDATE sys_menu
SET visible = 0, status = 0, update_time = CURRENT_TIMESTAMP
WHERE is_builtin = 1
  AND (permission_code LIKE 'examples%' OR path IN ('/examples', '/forms/basic'));

-- +goose Down
-- Restores the built-in example entries only when they are still retired.
UPDATE sys_menu
SET visible = 1, status = 1, update_time = CURRENT_TIMESTAMP
WHERE is_builtin = 1
  AND permission_code LIKE 'examples%'
  AND visible = 0
  AND status = 0;

UPDATE sys_menu
SET visible = 1, status = 1, update_time = CURRENT_TIMESTAMP
WHERE is_builtin = 1
  AND path = '/examples'
  AND permission_code = 'examples'
  AND visible = 0
  AND status = 0;
