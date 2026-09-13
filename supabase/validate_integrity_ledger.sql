-- Validação local da integrity_ledger (executado apenas no Supabase LOCAL).
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
SELECT 'tenantA rows: ' || count(*) FROM integrity_ledger;
-- Cross-tenant: user B
SET request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
SELECT 'tenantB rows: ' || count(*) FROM integrity_ledger;
-- Escrita como authenticated (deve falhar)
INSERT INTO integrity_ledger (organization_id, event_type, event_id, previous_hash, current_hash)
VALUES ('aaaaaaa1-0000-4000-8000-000000000001','AUDIT_LOG','hack', repeat('0',64), repeat('f',64));
SELECT 'INSERT succeeded (BAD)' AS write_check;
-- Idempotência: como service role, duplicar event_id deve falhar
RESET ROLE;
INSERT INTO integrity_ledger (organization_id, event_type, event_id, previous_hash, current_hash)
VALUES ('aaaaaaa1-0000-4000-8000-000000000001', NULL, 'AUDIT_LOG', 'evt-A1', repeat('0',64), repeat('b',64));
SELECT 'duplicate INSERT succeeded (BAD)' AS idem_check;
