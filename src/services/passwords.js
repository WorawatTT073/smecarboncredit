const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const deriveKey = promisify(scrypt);
const keyLength = 64;
const saltLength = 16;
const options = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dummySalt = randomBytes(saltLength);
const dummyHash = Buffer.alloc(keyLength);
const minimumPasswordLength = 12;

function isPasswordInput(value) {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 256;
}

async function hashPassword(password) {
  const salt = randomBytes(saltLength);
  const hash = await deriveKey(password, salt, keyLength, options);
  return { salt, hash };
}

async function verifyPassword(password, account) {
  const salt = account?.password_salt || dummySalt;
  const expected = account?.password_hash || dummyHash;
  const actual = await deriveKey(password, salt, keyLength, options);
  return timingSafeEqual(actual, expected) && Boolean(account);
}

module.exports = { hashPassword, verifyPassword, isPasswordInput, minimumPasswordLength };
