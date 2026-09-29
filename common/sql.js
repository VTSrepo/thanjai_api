// SQL value helpers. Every value placed inside a SQL string must go through esc().
const mysql = require('mysql2');

// Quote + escape a value for SQL (strings, numbers, dates, null -> NULL)
const esc = (v) => mysql.escape(v === undefined ? null : v);

// Some older UI calls send values wrapped in quotes, e.g. start_date='2026-01-01'
const unq = (v) => (typeof v === 'string' ? v.replace(/^'+|'+$/g, '') : v);

// Integers for LIMIT/OFFSET style fragments
const int = (v, dflt = 0) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : dflt;
};

module.exports = { esc, unq, int };
