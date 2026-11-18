// Password hashing with Node's built-in scrypt (no native modules needed)
const crypto = require("crypto");

const N = 16384, KEYLEN = 64;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(plain), salt, KEYLEN, { N }).toString("hex");
  return `scrypt$${N}$${salt}$${hash}`;
}

function verifyPassword(plain, stored) {
  try {
    const [algo, n, salt, hash] = String(stored || "").split("$");
    if (algo !== "scrypt") return false;
    const test = crypto.scryptSync(String(plain), salt, KEYLEN, { N: Number(n) });
    const want = Buffer.from(hash, "hex");
    return want.length === test.length && crypto.timingSafeEqual(want, test);
  } catch (e) { return false; }
}

function passwordProblem(p) {
  p = String(p || "");
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Password must contain letters and numbers.";
  return null;
}

module.exports = { hashPassword, verifyPassword, passwordProblem };
