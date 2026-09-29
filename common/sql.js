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

// Turn common MySQL errors into a message the user can act on (null when there is no friendly version)
const friendlyDbError = (err) => {
    const msg = (err && err.sqlMessage) || '';
    const col = (msg.match(/column '([^']+)'/) || [])[1];
    const LABELS = { mobile_no: 'Mobile', home_contact_no: 'Home contact', email_id: 'Email', user_id: 'User ID',
        user_name: 'Name', residence_address: 'Address', pwd: 'Password' };
    const raw = col ? (LABELS[col] || col.replace(/_/g, ' ')) : 'A value';
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    switch (err && err.code) {
        case 'ER_DATA_TOO_LONG': return `${label} is too long.`;
        case 'ER_DUP_ENTRY': return 'This record already exists.';
        case 'ER_TRUNCATED_WRONG_VALUE':
        case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
        case 'WARN_DATA_TRUNCATED': return `${label} has an invalid value.`;
        case 'ER_BAD_NULL_ERROR': return `${label} is required.`;
        case 'ER_BAD_FIELD_ERROR': return 'The database is missing a column - run migrations (start-local.bat) and try again.';
        default: return null;
    }
};

module.exports = { esc, unq, int, friendlyDbError };
