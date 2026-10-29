// Starting data for table reservations (used once per organisation by migrations/run.js; editable later in
// Reservations → Setup).
//
// Tables follow the hand-drawn floor plan of the Montreal dining room (entrance top-left, A row along the
// top wall, B row through the middle, C row along the bottom-left, service area bottom-right).
// pos_x / pos_y = centre of the table as % of the floor width / height; width / height also in %.
// orient: H = chairs above and below, V = chairs left and right.
const T = (table_id, seats, pos_x, pos_y, width, height, orient, sort_order) =>
  ({ table_id, table_row: table_id[0], seats, pos_x, pos_y, width, height, orient, online: 'Y', status: 'A', sort_order });

const TABLE_SEED = [
  // A row - booths along the top wall
  T('A1', 4, 31.7, 8, 4.5, 8.5, 'V', 1),
  T('A2', 4, 39.8, 8, 4.5, 8.5, 'V', 2),
  T('A3', 4, 53.0, 8, 4.5, 8.5, 'V', 3),
  T('A4', 4, 63.8, 8, 4.5, 8.5, 'V', 4),
  T('A5', 4, 76.6, 8, 4.5, 8.5, 'V', 5),
  T('A6', 4, 88.7, 8, 4.5, 8.5, 'V', 6),
  // B row - middle of the room (there is no B5 on the plan)
  T('B1', 4, 24.8, 38.3, 7, 6.5, 'H', 11),
  T('B2', 4, 34.6, 38.3, 7, 6.5, 'H', 12),
  T('B3', 4, 44.4, 38.3, 7, 6.5, 'H', 13),
  T('B4', 4, 54.2, 38.3, 7, 6.5, 'H', 14),
  T('B6', 4, 58.6, 78.5, 5, 8.5, 'V', 16),
  T('B7', 2, 59.1, 64.5, 4, 5.5, 'V', 17),
  T('B8', 4, 73.4, 78.5, 5, 8.5, 'V', 18),
  T('B9', 4, 73.6, 64.5, 5, 8.5, 'V', 19),
  T('B10', 4, 81.6, 41.5, 7, 6.5, 'H', 20),
  T('B11', 2, 89.6, 41.5, 4, 5.5, 'H', 21),
  // C row - along the bottom-left wall
  T('C1', 4, 8.5, 89, 7, 6.5, 'H', 31),
  T('C2', 4, 20.9, 89, 7, 6.5, 'H', 32),
  T('C3', 4, 31.3, 89, 7, 6.5, 'H', 33),
];

const SEATING_SEED = [
  { seating_id: 'L1', label: 'Lunch', start_time: '11:30', weekdays: '0123456', sort_order: 1, status: 'A' },
  { seating_id: 'L2', label: 'Lunch', start_time: '13:00', weekdays: '0123456', sort_order: 2, status: 'A' },
  { seating_id: 'D1', label: 'Dinner', start_time: '17:30', weekdays: '0123456', sort_order: 3, status: 'A' },
  { seating_id: 'D2', label: 'Dinner', start_time: '19:00', weekdays: '0123456', sort_order: 4, status: 'A' },
  { seating_id: 'D3', label: 'Dinner', start_time: '20:30', weekdays: '0123456', sort_order: 5, status: 'A' },
];

const SETTINGS_SEED = {
  max_reserved_seats: 40,
  days_ahead: 30,
  min_notice_minutes: 60,
  cancel_notice_minutes: 60,
  max_party_online: 12,
  seating_minutes: 90,
  booking_open: 'Y',
  restaurant_name: 'Thanjai Restaurant',
  phone: '+1 514-419-9696',
  address: '4759 Ave Van Horne, Montreal, QC H3W 1H8',
  notify_email: 'thanjairestaurant@gmail.com',
  guest_notes: [
    'For larger groups, please call us so we can arrange a personalised experience - or ask about our Party Hall (up to 70 guests).',
    'Bigger groups get tables placed together by our staff.',
    'Please tell your server about any food allergies or dietary needs before ordering.',
  ].join('\n'),
};

// Fixed parts of the floor drawing (not tables)
const FLOOR_DECOR = [
  { kind: 'entrance', label: 'Entrance', x: 7.4, y: 0, w: 19.2, h: 19 },
  { kind: 'block', label: 'Service area', x: 44.5, y: 87, w: 55.5, h: 13 },
];

module.exports = { TABLE_SEED, SEATING_SEED, SETTINGS_SEED, FLOOR_DECOR };
