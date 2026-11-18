-- =====================================================================
--  Tanjo Foods – e-commerce database
--  Database / schema : Tanjofoods
--  Engine            : MySQL 8.0+ (InnoDB, utf8mb4)
--  Run order         : 01_schema.sql  ->  02_seed.sql
-- =====================================================================
--  Table map
--   Catalogue : categories, products, product_images, product_variants*
--   Stock     : inventory, inventory_transactions
--   Customers : customers, customer_addresses
--   Orders    : orders, order_items, order_status_history, payments
--   Pricing   : tax_rates, coupons, coupon_redemptions, delivery_zones,
--               delivery_slots
--   Website   : enquiries, newsletter_subscribers, product_notify_requests
--   Admin     : admin_users, admin_sessions, settings, audit_log
--   Pricing+  : product_price_history (every price with effective from/to dates)
--   Import    : product_import_batches, product_import_rows
--   (*) product_variants is optional – use when one product is sold in
--       several pack sizes (e.g. 150 g and 400 g bag).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS Tanjofoods
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE Tanjofoods;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- CATALOGUE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  category_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(20)  NOT NULL UNIQUE,            -- SNACKS, RTE, SAUCES, BEV ...
  name_en         VARCHAR(100) NOT NULL,
  name_fr         VARCHAR(100) NULL,
  description_en  VARCHAR(500) NULL,
  description_fr  VARCHAR(500) NULL,
  image_file      VARCHAR(255) NULL,
  parent_id       INT UNSIGNED NULL,
  sort_order      SMALLINT     NOT NULL DEFAULT 0,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories(category_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  product_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sku               VARCHAR(30)   NOT NULL UNIQUE,         -- TF-SN-001
  category_id       INT UNSIGNED  NOT NULL,
  brand             VARCHAR(60)   NOT NULL DEFAULT 'Tanjo',
  name_en           VARCHAR(150)  NOT NULL,
  name_fr           VARCHAR(150)  NULL,                    -- required on Quebec labels / site
  regional_name     VARCHAR(100)  NULL,                    -- e.g. Thattai, Kara Sev
  slug              VARCHAR(160)  NOT NULL UNIQUE,
  short_desc_en     VARCHAR(300)  NULL,
  short_desc_fr     VARCHAR(300)  NULL,
  long_desc_en      TEXT          NULL,
  long_desc_fr      TEXT          NULL,
  ingredients_en    TEXT          NULL,
  ingredients_fr    TEXT          NULL,
  allergens         VARCHAR(255)  NULL,                    -- "Milk, Sesame, Peanuts"
  may_contain       VARCHAR(255)  NULL,
  dietary_tags      VARCHAR(255)  NULL,                    -- "Vegetarian,Gluten-free,Spicy"
  spice_level       TINYINT       NULL,                    -- 0 none .. 3 hot
  prep_type         ENUM('READY_TO_EAT','READY_TO_COOK','READY_TO_DRINK') NOT NULL DEFAULT 'READY_TO_EAT',
  storage_type      ENUM('AMBIENT','CHILLED','FROZEN') NOT NULL DEFAULT 'AMBIENT',
  shelf_life_days   SMALLINT UNSIGNED NULL,
  heating_instructions TEXT       NULL,
  pack_size_value   DECIMAL(10,2) NULL,                    -- 150
  pack_size_unit    ENUM('g','kg','ml','L','pcs','pack') NULL,
  pack_size_label   VARCHAR(60)   NULL,                    -- "150 g", "Pack of 6"
  units_per_case    SMALLINT UNSIGNED NULL,                -- for wholesale
  upc_barcode       VARCHAR(20)   NULL,
  price             DECIMAL(10,2) NOT NULL,                -- retail selling price (CAD)
  compare_at_price  DECIMAL(10,2) NULL,                    -- strike-through price
  cost_price        DECIMAL(10,2) NULL,                    -- internal only
  wholesale_price   DECIMAL(10,2) NULL,
  is_taxable        TINYINT(1)    NOT NULL DEFAULT 1,      -- 0 = zero-rated basic grocery
  min_order_qty     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  max_order_qty     SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  weight_grams      INT UNSIGNED  NULL,                    -- shipping weight
  status            ENUM('DRAFT','ACTIVE','COMING_SOON','OUT_OF_STOCK','HIDDEN','DISCONTINUED') NOT NULL DEFAULT 'DRAFT',
  is_featured       TINYINT(1)    NOT NULL DEFAULT 0,
  sort_order        SMALLINT      NOT NULL DEFAULT 0,
  meta_title        VARCHAR(160)  NULL,
  meta_description  VARCHAR(300)  NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_cat FOREIGN KEY (category_id) REFERENCES categories(category_id),
  INDEX ix_prod_status (status, category_id, sort_order),
  FULLTEXT INDEX ft_prod_search (name_en, name_fr, regional_name, short_desc_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_images (
  image_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id    INT UNSIGNED NOT NULL,
  file_name     VARCHAR(255) NOT NULL,                     -- assets/img/... or CDN URL
  alt_text      VARCHAR(200) NULL,
  is_primary    TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order    SMALLINT     NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_img_prod FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
  INDEX ix_img_prod (product_id, is_primary)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_variants (
  variant_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id       INT UNSIGNED NOT NULL,
  sku              VARCHAR(30)  NOT NULL UNIQUE,
  label            VARCHAR(60)  NOT NULL,                  -- "400 g family pack"
  pack_size_value  DECIMAL(10,2) NULL,
  pack_size_unit   ENUM('g','kg','ml','L','pcs','pack') NULL,
  price            DECIMAL(10,2) NOT NULL,
  compare_at_price DECIMAL(10,2) NULL,
  upc_barcode      VARCHAR(20)  NULL,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order       SMALLINT     NOT NULL DEFAULT 0,
  CONSTRAINT fk_var_prod FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- STOCK
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  product_id       INT UNSIGNED PRIMARY KEY,
  qty_on_hand      INT          NOT NULL DEFAULT 0,
  qty_reserved     INT          NOT NULL DEFAULT 0,        -- in open orders
  reorder_level    INT          NOT NULL DEFAULT 0,
  track_inventory  TINYINT(1)   NOT NULL DEFAULT 1,
  allow_backorder  TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_prod FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  txn_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id    INT UNSIGNED NOT NULL,
  txn_type      ENUM('RECEIPT','SALE','RETURN','ADJUSTMENT','WASTAGE','RESERVE','RELEASE') NOT NULL,
  qty           INT          NOT NULL,                     -- +in / -out
  batch_no      VARCHAR(40)  NULL,                         -- links to Thanjai batch system
  expiry_date   DATE         NULL,
  ref_order_id  BIGINT UNSIGNED NULL,
  note          VARCHAR(255) NULL,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_it_prod FOREIGN KEY (product_id) REFERENCES products(product_id),
  INDEX ix_it_prod (product_id, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  customer_id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email             VARCHAR(190) NOT NULL UNIQUE,
  first_name        VARCHAR(80)  NOT NULL,
  last_name         VARCHAR(80)  NULL,
  phone             VARCHAR(30)  NULL,
  password_hash     VARCHAR(255) NULL,                     -- NULL = guest checkout
  preferred_lang    ENUM('en','fr') NOT NULL DEFAULT 'en',
  customer_type     ENUM('RETAIL','WHOLESALE','DISTRIBUTOR') NOT NULL DEFAULT 'RETAIL',
  marketing_opt_in  TINYINT(1)   NOT NULL DEFAULT 0,       -- CASL consent
  opt_in_at         DATETIME     NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at     DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_addresses (
  address_id    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id   BIGINT UNSIGNED NOT NULL,
  label         VARCHAR(40)  NULL,                         -- Home, Office
  line1         VARCHAR(150) NOT NULL,
  line2         VARCHAR(150) NULL,
  city          VARCHAR(80)  NOT NULL DEFAULT 'Montreal',
  province      CHAR(2)      NOT NULL DEFAULT 'QC',
  postal_code   VARCHAR(7)   NOT NULL,
  country       CHAR(2)      NOT NULL DEFAULT 'CA',
  instructions  VARCHAR(255) NULL,
  is_default    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_addr_cust FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PRICING / DELIVERY
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_rates (
  tax_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(10)   NOT NULL,                     -- GST, QST, HST
  name         VARCHAR(60)   NOT NULL,
  province     CHAR(2)       NOT NULL DEFAULT 'QC',
  rate         DECIMAL(7,5)  NOT NULL,                     -- 0.05000, 0.09975
  sort_order   SMALLINT      NOT NULL DEFAULT 0,
  is_active    TINYINT(1)    NOT NULL DEFAULT 1,
  effective_from DATE        NOT NULL DEFAULT (CURRENT_DATE),
  UNIQUE KEY uq_tax (code, province, effective_from)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS delivery_zones (
  zone_id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(80)   NOT NULL,
  postal_prefixes  VARCHAR(1000) NOT NULL,                 -- comma list of FSAs: H1A,H2X,...
  delivery_fee     DECIMAL(10,2) NOT NULL,
  free_over        DECIMAL(10,2) NULL,
  min_order        DECIMAL(10,2) NOT NULL DEFAULT 0,
  lead_time_days   TINYINT       NOT NULL DEFAULT 1,
  is_active        TINYINT(1)    NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS delivery_slots (
  slot_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fulfilment     ENUM('DELIVERY','PICKUP') NOT NULL,
  day_of_week    TINYINT      NOT NULL,                    -- 1=Mon .. 7=Sun
  start_time     TIME         NOT NULL,
  end_time       TIME         NOT NULL,
  max_orders     SMALLINT     NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS coupons (
  coupon_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(30)   NOT NULL UNIQUE,
  description     VARCHAR(200)  NULL,
  discount_type   ENUM('PERCENT','AMOUNT','FREE_DELIVERY') NOT NULL,
  discount_value  DECIMAL(10,2) NOT NULL DEFAULT 0,
  min_subtotal    DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_uses        INT UNSIGNED  NULL,
  max_uses_per_customer SMALLINT UNSIGNED NULL DEFAULT 1,
  used_count      INT UNSIGNED  NOT NULL DEFAULT 0,
  starts_at       DATETIME      NULL,
  ends_at         DATETIME      NULL,
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  order_id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no          VARCHAR(20)   NOT NULL UNIQUE,         -- TF-261110-0001
  access_token      CHAR(32)      NULL,                    -- lets the customer view their own order page
  customer_id       BIGINT UNSIGNED NULL,
  -- customer snapshot (kept even if customer record changes)
  cust_name         VARCHAR(160)  NOT NULL,
  cust_email        VARCHAR(190)  NOT NULL,
  cust_phone        VARCHAR(30)   NOT NULL,
  fulfilment_type   ENUM('DELIVERY','PICKUP') NOT NULL,
  scheduled_date    DATE          NOT NULL,
  time_slot         VARCHAR(30)   NULL,
  -- delivery address snapshot
  ship_line1        VARCHAR(150)  NULL,
  ship_line2        VARCHAR(150)  NULL,
  ship_city         VARCHAR(80)   NULL,
  ship_province     CHAR(2)       NULL,
  ship_postal_code  VARCHAR(7)    NULL,
  delivery_zone_id  INT UNSIGNED  NULL,
  -- money (CAD)
  subtotal          DECIMAL(10,2) NOT NULL,
  discount_total    DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_fee      DECIMAL(10,2) NOT NULL DEFAULT 0,
  gst_amount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  qst_amount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  tip_amount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  grand_total       DECIMAL(10,2) NOT NULL,
  coupon_id         INT UNSIGNED  NULL,
  -- status
  status            ENUM('PENDING','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','COMPLETED','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  payment_status    ENUM('UNPAID','AUTHORIZED','PAID','PARTIALLY_REFUNDED','REFUNDED','FAILED') NOT NULL DEFAULT 'UNPAID',
  payment_method    ENUM('CARD','PAY_ON_DELIVERY','INTERAC_ETRANSFER','INVOICE') NOT NULL DEFAULT 'CARD',
  channel           ENUM('WEB','PHONE','WHOLESALE','ADMIN') NOT NULL DEFAULT 'WEB',
  lang              CHAR(2)       NOT NULL DEFAULT 'en',     -- language the customer ordered in (en / fr)
  customer_notes    VARCHAR(500)  NULL,
  internal_notes    VARCHAR(1000) NULL,
  ip_address        VARCHAR(45)   NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ord_cust   FOREIGN KEY (customer_id)      REFERENCES customers(customer_id),
  CONSTRAINT fk_ord_zone   FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(zone_id),
  CONSTRAINT fk_ord_coupon FOREIGN KEY (coupon_id)        REFERENCES coupons(coupon_id),
  INDEX ix_ord_status (status, scheduled_date),
  INDEX ix_ord_cust (customer_id, created_at),
  INDEX ix_ord_email (cust_email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  order_item_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id        BIGINT UNSIGNED NOT NULL,
  product_id      INT UNSIGNED  NOT NULL,
  variant_id      INT UNSIGNED  NULL,
  sku             VARCHAR(30)   NOT NULL,                  -- snapshot
  product_name    VARCHAR(150)  NOT NULL,                  -- snapshot
  pack_size_label VARCHAR(60)   NULL,
  unit_price      DECIMAL(10,2) NOT NULL,
  qty             SMALLINT UNSIGNED NOT NULL,
  is_taxable      TINYINT(1)    NOT NULL DEFAULT 1,
  line_total      DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id)   REFERENCES orders(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_prod  FOREIGN KEY (product_id) REFERENCES products(product_id),
  CONSTRAINT fk_oi_var   FOREIGN KEY (variant_id) REFERENCES product_variants(variant_id),
  INDEX ix_oi_prod (product_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_status_history (
  history_id    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id      BIGINT UNSIGNED NOT NULL,
  from_status   VARCHAR(30)  NULL,
  to_status     VARCHAR(30)  NOT NULL,
  note          VARCHAR(255) NULL,
  notified_customer TINYINT(1) NOT NULL DEFAULT 0,
  changed_by    INT UNSIGNED NULL,                         -- admin_users.admin_id (NULL = system)
  changed_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_osh_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  payment_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       BIGINT UNSIGNED NOT NULL,
  provider       VARCHAR(30)   NOT NULL,                   -- STRIPE, SQUARE, MONERIS, CASH, INTERAC
  provider_ref   VARCHAR(120)  NULL,                       -- payment intent / txn id (never card numbers)
  txn_type       ENUM('AUTH','CAPTURE','SALE','REFUND','VOID') NOT NULL DEFAULT 'SALE',
  amount         DECIMAL(10,2) NOT NULL,
  currency       CHAR(3)       NOT NULL DEFAULT 'CAD',
  status         ENUM('PENDING','SUCCEEDED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  card_brand     VARCHAR(20)   NULL,
  card_last4     CHAR(4)       NULL,
  raw_response   JSON          NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  INDEX ix_pay_ref (provider, provider_ref)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  redemption_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coupon_id      INT UNSIGNED    NOT NULL,
  order_id       BIGINT UNSIGNED NOT NULL,
  customer_email VARCHAR(190)    NOT NULL,
  discount       DECIMAL(10,2)   NOT NULL,
  redeemed_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cr_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(coupon_id),
  CONSTRAINT fk_cr_order  FOREIGN KEY (order_id)  REFERENCES orders(order_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- WEBSITE (Get in Touch form, newsletter, "Notify me")
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enquiries (
  enquiry_id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name        VARCHAR(160) NOT NULL,
  email            VARCHAR(190) NOT NULL,
  phone            VARCHAR(30)  NULL,
  enquiry_type     ENUM('Product Enquiry','Wholesale / Bulk Enquiry','Distribution Partnership','General Enquiry') NOT NULL,
  product_interest VARCHAR(100) NULL,                      -- Chips / Samosas / Butter chicken sauce
  message          TEXT         NOT NULL,
  status           ENUM('NEW','IN_PROGRESS','REPLIED','CLOSED','SPAM') NOT NULL DEFAULT 'NEW',
  assigned_to      INT UNSIGNED NULL,
  updated_by       INT UNSIGNED NULL,                      -- admin_users.admin_id who last changed status
  ip_address       VARCHAR(45)  NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ix_enq_status (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  subscriber_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(190) NOT NULL UNIQUE,
  first_name     VARCHAR(80)  NULL,
  preferred_lang ENUM('en','fr') NOT NULL DEFAULT 'en',
  consent_source VARCHAR(60)  NULL,                        -- checkout / footer form
  subscribed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at DATETIME    NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_notify_requests (
  request_id    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id    INT UNSIGNED NOT NULL,
  email         VARCHAR(190) NOT NULL,
  notified_at   DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notify (product_id, email),
  CONSTRAINT fk_nr_prod FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ADMIN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  admin_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(190) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,                    -- bcrypt
  role           ENUM('OWNER','MANAGER','FULFILMENT','CATALOGUE','VIEWER') NOT NULL DEFAULT 'VIEWER',
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  setting_key    VARCHAR(60)  PRIMARY KEY,
  setting_value  VARCHAR(1000) NOT NULL,
  description    VARCHAR(255) NULL,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id     INT UNSIGNED NULL,
  entity       VARCHAR(40)  NOT NULL,                      -- product, order, setting ...
  entity_id    VARCHAR(40)  NOT NULL,
  action       VARCHAR(40)  NOT NULL,                      -- CREATE / UPDATE / DELETE / PRICE_CHANGE
  old_values   JSON         NULL,
  new_values   JSON         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_audit_entity (entity, entity_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PRODUCT IMPORT (client Excel template -> staging -> products)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_import_batches (
  batch_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_name     VARCHAR(255) NOT NULL,
  rows_total    INT          NOT NULL DEFAULT 0,
  rows_ok       INT          NOT NULL DEFAULT 0,
  rows_error    INT          NOT NULL DEFAULT 0,
  status        ENUM('UPLOADED','VALIDATED','APPLIED','REJECTED') NOT NULL DEFAULT 'UPLOADED',
  uploaded_by   INT UNSIGNED NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at    DATETIME     NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_import_rows (
  row_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id      INT UNSIGNED NOT NULL,
  excel_row     INT          NOT NULL,
  sku           VARCHAR(30)  NULL,
  payload       JSON         NOT NULL,                     -- the full row as read from Excel
  errors        VARCHAR(1000) NULL,
  action        ENUM('INSERT','UPDATE','SKIP') NULL,
  CONSTRAINT fk_pir_batch FOREIGN KEY (batch_id) REFERENCES product_import_batches(batch_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Admin login sessions (token is stored hashed)
CREATE TABLE IF NOT EXISTS admin_sessions (
  session_hash   CHAR(64)     PRIMARY KEY,                 -- SHA-256 of the session token
  admin_id       INT UNSIGNED NOT NULL,
  ip_address     VARCHAR(45)  NULL,
  user_agent     VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME     NOT NULL,
  CONSTRAINT fk_sess_admin FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  INDEX ix_sess_exp (expires_at)
) ENGINE=InnoDB;

-- Price history: one row per price period. Current price = is_applied 1 and effective_to NULL.
-- A future-dated price is stored with is_applied 0 and switched on automatically at effective_from.
CREATE TABLE IF NOT EXISTS product_price_history (
  price_id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id        INT UNSIGNED  NOT NULL,
  price             DECIMAL(10,2) NOT NULL,
  compare_at_price  DECIMAL(10,2) NULL,
  effective_from    DATETIME      NOT NULL,
  effective_to      DATETIME      NULL,                    -- cut-off: when the next price took over
  is_applied        TINYINT(1)    NOT NULL DEFAULT 1,      -- 0 = scheduled for the future
  source            ENUM('INITIAL','ADMIN','IMPORT') NOT NULL DEFAULT 'ADMIN',
  note              VARCHAR(255)  NULL,
  changed_by        INT UNSIGNED  NULL,                    -- admin_users.admin_id
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pph_prod FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
  INDEX ix_pph_prod (product_id, effective_from),
  INDEX ix_pph_pending (is_applied, effective_from)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- VIEW used by the storefront API:  GET /api/products
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_storefront_products AS
SELECT p.product_id, p.sku, c.code AS category_code, c.name_en AS category_name,
       p.name_en, p.name_fr, p.regional_name, p.short_desc_en, p.short_desc_fr, c.name_fr AS category_name_fr,
       p.dietary_tags, p.prep_type, p.storage_type, p.pack_size_label,
       p.price, p.compare_at_price, p.is_taxable, p.max_order_qty,
       p.status, p.is_featured, p.sort_order,
       (SELECT pi.file_name FROM product_images pi
         WHERE pi.product_id = p.product_id ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1) AS image_file,
       CASE WHEN i.track_inventory = 1 AND i.allow_backorder = 0
                 AND (i.qty_on_hand - i.qty_reserved) <= 0 THEN 1 ELSE 0 END AS is_sold_out
FROM products p
JOIN categories c      ON c.category_id = p.category_id AND c.is_active = 1
LEFT JOIN inventory i  ON i.product_id = p.product_id
WHERE p.status IN ('ACTIVE','COMING_SOON','OUT_OF_STOCK') AND p.price > 0;
