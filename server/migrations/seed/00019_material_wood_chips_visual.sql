-- +goose Up
-- 木片按业务确认使用目测检验；其余货品保持默认的化验。
UPDATE wb_cloud_material
SET inspection_method = 'visual'
WHERE code = 'C-M-0008' AND name = '木片';

-- +goose Down
UPDATE wb_cloud_material
SET inspection_method = 'lab'
WHERE code = 'C-M-0008' AND name = '木片';
