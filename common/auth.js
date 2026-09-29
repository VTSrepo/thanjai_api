// Authentication & authorisation helpers (JWT + bcrypt).
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const DEV_SECRET = 'thanjai-dev-secret-change-me';
const SECRET = process.env.JWT_SECRET || DEV_SECRET;
if (SECRET === DEV_SECRET && process.env.ENV === 'production') {
    console.error('WARNING: JWT_SECRET is not set - using the development secret.');
}
const TOKEN_TTL = process.env.JWT_TTL || '7d';

// Roles: A admin, B branch, K kitchen, X external customer
const ROLES = { ADMIN: 'A', BRANCH: 'B', KITCHEN: 'K', EXTERNAL: 'X' };

const signToken = (u) =>
    jwt.sign(
        { user_id: u.user_id, org_id: u.org_id, branch_id: u.branch_id, user_type: u.user_type, user_name: u.user_name },
        SECRET,
        { expiresIn: TOKEN_TTL }
    );

const isHash = (p) => typeof p === 'string' && /^\$2[aby]\$/.test(p);
const hashPassword = (plain) => bcrypt.hash(String(plain), 10);

// Supports existing plain-text passwords (compared as before) so they can be upgraded on login.
const verifyPassword = async (plain, stored) => {
    if (stored === null || stored === undefined) return false;
    if (isHash(stored)) return bcrypt.compare(String(plain), stored);
    return String(plain) === String(stored);
};

const authError = (res, status, message) =>
    res.status(status).json({ status, code: status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN', message });

// Express middleware: requires a valid Bearer token; optional role list.
const requireAuth = (roles) => (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return authError(res, 401, 'Please log in');
    try {
        req.user = jwt.verify(token, SECRET);
    } catch (e) {
        return authError(res, 401, e.name === 'TokenExpiredError' ? 'Session expired - please log in again' : 'Please log in');
    }
    if (roles && roles.length && !roles.includes(req.user.user_type)) {
        return authError(res, 403, 'You do not have access to this');
    }
    // org in the URL must be the user's org
    if (req.params && req.params.org_id && req.params.org_id !== req.user.org_id) {
        return authError(res, 403, 'You do not have access to this organisation');
    }
    next();
};

// Branch and external users are limited to their own branch.
const isBranchScoped = (u) => u && (u.user_type === ROLES.BRANCH || u.user_type === ROLES.EXTERNAL);

module.exports = { ROLES, signToken, hashPassword, verifyPassword, isHash, requireAuth, isBranchScoped };
