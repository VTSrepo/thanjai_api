-- Thanjai online meals: Montreal-area delivery zones (Shop setup -> Delivery zones).
-- Safe to run again: existing zones with the same code are updated, nothing else is touched.
-- Postal code starts are comma separated, no spaces (the app's own format). Fees are suggestions - change them here or in the app.
-- Run on the VPS:  sudo mysql thanjai_restaurant < load_delivery_zones.sql

INSERT INTO sub_zone (org_id, zone_id, zone_name, postal_prefixes, delivery_fee, status, sort_order, created_by, created_date, updated_by, updated_date) VALUES
('TR', 'DT',      'Downtown & Old Montreal',                 'H3A,H3B,H3G,H3H,H2Y,H2Z,H3C,H2L',                 0.00, 'A', 1, 'script', NOW(), 'script', NOW()),
('TR', 'CENTRAL', 'Plateau, Mile End, Rosemont',             'H2J,H2T,H2W,H2V,H2G,H2H,H1X,H1Y',                 3.99, 'A', 2, 'script', NOW(), 'script', NOW()),
('TR', 'WEST',    'Cote-des-Neiges, NDG, Westmount, Verdun', 'H3S,H3T,H3V,H3W,H4A,H4B,H3Y,H3Z,H4G,H4H,H4E',     4.99, 'A', 3, 'script', NOW(), 'script', NOW()),
('TR', 'NORTH',   'Saint-Laurent, Ahuntsic, Villeray',       'H4L,H4M,H4N,H4R,H4S,H2C,H2M,H2N,H2P,H2R,H2E',     5.99, 'A', 4, 'script', NOW(), 'script', NOW()),
('TR', 'LAVAL',   'Laval',                                   'H7',                                              7.99, 'A', 5, 'script', NOW(), 'script', NOW()),
('TR', 'WI',      'West Island',                             'H9R,H9S,H9H,H9J,H9A,H9B,H9G,H8Y,H8Z,H9K',         8.99, 'A', 6, 'script', NOW(), 'script', NOW())
ON DUPLICATE KEY UPDATE
  zone_name = VALUES(zone_name), postal_prefixes = VALUES(postal_prefixes), delivery_fee = VALUES(delivery_fee),
  status = VALUES(status), sort_order = VALUES(sort_order), updated_by = 'script', updated_date = NOW();

-- The first install created a catch-all zone MTL "Montreal" (every postal code starting with H, fee 5.00).
-- Switch it off so only the zones above are delivered to (switch it back on in the app if you want it as a fallback).
UPDATE sub_zone SET status = 'I', updated_by = 'script', updated_date = NOW() WHERE org_id = 'TR' AND zone_id = 'MTL' AND postal_prefixes = 'H';

SELECT zone_id, zone_name, delivery_fee, status, postal_prefixes FROM sub_zone WHERE org_id = 'TR' ORDER BY sort_order;
