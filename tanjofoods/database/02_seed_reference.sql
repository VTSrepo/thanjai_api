-- =====================================================================
--  Tanjo Foods – reference / setup data
--  Run after 01_schema.sql.  Products are loaded by 03_seed_products.sql
--  (generated from the client Excel template by tools/import_products.py)
-- =====================================================================
USE Tanjofoods;

INSERT INTO categories (code, name_en, name_fr, description_en, description_fr, sort_order, is_active) VALUES
 ('SNACKS','Snacks & Chips','Collations et croustilles','A variety of savoury snacks and chips to enjoy anytime.','Une variété de collations salées et de croustilles à savourer à tout moment.',10,1),
 ('FROZEN','Frozen Food','Produits surgelés','Samosas, rolls and South Indian favourites – ready to cook from frozen.','Samoussas, rouleaux et classiques du sud de l’Inde, prêts à cuire.',20,1),
 ('SAUCES','Sauces','Sauces','A flavourful sauce to bring the taste of butter chicken to your table.','Une sauce savoureuse pour apporter le goût du poulet au beurre à votre table.',30,1),
 ('BEV',   'Beverages',     'Boissons',                 'Refreshing drinks for every moment.','Des boissons rafraîchissantes pour chaque moment.',40,1),
 ('RTE',   'Samosas',       'Samoussas',                'Replaced by Frozen Food (2026-11).',NULL,90,0)
ON DUPLICATE KEY UPDATE name_en = VALUES(name_en), name_fr = VALUES(name_fr), description_en = VALUES(description_en),
  description_fr = VALUES(description_fr), sort_order = VALUES(sort_order), is_active = VALUES(is_active);

-- Quebec sales taxes (verify current rates before go-live)
INSERT INTO tax_rates (code, name, province, rate, sort_order, effective_from) VALUES
 ('GST','GST (5%)',     'QC', 0.05000, 1, '2026-01-01'),
 ('QST','QST (9.975%)', 'QC', 0.09975, 2, '2026-01-01')
ON DUPLICATE KEY UPDATE rate = VALUES(rate), name = VALUES(name);

-- SAMPLE delivery zone – replace FSAs / fees with the client's actual coverage
INSERT INTO delivery_zones (name, postal_prefixes, delivery_fee, free_over, min_order, lead_time_days)
SELECT z_name, z_prefixes, z_fee, z_free_over, z_min_order, z_lead_days FROM (SELECT 'Montreal - Island' AS z_name,
  'H1A,H1B,H1C,H1E,H1G,H1H,H1J,H1K,H1L,H1M,H1N,H1P,H1R,H1S,H1T,H1V,H1W,H1X,H1Y,H1Z,H2A,H2B,H2C,H2E,H2G,H2H,H2J,H2K,H2L,H2M,H2N,H2P,H2R,H2S,H2T,H2V,H2W,H2X,H2Y,H2Z,H3A,H3B,H3C,H3E,H3G,H3H,H3J,H3K,H3L,H3M,H3N,H3P,H3R,H3S,H3T,H3V,H3W,H3X,H3Y,H3Z,H4A,H4B,H4C,H4E,H4G,H4H,H4J,H4K,H4L,H4M,H4N,H4P,H4R,H4S,H4T,H4V,H4W,H4X,H4Y,H4Z,H8N,H8P,H8R,H8S,H8T,H8Y,H8Z,H9A,H9B,H9C,H9E,H9G,H9H,H9J,H9K,H9P,H9R,H9S,H9W,H9X' AS z_prefixes,
  6.99 AS z_fee, 75.00 AS z_free_over, 25.00 AS z_min_order, 1 AS z_lead_days) z
WHERE NOT EXISTS (SELECT 1 FROM delivery_zones WHERE name = 'Montreal - Island');

-- SAMPLE delivery / pickup windows (Mon–Sat)
INSERT INTO delivery_slots (fulfilment, day_of_week, start_time, end_time, max_orders)
SELECT f.fulfilment, d.d, s.st, s.et, 20
FROM (SELECT 'DELIVERY' AS fulfilment UNION ALL SELECT 'PICKUP') f
CROSS JOIN (SELECT 1 d UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) d
CROSS JOIN (SELECT '10:00:00' st,'13:00:00' et UNION ALL SELECT '13:00:00','16:00:00' UNION ALL SELECT '16:00:00','19:00:00') s
WHERE NOT EXISTS (SELECT 1 FROM delivery_slots);

INSERT INTO settings (setting_key, setting_value, description) VALUES
 ('store_name',          'Tanjo Foods',                                   'Display name'),
 ('store_email',         '',                                              'Public contact e-mail – TO BE CONFIRMED (hidden while empty)'),
 ('store_phone',         '',                                              'Public phone – TO BE CONFIRMED (hidden while empty)'),
 ('store_address',       '8451 Chem. Dalton, Mont-Royal, QC H4T 1V5',     'Pickup / business address'),
 ('currency',            'CAD',                                           ''),
 ('min_order_amount',    '25.00',                                         'Minimum cart subtotal for checkout'),
 ('default_delivery_fee','6.99',                                          'Used when no zone matches'),
 ('free_delivery_over',  '75.00',                                         ''),
 ('order_prefix',        'TF',                                            'Order number prefix'),
 ('order_lead_days',     '1',                                             'Earliest delivery = today + N days'),
 ('payment_provider',    'STRIPE',                                        'STRIPE / SQUARE / MONERIS – TO BE DECIDED'),
 ('notify_email',        'info@tanjofoods.com',                           'Where new orders and enquiries are e-mailed'),
 ('gst_number',          '',                                              'Printed on receipts'),
 ('qst_number',          '',                                              'Printed on receipts')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
