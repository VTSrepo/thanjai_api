-- Thanjai Restaurant: remove UAT test transactions before go-live.
-- KEEPS masters: branch_master, product_master, prod_selling_price_master, user_master, emp_master,
--                role_master, role_screen, category_master, business_unit_master, organization_master,
--                account_master, vts_ref_master, vts_inventory_config.
-- TAKE A BACKUP FIRST:  mysqldump -u <user> -p thanjai_restaurant > before_cleanup.sql
-- Run:                  mysql -u <user> -p thanjai_restaurant < scripts/uat_cleanup.sql

SET FOREIGN_KEY_CHECKS = 0;

-- indents, invoices, payments
TRUNCATE TABLE indent_batch_alloc;
TRUNCATE TABLE indent_charge;
TRUNCATE TABLE indent_detail;
TRUNCATE TABLE indent_goods_receipt;
TRUNCATE TABLE indent_header;
TRUNCATE TABLE indent_payment;
TRUNCATE TABLE indent_payment_schedule;
TRUNCATE TABLE invoice_payment;
TRUNCATE TABLE invoice_detail;
TRUNCATE TABLE invoice_header;

-- batches and stock
TRUNCATE TABLE stock_movement;
TRUNCATE TABLE batch_master;
TRUNCATE TABLE vts_daily_inventory;
TRUNCATE TABLE vts_eod_ops;

-- production and timesheets
TRUNCATE TABLE production_data;
TRUNCATE TABLE emp_timesheet;

-- restart indent / invoice / receipt / batch numbers (product id sequence PRD is kept)
UPDATE vts_seq_generator SET last_seq_no = 0 WHERE seq_type IN ('IND', 'INV', 'RCP', 'BATCH');

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'indent_header' AS tbl, COUNT(*) AS rows_left FROM indent_header
UNION ALL SELECT 'invoice_header', COUNT(*) FROM invoice_header
UNION ALL SELECT 'batch_master', COUNT(*) FROM batch_master
UNION ALL SELECT 'product_master', COUNT(*) FROM product_master
UNION ALL SELECT 'user_master', COUNT(*) FROM user_master;
