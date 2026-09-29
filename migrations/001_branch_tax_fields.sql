-- 001: Branch master - address + Canadian sales tax (GST/HST, QST) details for invoicing.
-- Prefer running:  node migrations/run.js   (idempotent; skips columns that already exist)
-- Plain SQL equivalent (run once only):

ALTER TABLE branch_master
  ADD COLUMN branch_city      VARCHAR(100) NULL AFTER branch_address,
  ADD COLUMN province_code    VARCHAR(2)   NULL AFTER branch_city,      -- QC, ON, BC ...
  ADD COLUMN postal_code      VARCHAR(10)  NULL AFTER province_code,
  ADD COLUMN ownership_type   VARCHAR(1)   NULL DEFAULT 'O' AFTER branch_type, -- O = Own, F = Franchise
  ADD COLUMN legal_name       VARCHAR(200) NULL AFTER ownership_type,   -- billing / legal entity name
  ADD COLUMN gst_hst_reg_no   VARCHAR(20)  NULL AFTER legal_name,       -- e.g. 123456789RT0001
  ADD COLUMN qst_reg_no       VARCHAR(20)  NULL AFTER gst_hst_reg_no,   -- e.g. 1234567890TQ0001 (Quebec)
  ADD COLUMN gst_hst_rate     DECIMAL(6,3) NULL AFTER qst_reg_no,       -- % e.g. 5.000 or 13.000
  ADD COLUMN qst_rate         DECIMAL(6,3) NULL AFTER gst_hst_rate;     -- % e.g. 9.975 (QC only)
