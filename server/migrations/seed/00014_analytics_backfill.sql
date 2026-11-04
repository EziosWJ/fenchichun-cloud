-- +goose Up
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

-- +goose Down
SELECT 1;
