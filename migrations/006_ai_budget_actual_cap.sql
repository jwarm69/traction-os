-- Align the existing shared-AI ledger with the provider key's funded balance.
-- Preserve all spend records; only lower the cumulative ceiling.
UPDATE ai_budgets
SET limit_micros = 5000000
WHERE id = 'public-beta';
