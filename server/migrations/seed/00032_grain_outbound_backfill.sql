-- +goose Up
-- Historical mobile-direct rows used gross then tare. Preserve their old net
-- meaning while new mobile_scan rows use factory tare then gross.
UPDATE grain_outbound_weighing
SET net_milli_tonne = first_weight_milli_tonne - COALESCE(second_weight_milli_tonne, 0)
WHERE source = 'mobile_direct' AND second_weight_milli_tonne IS NOT NULL;

-- The old pending state never had a factory handoff; it is not an active
-- session under the QR handoff flow.
UPDATE grain_outbound_weighing SET status = 'expired' WHERE status = 'pending';

-- +goose Down
SELECT 1;
