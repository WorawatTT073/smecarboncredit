const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');
const pool = require('../config/database');

const configuredSecret = process.env.JWT_SECRET;
const exampleSecret = 'replace-with-a-random-secret-at-least-32-characters';
const secret = configuredSecret && configuredSecret !== exampleSecret && Buffer.byteLength(configuredSecret) >= 32
  ? configuredSecret : randomBytes(32);
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const uuidFormat = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function signature(unsignedToken) {
  return createHmac('sha256', secret).update(unsignedToken).digest('base64url');
}

function signToken(account) {
  const payload = {
    sub: account.id,
    ver: account.session_version,
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
  };
  const unsigned = header + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
  return unsigned + '.' + signature(unsigned);
}

function verifyToken(token) {
  const [tokenHeader, payload, tag, extra] = token.split('.');
  if (tokenHeader !== header || !payload || !tag || extra !== undefined || token.length > 512) {
    throw new Error('Invalid token');
  }

  const expected = Buffer.from(signature(tokenHeader + '.' + payload));
  const received = Buffer.from(tag);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error('Invalid signature');
  }

  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (typeof data.sub !== 'string' || !uuidFormat.test(data.sub) || !Number.isSafeInteger(data.ver)
      || !Number.isSafeInteger(data.exp) || Date.now() >= data.exp * 1000) {
    throw new Error('Invalid or expired token');
  }
  return data;
}

function accountProfile(account) {
  const { email, name, role, company_id } = account;
  return { email, name, role, company_id };
}

async function requireAuth(req, res, next) {
  const auth = req.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }

  let claims;
  try {
    claims = verifyToken(auth.slice(7));
  } catch {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }

  try {
    const { rows: [account] } = await pool.query(`
      SELECT id, email, name, role, company_id FROM app_accounts WHERE id = $1 AND session_version = $2
    `, [claims.sub, claims.ver]);
    if (!account) return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });

    req.user = accountProfile(account);
    req.auth = { accountId: account.id, sessionVersion: claims.ver };
    next();
  } catch (error) {
    next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'บัญชีนี้ไม่มีสิทธิ์ทำรายการ' });
    }
    next();
  };
}

module.exports = { accountProfile, signToken, requireAuth, requireRole };
