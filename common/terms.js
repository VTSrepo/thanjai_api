// Payment terms.
//   POI  = Due on receipt (due the invoice date)
//   EOM  = Due end of the month
//   EONM = Due end of next month
//   N<d> = Net <d> days, e.g. N7, N10, N30, or any custom number of days (1-365)
const moment = require('moment-timezone');

const PRESETS = ['POI', 'EOM', 'EONM', 'N7', 'N10', 'N15', 'N30', 'N45'];
const DEFAULT_TERM = 'EOM';

const netDays = (t) => {
    const m = /^N(\d{1,3})$/.exec(String(t || ''));
    const d = m ? parseInt(m[1], 10) : 0;
    return d >= 1 && d <= 365 ? d : null;
};

const isTerm = (t) => t === 'POI' || t === 'EOM' || t === 'EONM' || netDays(t) !== null;
const normTerm = (t) => (isTerm(t) ? t : DEFAULT_TERM);

const termLabel = (t) => {
    const term = normTerm(t);
    if (term === 'POI') return 'Due on receipt';
    if (term === 'EOM') return 'Due end of the month';
    if (term === 'EONM') return 'Due end of next month';
    return `Net ${netDays(term)}`;
};

// Kept for older callers: TERMS[code].label
const TERMS = new Proxy({}, {
    get: (_, code) => (isTerm(code) ? { label: termLabel(code) } : undefined),
});

// invoiceDate: 'YYYY-MM-DD' -> due date 'YYYY-MM-DD'
const dueDateFor = (term, invoiceDate) => {
    const d = moment(invoiceDate, 'YYYY-MM-DD');
    const t = normTerm(term);
    if (t === 'POI') return d.format('YYYY-MM-DD');
    if (t === 'EOM') return d.clone().endOf('month').format('YYYY-MM-DD');
    if (t === 'EONM') return d.clone().add(1, 'month').endOf('month').format('YYYY-MM-DD');
    return d.clone().add(netDays(t), 'days').format('YYYY-MM-DD');
};

module.exports = { TERMS, PRESETS, DEFAULT_TERM, isTerm, normTerm, termLabel, dueDateFor };
