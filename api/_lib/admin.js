const crypto = require('crypto');
const { json } = require('./utils');

function secureEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getProvidedKey(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (/^Bearer\s+/i.test(authHeader)) return authHeader.replace(/^Bearer\s+/i, '').trim();
  return (req.headers['x-admin-api-key'] || req.headers['X-Admin-Api-Key'] || '').trim();
}

function getAdminActor(req) {
  const name = String(req.headers['x-admin-name'] || req.headers['X-Admin-Name'] || 'Admin User').trim() || 'Admin User';
  const identifier = String(req.headers['x-admin-email'] || req.headers['X-Admin-Email'] || '').trim();
  return { name, identifier };
}

function requireAdmin(req, res) {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) {
    json(res, 500, { message: 'Set ADMIN_API_KEY before using the admin dashboard.' });
    return null;
  }

  const provided = getProvidedKey(req);
  if (!provided || !secureEqual(provided, configured)) {
    json(res, 401, { message: 'Unauthorized admin request.' });
    return null;
  }

  return getAdminActor(req);
}

module.exports = {
  requireAdmin
};
