// Idempotent DB migrations. Usage (same env vars as the API):  node migrations/run.js
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

const MIGRATIONS = [
  {
    id: "001_branch_tax_fields",
    table: "branch_master",
    columns: [
      ["branch_city", "VARCHAR(100) NULL AFTER branch_address"],
      ["province_code", "VARCHAR(2) NULL AFTER branch_city"],
      ["postal_code", "VARCHAR(10) NULL AFTER province_code"],
      ["ownership_type", "VARCHAR(1) NULL DEFAULT 'O' AFTER branch_type"],
      ["legal_name", "VARCHAR(200) NULL AFTER ownership_type"],
      ["gst_hst_reg_no", "VARCHAR(20) NULL AFTER legal_name"],
      ["qst_reg_no", "VARCHAR(20) NULL AFTER gst_hst_reg_no"],
      ["gst_hst_rate", "DECIMAL(6,3) NULL AFTER qst_reg_no"],
      ["qst_rate", "DECIMAL(6,3) NULL AFTER gst_hst_rate"],
    ],
  },
  {
    id: "002_invoicing",
    table: "branch_master",
    columns: [
      ["invoice_notes", "VARCHAR(500) NULL AFTER qst_rate"], // printed under "Notes" on invoices this branch issues
    ],
    sql: [
      `CREATE TABLE IF NOT EXISTS invoice_header (
        org_id VARCHAR(5) NOT NULL,
        invoice_number VARCHAR(20) NOT NULL,
        indent_number VARCHAR(15) NOT NULL,
        branch_id VARCHAR(12) NOT NULL,
        kitchen_id VARCHAR(15) NOT NULL,
        invoice_date DATE NOT NULL,
        due_date DATE NULL,
        terms VARCHAR(50) NULL,
        sub_total DECIMAL(12,2) NOT NULL DEFAULT 0,
        gst_label VARCHAR(10) NULL,
        gst_rate DECIMAL(6,3) NULL,
        gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        qst_rate DECIMAL(6,3) NULL,
        qst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
        seller_info TEXT NULL,
        bill_to_info TEXT NULL,
        notes VARCHAR(500) NULL,
        status VARCHAR(1) NOT NULL DEFAULT 'O',
        created_by VARCHAR(50) NULL,
        created_date DATETIME NULL,
        PRIMARY KEY (org_id, invoice_number),
        UNIQUE KEY uq_invoice_indent (org_id, indent_number, kitchen_id),
        KEY ix_invoice_branch_date (org_id, branch_id, invoice_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS invoice_detail (
        org_id VARCHAR(5) NOT NULL,
        invoice_number VARCHAR(20) NOT NULL,
        line_no INT NOT NULL,
        item_code VARCHAR(15) NOT NULL,
        item_name VARCHAR(500) NULL,
        uom VARCHAR(100) NULL,
        qty DECIMAL(12,3) NOT NULL DEFAULT 0,
        rate DECIMAL(12,4) NOT NULL DEFAULT 0,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        PRIMARY KEY (org_id, invoice_number, line_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ],
  },
  {
    id: "003_security_users",
    table: "user_master",
    columns: [
      ["pwd_reset_required", "VARCHAR(1) NULL DEFAULT 'N' AFTER pwd"], // Y after an admin reset: must change at next login
    ],
    sql: [
      // room for bcrypt hashes (60 chars); existing plain passwords are hashed on each user's next login
      `ALTER TABLE user_master MODIFY pwd VARCHAR(100) NULL`,
    ],
  },
  {
    id: "006_indent_delivery_date",
    table: "indent_header",
    columns: [
      ["delivery_date", "DATE NULL AFTER delivery_by_datetime"], // delivery date entered by the kitchen when accepting
    ],
  },
  {
    id: "003_credit_terms_branch",
    table: "branch_master",
    columns: [
      ["credit_term", "VARCHAR(3) NULL AFTER invoice_notes"], // POI = on invoice, EOM = end of month, N30 = net 30
    ],
  },
  {
    id: "003_invoice_payments",
    table: "invoice_header",
    columns: [
      ["credit_term", "VARCHAR(3) NULL AFTER terms"],
      ["amount_paid", "DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER total_amount"],
      ["paid_date", "DATE NULL AFTER balance_due"],
    ],
    sql: [
      `CREATE TABLE IF NOT EXISTS invoice_payment (
        payment_id INT NOT NULL AUTO_INCREMENT,
        org_id VARCHAR(5) NOT NULL,
        receipt_no VARCHAR(20) NOT NULL,
        invoice_number VARCHAR(20) NOT NULL,
        branch_id VARCHAR(12) NOT NULL,
        payment_date DATE NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        mode VARCHAR(20) NOT NULL,
        reference VARCHAR(100) NULL,
        note VARCHAR(500) NULL,
        voided VARCHAR(1) NOT NULL DEFAULT 'N',
        void_reason VARCHAR(500) NULL,
        voided_by VARCHAR(50) NULL,
        voided_date DATETIME NULL,
        created_by VARCHAR(50) NULL,
        created_date DATETIME NULL,
        PRIMARY KEY (payment_id),
        KEY ix_payment_invoice (org_id, invoice_number),
        KEY ix_payment_receipt (org_id, receipt_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      // invoices generated before payment tracking: default term = end of month (as on the Zoho invoices)
      `UPDATE invoice_header SET credit_term = 'EOM' WHERE credit_term IS NULL`,
    ],
  },
  {
    id: "007_invoice_setup",
    table: "indent_header",
    columns: [
      // admin's invoice decisions, made after the kitchen accepts and before dispatch
      ["inv_credit_term", "VARCHAR(10) NULL AFTER delivery_date"],
      ["inv_finalized_by", "VARCHAR(100) NULL AFTER inv_credit_term"],
      ["inv_finalized_date", "DATETIME NULL AFTER inv_finalized_by"],
    ],
    sql: [
      // terms like EONM / N120 need more than 3 characters
      `ALTER TABLE branch_master MODIFY credit_term VARCHAR(10) NULL`,
      `ALTER TABLE invoice_header MODIFY credit_term VARCHAR(10) NULL`,
      `CREATE TABLE IF NOT EXISTS indent_charge (
        org_id VARCHAR(5) NOT NULL,
        indent_number VARCHAR(15) NOT NULL,
        kitchen_id VARCHAR(15) NOT NULL,
        line_no INT NOT NULL,
        description VARCHAR(200) NOT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        taxable VARCHAR(1) NOT NULL DEFAULT 'N',
        PRIMARY KEY (org_id, indent_number, kitchen_id, line_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ],
  },
  {
    id: "007_invoice_setup_items",
    table: "indent_detail",
    columns: [
      ["tax_flag", "VARCHAR(1) NULL"], // Y = taxable (default), N = non-taxable
    ],
  },
  {
    id: "007_invoice_line_tax",
    table: "invoice_detail",
    columns: [
      ["taxable", "VARCHAR(1) NOT NULL DEFAULT 'Y' AFTER amount"],
    ],
  },
  {
    id: "008_short_codes_branch",
    table: "branch_master",
    columns: [
      ["short_code", "VARCHAR(2) NULL AFTER branch_name"], // 2-letter code, first part of batch numbers
    ],
  },
  {
    id: "008_product_batch_fields",
    table: "product_master",
    columns: [
      ["short_code", "VARCHAR(3) NULL AFTER product_name"],          // 2-3 letters; products with a code are batch-tracked
      ["producing_branch_id", "VARCHAR(10) NULL AFTER short_code"],  // kitchen that makes it (batch prefix)
      ["shelf_life_days", "INT NULL AFTER producing_branch_id"],     // best-before = manufacturing date + days
      ["default_taxable", "VARCHAR(1) NOT NULL DEFAULT 'Y' AFTER shelf_life_days"], // default on the invoice step
    ],
  },
  {
    id: "008_user_role",
    table: "user_master",
    columns: [
      ["role_id", "VARCHAR(20) NULL AFTER user_type"],
    ],
    sql: [
      `CREATE TABLE IF NOT EXISTS role_master (
        org_id VARCHAR(5) NOT NULL,
        role_id VARCHAR(20) NOT NULL,
        role_name VARCHAR(100) NOT NULL,
        description VARCHAR(500) NULL,
        scope VARCHAR(1) NOT NULL,            -- user type this role is for: A, O, K, B, X
        is_system VARCHAR(1) NOT NULL DEFAULT 'N',
        status VARCHAR(1) NOT NULL DEFAULT 'A',
        created_by VARCHAR(100) NULL, created_date DATETIME NULL,
        updated_by VARCHAR(100) NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id, role_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS role_screen (
        org_id VARCHAR(5) NOT NULL,
        role_id VARCHAR(20) NOT NULL,
        screen_code VARCHAR(30) NOT NULL,
        can_edit VARCHAR(1) NOT NULL DEFAULT 'N',
        PRIMARY KEY (org_id, role_id, screen_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ],
  },
  {
    id: "008_batches",
    table: "invoice_detail",
    columns: [
      ["batch_nos", "VARCHAR(500) NULL AFTER taxable"], // e.g. "TSVD1009260001 (50), TSVD1009260002 (200)"
    ],
    sql: [
      `CREATE TABLE IF NOT EXISTS batch_master (
        org_id VARCHAR(5) NOT NULL,
        batch_no VARCHAR(30) NOT NULL,
        product_id VARCHAR(15) NOT NULL,
        branch_id VARCHAR(10) NOT NULL,       -- producing branch
        mfg_date DATE NOT NULL,
        best_before DATE NULL,
        qty_produced DECIMAL(12,3) NOT NULL,
        qty_remaining DECIMAL(12,3) NOT NULL,
        uom VARCHAR(100) NULL,
        unit_cost DECIMAL(12,2) NULL,
        note VARCHAR(500) NULL,
        status VARCHAR(1) NOT NULL DEFAULT 'O', -- O open, C closed
        source VARCHAR(1) NOT NULL DEFAULT 'E', -- E entered, I opening-stock import
        close_reason VARCHAR(30) NULL,
        close_note VARCHAR(500) NULL,
        closed_by VARCHAR(100) NULL, closed_date DATETIME NULL,
        created_by VARCHAR(100) NULL, created_date DATETIME NULL,
        updated_by VARCHAR(100) NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id, batch_no),
        KEY ix_batch_product (org_id, product_id, status, mfg_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS stock_movement (
        movement_id BIGINT NOT NULL AUTO_INCREMENT,
        org_id VARCHAR(5) NOT NULL,
        branch_id VARCHAR(10) NOT NULL,
        product_id VARCHAR(15) NOT NULL,
        batch_no VARCHAR(30) NULL,
        move_date DATE NOT NULL,
        move_type VARCHAR(10) NOT NULL,       -- PRODUCE, OPENING, DISPATCH, WRITEOFF, ADJUST, REVERSAL
        qty DECIMAL(12,3) NOT NULL,           -- + in, - out
        ref_no VARCHAR(30) NULL,              -- indent number for dispatches
        note VARCHAR(500) NULL,
        created_by VARCHAR(100) NULL, created_date DATETIME NULL,
        PRIMARY KEY (movement_id),
        KEY ix_move (org_id, product_id, move_date),
        KEY ix_move_batch (org_id, batch_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS indent_batch_alloc (
        org_id VARCHAR(5) NOT NULL,
        indent_number VARCHAR(15) NOT NULL,
        kitchen_id VARCHAR(15) NOT NULL,
        item_code VARCHAR(15) NOT NULL,
        batch_no VARCHAR(30) NOT NULL,
        qty DECIMAL(12,3) NOT NULL,
        created_by VARCHAR(100) NULL, created_date DATETIME NULL,
        PRIMARY KEY (org_id, indent_number, kitchen_id, item_code, batch_no),
        KEY ix_alloc_batch (org_id, batch_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ],
  },
  {
    // Online subscriber module (weekly meal plans sold to the public)
    id: "009_subscriptions",
    table: "product_master",
    columns: [
      ["sub_description", "VARCHAR(500) NULL AFTER default_taxable"], // shown on the online menu
      ["sub_diet", "VARCHAR(1) NULL AFTER sub_description"],          // V veg, N non-veg, E egg
      ["sub_allergens", "VARCHAR(200) NULL AFTER sub_diet"],           // comma list: Milk, Nuts, Gluten...
      ["sub_image_url", "VARCHAR(500) NULL AFTER sub_allergens"],
      ["sub_enabled", "VARCHAR(1) NOT NULL DEFAULT 'N' AFTER sub_image_url"], // Y = can be put on the online weekly menu
    ],
    sql: [
      `CREATE TABLE IF NOT EXISTS sub_settings (
        org_id VARCHAR(5) NOT NULL,
        hub_branch_id VARCHAR(10) NULL,          -- branch that raises the weekly kitchen indent
        delivery_weekday TINYINT NOT NULL DEFAULT 0, -- 0 Sunday ... 6 Saturday
        cutoff_days_before TINYINT NOT NULL DEFAULT 3,
        cutoff_time VARCHAR(5) NOT NULL DEFAULT '23:59',
        gst_rate DECIMAL(6,3) NOT NULL DEFAULT 5.000,
        qst_rate DECIMAL(6,3) NOT NULL DEFAULT 9.975,
        taxable VARCHAR(1) NOT NULL DEFAULT 'Y',
        min_meals INT NOT NULL DEFAULT 5,
        shop_name VARCHAR(100) NULL,
        support_email VARCHAR(100) NULL,
        support_phone VARCHAR(30) NULL,
        updated_by VARCHAR(100) NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sub_plan (
        org_id VARCHAR(5) NOT NULL,
        plan_id VARCHAR(20) NOT NULL,
        plan_name VARCHAR(100) NOT NULL,
        meals_per_week INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        description VARCHAR(500) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(1) NOT NULL DEFAULT 'A',
        created_by VARCHAR(100) NULL, created_date DATETIME NULL,
        updated_by VARCHAR(100) NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id, plan_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sub_zone (
        org_id VARCHAR(5) NOT NULL,
        zone_id VARCHAR(20) NOT NULL,
        zone_name VARCHAR(100) NOT NULL,
        postal_prefixes VARCHAR(1000) NOT NULL,   -- first 3 characters of postal codes, comma separated (H1A,H2B,...)
        delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
        status VARCHAR(1) NOT NULL DEFAULT 'A',
        sort_order INT NOT NULL DEFAULT 0,
        created_by VARCHAR(100) NULL, created_date DATETIME NULL,
        updated_by VARCHAR(100) NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id, zone_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sub_menu_week (
        org_id VARCHAR(5) NOT NULL,
        delivery_date DATE NOT NULL,
        status VARCHAR(1) NOT NULL DEFAULT 'D',  -- D draft, P published, C cut off (orders locked), K sent to kitchen
        cutoff_at DATETIME NOT NULL,             -- local time (INVOICE_TZ)
        note VARCHAR(500) NULL,
        indent_numbers VARCHAR(200) NULL,
        created_by VARCHAR(100) NULL, created_date DATETIME NULL,
        updated_by VARCHAR(100) NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id, delivery_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sub_menu_item (
        org_id VARCHAR(5) NOT NULL,
        delivery_date DATE NOT NULL,
        product_id VARCHAR(15) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        chef_pick VARCHAR(1) NOT NULL DEFAULT 'N', -- used to fill meals the customer did not choose
        max_qty INT NULL,                          -- optional cap for the week
        PRIMARY KEY (org_id, delivery_date, product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sub_customer (
        org_id VARCHAR(5) NOT NULL,
        customer_id VARCHAR(20) NOT NULL,
        email VARCHAR(150) NOT NULL,
        pwd VARCHAR(100) NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        phone VARCHAR(30) NULL,
        address_line1 VARCHAR(200) NULL,
        address_line2 VARCHAR(200) NULL,
        city VARCHAR(100) NULL,
        postal_code VARCHAR(10) NULL,
        zone_id VARCHAR(20) NULL,
        delivery_notes VARCHAR(500) NULL,
        diet_pref VARCHAR(1) NULL,               -- V / N / null (no preference)
        allergies VARCHAR(300) NULL,
        stripe_customer_id VARCHAR(100) NULL,
        card_brand VARCHAR(20) NULL, card_last4 VARCHAR(4) NULL,
        stripe_payment_method VARCHAR(100) NULL,
        status VARCHAR(1) NOT NULL DEFAULT 'A',
        created_date DATETIME NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id, customer_id),
        UNIQUE KEY ux_sub_customer_email (org_id, email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sub_subscription (
        org_id VARCHAR(5) NOT NULL,
        subscription_id VARCHAR(20) NOT NULL,
        customer_id VARCHAR(20) NOT NULL,
        plan_id VARCHAR(20) NOT NULL,
        status VARCHAR(1) NOT NULL DEFAULT 'A',  -- A active, P paused, C cancelled
        start_date DATE NOT NULL,                -- first delivery
        paused_until DATE NULL,
        cancelled_date DATETIME NULL, cancel_reason VARCHAR(300) NULL,
        created_date DATETIME NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id, subscription_id),
        KEY ix_sub_customer (org_id, customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sub_order (
        org_id VARCHAR(5) NOT NULL,
        order_id VARCHAR(20) NOT NULL,
        customer_id VARCHAR(20) NOT NULL,
        subscription_id VARCHAR(20) NULL,
        delivery_date DATE NOT NULL,
        plan_id VARCHAR(20) NOT NULL,
        meals INT NOT NULL,
        status VARCHAR(1) NOT NULL DEFAULT 'O',  -- O open (choosing), P awaiting payment, C confirmed/paid, F payment failed, K in kitchen, D delivered, S skipped, X cancelled
        picked_by VARCHAR(1) NOT NULL DEFAULT 'C', -- C customer, A auto (chef's choice)
        subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
        delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
        gst_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        qst_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        total DECIMAL(10,2) NOT NULL DEFAULT 0,
        ship_name VARCHAR(150) NULL, ship_phone VARCHAR(30) NULL,
        ship_address VARCHAR(500) NULL, ship_postal VARCHAR(10) NULL, zone_id VARCHAR(20) NULL,
        delivery_notes VARCHAR(500) NULL,
        delivered_date DATETIME NULL, delivered_by VARCHAR(100) NULL,
        created_date DATETIME NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id, order_id),
        UNIQUE KEY ux_sub_order_week (org_id, customer_id, delivery_date),
        KEY ix_sub_order_date (org_id, delivery_date, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sub_order_item (
        org_id VARCHAR(5) NOT NULL,
        order_id VARCHAR(20) NOT NULL,
        product_id VARCHAR(15) NOT NULL,
        qty INT NOT NULL,
        PRIMARY KEY (org_id, order_id, product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sub_payment (
        payment_id BIGINT NOT NULL AUTO_INCREMENT,
        org_id VARCHAR(5) NOT NULL,
        order_id VARCHAR(20) NOT NULL,
        customer_id VARCHAR(20) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        provider VARCHAR(10) NOT NULL,           -- stripe | mock | manual
        provider_ref VARCHAR(200) NULL,          -- checkout session / payment intent id
        status VARCHAR(1) NOT NULL,              -- P pending, S succeeded, F failed, R refunded
        card_brand VARCHAR(20) NULL, card_last4 VARCHAR(4) NULL,
        receipt_url VARCHAR(500) NULL,
        failure_message VARCHAR(500) NULL,
        created_date DATETIME NULL, updated_date DATETIME NULL,
        PRIMARY KEY (payment_id),
        KEY ix_sub_payment_order (org_id, order_id),
        KEY ix_sub_payment_ref (provider_ref)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ],
  },
  {
    id: "010_indent_change_requests",
    table: "indent_header",
    columns: [
      ["kitchen_note", "VARCHAR(500) NULL AFTER priority_flag"],   // kitchen's message when it sends an indent back (status Q)
      ["change_requested_by", "VARCHAR(100) NULL AFTER kitchen_note"],
      ["change_requested_date", "DATETIME NULL AFTER change_requested_by"],
      ["received_date", "DATETIME NULL AFTER change_requested_date"],
    ],
  },
  {
    // Table reservations for the dining room (public booking page /reserve + staff screens)
    id: "011_reservations",
    table: "res_settings",
    columns: [],
    sql: [
      `CREATE TABLE IF NOT EXISTS res_settings (
        org_id VARCHAR(5) NOT NULL,
        max_reserved_seats INT NOT NULL DEFAULT 40,    -- chairs that can be reserved per seating (rest = walk-in)
        days_ahead INT NOT NULL DEFAULT 30,            -- how far ahead customers can book
        min_notice_minutes INT NOT NULL DEFAULT 60,    -- online booking closes this long before the seating
        cancel_notice_minutes INT NOT NULL DEFAULT 60, -- customers can cancel online until this long before
        max_party_online INT NOT NULL DEFAULT 12,      -- bigger groups are asked to call
        seating_minutes INT NOT NULL DEFAULT 90,       -- shown to customers ("table is yours for about 90 minutes")
        booking_open VARCHAR(1) NOT NULL DEFAULT 'Y',  -- N = online booking paused
        restaurant_name VARCHAR(100) NULL,
        phone VARCHAR(30) NULL,
        address VARCHAR(300) NULL,
        notify_email VARCHAR(300) NULL,                -- restaurant copy of every booking (comma separated)
        guest_notes TEXT NULL,                         -- one line per point, shown on the booking page
        updated_by VARCHAR(100) NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS res_seating (
        org_id VARCHAR(5) NOT NULL,
        seating_id VARCHAR(20) NOT NULL,
        label VARCHAR(50) NOT NULL,                    -- Lunch / Dinner
        start_time VARCHAR(5) NOT NULL,                -- HH:MM local time
        weekdays VARCHAR(7) NOT NULL DEFAULT '0123456', -- days it runs: 0 Sunday ... 6 Saturday
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(1) NOT NULL DEFAULT 'A',
        updated_by VARCHAR(100) NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id, seating_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS res_table (
        org_id VARCHAR(5) NOT NULL,
        table_id VARCHAR(10) NOT NULL,                 -- A1, B10 ...
        table_row VARCHAR(10) NULL,                    -- A / B / C
        seats TINYINT NOT NULL,
        pos_x DECIMAL(5,2) NOT NULL DEFAULT 50,        -- centre on the floor plan, % of width
        pos_y DECIMAL(5,2) NOT NULL DEFAULT 50,        -- centre, % of height
        width DECIMAL(5,2) NOT NULL DEFAULT 7,
        height DECIMAL(5,2) NOT NULL DEFAULT 6,
        orient VARCHAR(1) NOT NULL DEFAULT 'H',        -- H chairs above/below, V chairs left/right
        online VARCHAR(1) NOT NULL DEFAULT 'Y',        -- N = staff only
        status VARCHAR(1) NOT NULL DEFAULT 'A',
        sort_order INT NOT NULL DEFAULT 0,
        updated_by VARCHAR(100) NULL, updated_date DATETIME NULL,
        PRIMARY KEY (org_id, table_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS res_closure (
        org_id VARCHAR(5) NOT NULL,
        closed_date DATE NOT NULL,
        seating_id VARCHAR(20) NOT NULL DEFAULT '',    -- '' = whole day
        reason VARCHAR(200) NULL,
        created_by VARCHAR(100) NULL, created_date DATETIME NULL,
        PRIMARY KEY (org_id, closed_date, seating_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS res_booking (
        org_id VARCHAR(5) NOT NULL,
        booking_id VARCHAR(15) NOT NULL,
        booking_date DATE NOT NULL,
        seating_id VARCHAR(20) NOT NULL,
        start_time VARCHAR(5) NOT NULL,
        guests INT NOT NULL,
        seats INT NOT NULL,                            -- chairs of the booked tables (counts toward the limit)
        table_ids VARCHAR(200) NOT NULL,               -- kept for history after a cancellation
        kind VARCHAR(1) NOT NULL DEFAULT 'C',          -- C customer, B staff block
        source VARCHAR(1) NOT NULL DEFAULT 'W',        -- W website, S staff
        customer_name VARCHAR(150) NULL,
        phone VARCHAR(30) NULL,
        email VARCHAR(150) NULL,
        notes VARCHAR(500) NULL,                       -- customer's request
        staff_note VARCHAR(500) NULL,
        status VARCHAR(1) NOT NULL DEFAULT 'C',        -- C confirmed, A arrived, N no-show, X cancelled
        manage_token VARCHAR(48) NULL,
        created_by VARCHAR(100) NULL, created_date DATETIME NULL,
        updated_by VARCHAR(100) NULL, updated_date DATETIME NULL,
        cancelled_by VARCHAR(100) NULL, cancelled_date DATETIME NULL,
        cancel_reason VARCHAR(200) NULL,
        PRIMARY KEY (org_id, booking_id),
        UNIQUE KEY uq_res_booking_token (manage_token),
        KEY ix_res_booking_slot (org_id, booking_date, seating_id),
        KEY ix_res_booking_email (org_id, email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      // one row per table per seating while a booking holds it: the primary key makes double booking impossible
      `CREATE TABLE IF NOT EXISTS res_booking_table (
        org_id VARCHAR(5) NOT NULL,
        booking_date DATE NOT NULL,
        seating_id VARCHAR(20) NOT NULL,
        table_id VARCHAR(10) NOT NULL,
        booking_id VARCHAR(15) NOT NULL,
        PRIMARY KEY (org_id, booking_date, seating_id, table_id),
        KEY ix_res_bt_booking (org_id, booking_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ],
  },
];

(async () => {
  const database = process.env.WRITE_DB_DATABASE;
  if (!database) throw new Error("WRITE_DB_DATABASE is not set");
  const conn = await mysql.createConnection({
    host: process.env.WRITE_DB_SRV_HOST,
    port: process.env.WRITE_DB_PORT || 3306,
    user: process.env.WRITE_DB_USER,
    password: process.env.WRITE_DB_PASSWORD,
    database,
  });
  // remembered before the loop: products already used on an online menu get sub_enabled = Y when the column is first added
  const [[{ hadSubEnabled }]] = await conn.query(
    "SELECT COUNT(*) AS hadSubEnabled FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'product_master' AND COLUMN_NAME = 'sub_enabled'", [database]);
  for (const m of MIGRATIONS) {
    const [rows] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [database, m.table]
    );
    const existing = new Set(rows.map((r) => r.COLUMN_NAME.toLowerCase()));
    const missing = m.columns.filter(([c]) => !existing.has(c));
    // Add one at a time so AFTER references resolve in order
    for (const [col, def] of missing) {
      await conn.query(`ALTER TABLE \`${m.table}\` ADD COLUMN \`${col}\` ${def}`);
    }
    for (const stmt of m.sql || []) await conn.query(stmt); // CREATE TABLE IF NOT EXISTS - idempotent
    console.log(`${m.id}: ${missing.length ? "added " + missing.map((c) => c[0]).join(", ") : "columns already present"}${m.sql ? ", tables checked" : ""}`);
  }
  // 004: audit columns (created_by / updated_by / voided_by ...) hold user IDs = e-mail addresses.
  // Widen any that are shorter than 100 characters, in every table.
  const [narrow] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH AS len, IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND COLUMN_NAME LIKE '%\\_by' AND DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH < 100`,
    [database]
  );
  for (const c of narrow) {
    await conn.query(`ALTER TABLE \`${c.TABLE_NAME}\` MODIFY \`${c.COLUMN_NAME}\` VARCHAR(100) ${c.IS_NULLABLE === "YES" ? "NULL" : "NOT NULL"}`);
  }
  console.log(`004_audit_columns: ${narrow.length ? "widened " + narrow.map((c) => `${c.TABLE_NAME}.${c.COLUMN_NAME} (${c.len})`).join(", ") : "all OK"}`);

  // 005: prod_selling_price_master had UNIQUE(updated_by) - one price row per person, so saving a
  // second product's price failed. Drop it.
  const [idx] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'prod_selling_price_master' AND INDEX_NAME = 'updated_by_UNIQUE'`,
    [database]
  );
  if (idx.length) await conn.query("ALTER TABLE prod_selling_price_master DROP INDEX updated_by_UNIQUE");
  console.log(`005_selling_price_index: ${idx.length ? "dropped UNIQUE(updated_by)" : "OK"}`);

  // 008: system roles + screens, and a role for every existing user
  const { DEFAULT_ROLES } = require("../common/screens");
  const [orgs] = await conn.query("SELECT DISTINCT org_id FROM user_master UNION SELECT DISTINCT org_id FROM branch_master");
  let seeded = 0;
  for (const { org_id } of orgs) {
    for (const r of DEFAULT_ROLES) {
      const [ins] = await conn.query(
        `INSERT IGNORE INTO role_master (org_id, role_id, role_name, description, scope, is_system, status, created_by, created_date)
         VALUES (?, ?, ?, ?, ?, 'Y', 'A', 'migration', NOW())`, [org_id, r.role_id, r.role_name, r.description, r.scope]);
      if (ins.affectedRows) {
        seeded++;
        for (const [code, lvl] of Object.entries(r.screens)) {
          await conn.query(`INSERT IGNORE INTO role_screen (org_id, role_id, screen_code, can_edit) VALUES (?, ?, ?, ?)`,
            [org_id, r.role_id, code, lvl === "E" ? "Y" : "N"]);
        }
      }
    }
    await conn.query(
      `UPDATE user_master SET role_id = CASE user_type WHEN 'A' THEN 'ADMIN' WHEN 'O' THEN 'OPS' WHEN 'K' THEN 'KITCHEN'
         WHEN 'B' THEN 'BRANCH' WHEN 'X' THEN 'EXTERNAL' END WHERE org_id = ? AND role_id IS NULL`, [org_id]);
  }
  console.log(`008_roles: ${seeded ? "created " + seeded + " system role(s)" : "OK"}`);

  // 009: subscriber module defaults per org (settings row + the three plans sold on weeklymeals.ca)
  let subSeeded = 0;
  for (const { org_id } of orgs) {
    const [s] = await conn.query(`INSERT IGNORE INTO sub_settings (org_id, shop_name) VALUES (?, 'Thanjai Weekly Meals')`, [org_id]);
    subSeeded += s.affectedRows;
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM sub_plan WHERE org_id = ?`, [org_id]);
    if (!n) {
      for (const [id, name, meals, price, sort] of [["STARTER", "Starter Plan", 5, 64.99, 1], ["FAMILY", "Family Plan", 10, 119.99, 2], ["VALUE", "Value Plan", 15, 169.99, 3]]) {
        await conn.query(`INSERT INTO sub_plan (org_id, plan_id, plan_name, meals_per_week, price, sort_order, created_by, created_date)
                          VALUES (?, ?, ?, ?, ?, ?, 'migration', NOW())`, [org_id, id, name, meals, price, sort]);
      }
      subSeeded++;
    }
  }
  // the Operations Manager system role gets the new subscription screens once
  for (const { org_id } of orgs) {
    const [[{ m }]] = await conn.query(`SELECT COUNT(*) AS m FROM role_screen WHERE org_id = ? AND screen_code LIKE 'SUB\\_%'`, [org_id]);
    if (!m) {
      for (const [code, edit] of [["SUB_ORDERS", "Y"], ["SUB_SETUP", "Y"], ["SUB_CUSTOMERS", "N"]]) {
        const [r] = await conn.query(`INSERT IGNORE INTO role_screen (org_id, role_id, screen_code, can_edit)
                                      SELECT org_id, role_id, ?, ? FROM role_master WHERE org_id = ? AND role_id = 'OPS'`, [code, edit, org_id]);
        subSeeded += r.affectedRows;
      }
    }
  }
  if (!hadSubEnabled) {
    const [r] = await conn.query(`UPDATE product_master p SET p.sub_enabled = 'Y'
      WHERE EXISTS (SELECT 1 FROM sub_menu_item i WHERE i.org_id = p.org_id AND i.product_id = p.product_id)`);
    subSeeded += r.affectedRows;
  }
  console.log(`009_subscriptions: ${subSeeded ? "defaults created" : "OK"}`);

  // 010: invoice is finalized after receipt now (status I). Indents that were finalized before dispatch under the
  // old flow (F) go back to Accepted so the kitchen can dispatch them; their invoice is finalized after receipt.
  const [f] = await conn.query(`UPDATE indent_header SET status = 'A', inv_finalized_by = NULL, inv_finalized_date = NULL WHERE status = 'F'`);
  // indents received under the old flow already have their invoice: mark them Invoiced
  const [ri] = await conn.query(`UPDATE indent_header h SET h.status = 'I'
     WHERE h.status = 'R' AND EXISTS (SELECT 1 FROM invoice_header i WHERE i.org_id = h.org_id AND i.indent_number = h.indent_number)`);
  console.log(`010_invoice_after_receipt: ${f.affectedRows || ri.affectedRows ? `${f.affectedRows} back to Accepted, ${ri.affectedRows} marked Invoiced` : "OK"}`);

  // 011: reservations - settings, seatings and the dining-room tables (from the floor sketch) per org, once
  const { TABLE_SEED, SEATING_SEED, SETTINGS_SEED } = require("../common/reservation_seed");
  let resSeeded = 0;
  for (const { org_id } of orgs) {
    const [s] = await conn.query(`INSERT IGNORE INTO res_settings SET ?`, [{ org_id, ...SETTINGS_SEED }]);
    resSeeded += s.affectedRows;
    const [[{ t }]] = await conn.query(`SELECT COUNT(*) AS t FROM res_table WHERE org_id = ?`, [org_id]);
    if (!t) {
      for (const r of TABLE_SEED) await conn.query(`INSERT INTO res_table SET ?`, [{ org_id, ...r, updated_by: "migration", updated_date: new Date() }]);
      resSeeded++;
    }
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM res_seating WHERE org_id = ?`, [org_id]);
    if (!n) {
      for (const r of SEATING_SEED) await conn.query(`INSERT INTO res_seating SET ?`, [{ org_id, ...r, updated_by: "migration", updated_date: new Date() }]);
      resSeeded++;
    }
    // the Operations Manager and Branch (restaurant) system roles get the reservation screens once
    const [[{ m }]] = await conn.query(`SELECT COUNT(*) AS m FROM role_screen WHERE org_id = ? AND screen_code LIKE 'RES\\_%'`, [org_id]);
    if (!m) {
      for (const [role, code, edit] of [["OPS", "RES_BOOKINGS", "Y"], ["OPS", "RES_REPORTS", "N"], ["OPS", "RES_SETUP", "Y"], ["BRANCH", "RES_BOOKINGS", "Y"], ["BRANCH", "RES_REPORTS", "N"]]) {
        const [r] = await conn.query(`INSERT IGNORE INTO role_screen (org_id, role_id, screen_code, can_edit)
                                      SELECT org_id, role_id, ?, ? FROM role_master WHERE org_id = ? AND role_id = ?`, [code, edit, org_id, role]);
        resSeeded += r.affectedRows;
      }
    }
  }
  console.log(`011_reservations: ${resSeeded ? "defaults created (tables, seatings, settings, role screens)" : "OK"}`);

  await conn.end();
})().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
