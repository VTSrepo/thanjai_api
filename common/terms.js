// Credit terms: POI = payment on invoice, EOM = end of month, N30 = net 30 days.
const moment = require('moment-timezone');

const TERMS = {
    POI: { label: 'Due on receipt', name: 'Payment on invoice' },
    EOM: { label: 'Due end of the month', name: 'End of month' },
    N30: { label: 'Net 30', name: 'Net 30' },
};
const DEFAULT_TERM = 'EOM';

const normTerm = (t) => (TERMS[t] ? t : DEFAULT_TERM);

// invoiceDate: 'YYYY-MM-DD' -> due date 'YYYY-MM-DD'
const dueDateFor = (term, invoiceDate) => {
    const d = moment(invoiceDate, 'YYYY-MM-DD');
    switch (normTerm(term)) {
        case 'POI': return d.format('YYYY-MM-DD');
        case 'N30': return d.clone().add(30, 'days').format('YYYY-MM-DD');
        default: return d.clone().endOf('month').format('YYYY-MM-DD');
    }
};

module.exports = { TERMS, DEFAULT_TERM, normTerm, dueDateFor };
