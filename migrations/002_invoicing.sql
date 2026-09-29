-- 002: Invoicing. Prefer:  node migrations/run.js  (idempotent)
ALTER TABLE branch_master ADD COLUMN invoice_notes VARCHAR(500) NULL AFTER qst_rate;
-- invoice_header / invoice_detail: see migrations/run.js (CREATE TABLE IF NOT EXISTS)
-- Invoice numbers come from vts_seq_generator (seq_type='INV', branch_id=<org_id>).
-- To continue after your last Zoho invoice (e.g. INV-000338) run once:
--   INSERT INTO vts_seq_generator (seq_type, branch_id, last_seq_no) VALUES ('INV','TR',338)
--   ON DUPLICATE KEY UPDATE last_seq_no = 338;
