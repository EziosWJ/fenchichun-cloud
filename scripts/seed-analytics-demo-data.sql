-- 统计与分析 / 客户对账演示数据
--
-- 用途：
--   为本地开发库补充 2025-12 至 2026-11 的跨月过磅单，每个场景每天覆盖 3 种物料。
--   客户对账详情页可以稳定看到 30 天每日净重，以及 3 种物料的构成占比。
--
-- 可重复执行：
--   先清理 ticket_no 以 MOCK- 开头的旧模拟单据，再重新生成。
--
-- 执行：
--   docker exec -i postgres psql -U postgres -d fenchichun_cloud \
--     < scripts/seed-analytics-demo-data.sql

BEGIN;

DELETE FROM wb_cloud_ticket_change
WHERE ticket_id IN (SELECT id FROM wb_cloud_ticket WHERE ticket_no LIKE 'MOCK-%');

DELETE FROM wb_cloud_change
WHERE ticket_id IN (SELECT id FROM wb_cloud_ticket WHERE ticket_no LIKE 'MOCK-%');

DELETE FROM wb_cloud_ticket
WHERE ticket_no LIKE 'MOCK-%';

WITH scenario_materials (
    site_code,
    party_code,
    direction,
    material_code,
    material_order,
    gross_base,
    tare_base
) AS (
    VALUES
        -- 入厂供应商：高粱 / 大麦 / 豌豆
        ('SITE01', 'C-P-0077', 'inbound', 'C-M-0010', 1, 36.0, 13.0),
        ('SITE01', 'C-P-0077', 'inbound', 'C-M-0007', 2, 32.0, 11.0),
        ('SITE01', 'C-P-0077', 'inbound', 'C-M-0001', 3, 29.0, 10.0),

        -- 入厂供应商：谷糠 / 大麦 / 豌豆
        ('SITE02', 'C-P-0078', 'inbound', 'C-M-0009', 1, 20.0, 7.0),
        ('SITE02', 'C-P-0078', 'inbound', 'C-M-0007', 2, 32.0, 11.0),
        ('SITE02', 'C-P-0078', 'inbound', 'C-M-0001', 3, 29.0, 10.0),

        -- 入厂供应商：高粱 / 大麦 / 谷糠
        ('SITE03', 'C-P-0028', 'inbound', 'C-M-0010', 1, 36.0, 13.0),
        ('SITE03', 'C-P-0028', 'inbound', 'C-M-0007', 2, 32.0, 11.0),
        ('SITE03', 'C-P-0028', 'inbound', 'C-M-0009', 3, 20.0, 7.0),

        -- 出厂客户：成品白酒 / 酒糟 / 基酒
        ('SITE02', 'C-P-0031', 'outbound', 'C-M-0005', 1, 18.0, 9.0),
        ('SITE02', 'C-P-0031', 'outbound', 'C-M-0006', 2, 30.0, 21.0),
        ('SITE02', 'C-P-0031', 'outbound', 'C-M-0004', 3, 24.0, 10.0),

        -- 出厂客户：酒糟 / 成品白酒 / 基酒
        ('SITE03', 'C-P-0066', 'outbound', 'C-M-0006', 1, 30.0, 21.0),
        ('SITE03', 'C-P-0066', 'outbound', 'C-M-0005', 2, 18.0, 9.0),
        ('SITE03', 'C-P-0066', 'outbound', 'C-M-0004', 3, 24.0, 10.0),

        -- 出厂客户：酒糟 / 成品白酒 / 基酒
        ('SITE01', 'C-P-0067', 'outbound', 'C-M-0006', 1, 30.0, 21.0),
        ('SITE01', 'C-P-0067', 'outbound', 'C-M-0005', 2, 18.0, 9.0),
        ('SITE01', 'C-P-0067', 'outbound', 'C-M-0004', 3, 24.0, 10.0)
),
days AS (
    SELECT generate_series('2025-12-01'::date, '2026-11-30'::date, interval '1 day')::date AS day
),
base AS (
    SELECT
        sm.site_code,
        sm.party_code,
        sm.direction,
        sm.material_code,
        sm.material_order,
        sm.gross_base,
        sm.tare_base,
        d.day,
        site.name AS site_name,
        party.name AS party_name,
        material.name AS material_name,
        material.spec AS material_spec,
        EXTRACT(DAY FROM d.day)::int AS day_num,
        ROW_NUMBER() OVER (
            PARTITION BY sm.site_code, d.day
            ORDER BY sm.party_code, sm.material_order
        ) AS seq
    FROM scenario_materials sm
    CROSS JOIN days d
    JOIN wb_cloud_site site ON site.code = sm.site_code
    JOIN wb_cloud_party party ON party.code = sm.party_code
    JOIN wb_cloud_material material ON material.code = sm.material_code
),
calc AS (
    SELECT
        *,
        ROUND((gross_base + ((day_num * 7) % 11) - 5)::numeric, 3) AS gross_t,
        ROUND((tare_base + ((day_num * 3) % 5) - 2)::numeric, 3) AS tare_t,
        CASE
            WHEN (day_num + material_order) % 5 = 0 THEN 0.800
            WHEN (day_num + material_order) % 3 = 0 THEN 0.300
            ELSE 0.000
        END::numeric AS adjustment_t
    FROM base
),
weighted AS (
    SELECT
        *,
        ROUND(gross_t - tare_t - adjustment_t, 3) AS net_t,
        (
            day::timestamp
            + CASE WHEN direction = 'inbound' THEN interval '8 hours' ELSE interval '14 hours' END
            + (material_order * interval '1 hour')
            + ((day_num % 4) * interval '15 minutes')
        ) AT TIME ZONE 'Asia/Shanghai' AS issued_at
    FROM calc
),
numbered AS (
    SELECT
        *,
        'MOCK-' || site_code || '-' || to_char(day, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0') AS ticket_no,
        '晋A' || lpad((((seq * 137 + day_num * 17) % 90000) + 10000)::text, 5, '0') AS plate,
        issued_at - interval '20 minutes' AS first_confirmed_at,
        issued_at AS second_confirmed_at
    FROM weighted
)
INSERT INTO wb_cloud_ticket (
    site_code,
    issued_site_code,
    ticket_no,
    previous_ticket_no,
    previous_site_code,
    status,
    direction,
    plate,
    issued_at,
    material_code,
    party_code,
    final_net_milli_tonne,
    snapshot,
    void_reason,
    voided_by,
    voided_at,
    latest_change_type,
    latest_received_at
)
SELECT
    site_code,
    site_code,
    ticket_no,
    NULL,
    NULL,
    'valid',
    direction,
    plate,
    issued_at,
    material_code,
    party_code,
    ROUND(net_t * 1000)::bigint,
    jsonb_build_object(
        'ticketNo', ticket_no,
        'previousTicketNo', NULL,
        'title', '酒厂过磅单',
        'plate', plate,
        'direction', direction,
        'materialCode', material_code,
        'materialName', material_name,
        'materialSpec', material_spec,
        'partyCode', party_code,
        'partyName', party_name,
        'firstConfirmedAt', to_char(first_confirmed_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS+08:00'),
        'secondConfirmedAt', to_char(second_confirmed_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS+08:00'),
        'issuedAt', to_char(issued_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS+08:00'),
        'issuerName', '模拟司磅员',
        'originalGross', to_char(gross_t, 'FM999990.000'),
        'originalTare', to_char(tare_t, 'FM999990.000'),
        'finalGross', to_char(gross_t, 'FM999990.000'),
        'finalTare', to_char(tare_t, 'FM999990.000'),
        'finalNet', to_char(net_t, 'FM999990.000'),
        'netAdjustment', to_char(adjustment_t, 'FM999990.000'),
        'netAdjustmentMode', 'amount',
        'netAdjustmentRateBp', NULL,
        'netAdjustmentCategory', CASE WHEN adjustment_t > 0 THEN 'QUALITY' ELSE '' END,
        'netAdjustmentCategoryName', CASE WHEN adjustment_t > 0 THEN '质量差' ELSE '' END,
        'previousFinalGross', NULL,
        'previousFinalTare', NULL,
        'previousFinalNet', NULL,
        'previousNetAdjustment', NULL,
        'grossSource', 'collected',
        'tareSource', 'collected',
        'adjustmentRemark', CASE WHEN adjustment_t > 0 THEN '模拟数据净重调整' ELSE '' END,
        'adjustedBy', CASE WHEN adjustment_t > 0 THEN '模拟司磅员' ELSE NULL END,
        'adjustedAt', CASE
            WHEN adjustment_t > 0
                THEN to_char(issued_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS+08:00')
            ELSE NULL
        END,
        'driver', '模拟司机' || material_order::text,
        'driverPhone', '1380000' || lpad(seq::text, 4, '0'),
        'contactName', '模拟联系人',
        'contactPhone', '13900000000'
    )::text,
    NULL,
    NULL,
    NULL,
    'issue',
    issued_at + interval '1 minute'
FROM numbered
WHERE net_t > 0;

-- 从 snapshot 回填统计与分析派生列（与 seed/00014_analytics_backfill.sql 一致）
UPDATE wb_cloud_ticket
SET
    original_gross_milli_tonne = round(NULLIF(snapshot::jsonb->>'originalGross', '')::numeric * 1000)::bigint,
    original_tare_milli_tonne = round(NULLIF(snapshot::jsonb->>'originalTare', '')::numeric * 1000)::bigint,
    final_gross_milli_tonne = round(NULLIF(snapshot::jsonb->>'finalGross', '')::numeric * 1000)::bigint,
    final_tare_milli_tonne = round(NULLIF(snapshot::jsonb->>'finalTare', '')::numeric * 1000)::bigint,
    pre_adjustment_net_milli_tonne =
        round(NULLIF(snapshot::jsonb->>'finalGross', '')::numeric * 1000)::bigint
        - round(NULLIF(snapshot::jsonb->>'finalTare', '')::numeric * 1000)::bigint,
    net_adjustment_milli_tonne = round(NULLIF(snapshot::jsonb->>'netAdjustment', '')::numeric * 1000)::bigint,
    adjustment_known = NULLIF(snapshot::jsonb->>'netAdjustment', '') IS NOT NULL,
    adjusted = NULLIF(snapshot::jsonb->>'netAdjustment', '') IS NOT NULL
        AND NULLIF(snapshot::jsonb->>'netAdjustment', '')::numeric <> 0,
    adjustment_mode = NULLIF(snapshot::jsonb->>'netAdjustmentMode', ''),
    adjustment_category = NULLIF(snapshot::jsonb->>'netAdjustmentCategory', ''),
    adjustment_category_name = NULLIF(snapshot::jsonb->>'netAdjustmentCategoryName', ''),
    first_confirmed_at = NULLIF(snapshot::jsonb->>'firstConfirmedAt', '')::timestamptz,
    second_confirmed_at = NULLIF(snapshot::jsonb->>'secondConfirmedAt', '')::timestamptz,
    weigh_interval_seconds = EXTRACT(EPOCH FROM (
        NULLIF(snapshot::jsonb->>'secondConfirmedAt', '')::timestamptz
        - NULLIF(snapshot::jsonb->>'firstConfirmedAt', '')::timestamptz
    ))::bigint,
    issued_lag_seconds = EXTRACT(EPOCH FROM (
        issued_at - NULLIF(snapshot::jsonb->>'secondConfirmedAt', '')::timestamptz
    ))::bigint,
    cross_day = COALESCE((
        (NULLIF(snapshot::jsonb->>'firstConfirmedAt', '')::timestamptz AT TIME ZONE 'Asia/Shanghai')::date
        <> (NULLIF(snapshot::jsonb->>'secondConfirmedAt', '')::timestamptz AT TIME ZONE 'Asia/Shanghai')::date
    ), FALSE),
    gross_source = NULLIF(snapshot::jsonb->>'grossSource', ''),
    tare_source = NULLIF(snapshot::jsonb->>'tareSource', ''),
    issuer_name = NULLIF(snapshot::jsonb->>'issuerName', ''),
    driver = NULLIF(snapshot::jsonb->>'driver', ''),
    driver_phone = NULLIF(snapshot::jsonb->>'driverPhone', ''),
    contact_name = NULLIF(snapshot::jsonb->>'contactName', ''),
    contact_phone = NULLIF(snapshot::jsonb->>'contactPhone', ''),
    material_name = NULLIF(snapshot::jsonb->>'materialName', ''),
    material_spec = NULLIF(snapshot::jsonb->>'materialSpec', ''),
    party_name = NULLIF(snapshot::jsonb->>'partyName', ''),
    issued_date = (issued_at AT TIME ZONE 'Asia/Shanghai')::date;

COMMIT;
