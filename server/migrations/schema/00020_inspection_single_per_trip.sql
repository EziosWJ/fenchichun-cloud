-- +goose Up
-- 一张流转单只保留一条化验记录：历史重复记录与流转单解绑（保留数据，不删除），再建唯一索引。
UPDATE grain_inspection i
SET trip_id = NULL
FROM (
    SELECT id, row_number() OVER (PARTITION BY trip_id ORDER BY (status = 'confirmed') DESC, id DESC) AS rn
    FROM grain_inspection
    WHERE trip_id IS NOT NULL
) r
WHERE i.id = r.id AND r.rn > 1;

-- 已有化验但未指定生效单的流转单，补上生效依据，保证阶段判断一致。
UPDATE grain_trip t
SET effective_inspection_id = i.id,
    effective_selected_at = COALESCE(t.effective_selected_at, i.confirmed_at, i.created_at),
    effective_selected_by = COALESCE(t.effective_selected_by, i.confirmed_by, i.created_by)
FROM grain_inspection i
WHERE i.trip_id = t.id AND t.effective_inspection_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_grain_inspection_trip ON grain_inspection(trip_id) WHERE trip_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS uk_grain_inspection_trip;
