const crypto = require('crypto');

function base64urlEncode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlDecode(input) {
  const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function hmacSha256Hex(message, secret) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function hmacSha256Base64(message, secret) {
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

function secureEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function issueSignedToken(payload, secret) {
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = base64urlEncode(crypto.createHmac('sha256', secret).update(encodedPayload).digest());
  return `${encodedPayload}.${signature}`;
}

function verifySignedToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    throw new Error('Invalid payment token format');
  }
  const [encodedPayload, signature] = token.split('.');
  const expected = base64urlEncode(crypto.createHmac('sha256', secret).update(encodedPayload).digest());
  if (!secureEqual(signature, expected)) throw new Error('Invalid payment token signature');
  const payload = JSON.parse(base64urlDecode(encodedPayload).toString('utf-8'));
  return payload;
}

function randomId(length = 10) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function createNominationReference(prefix = 'SOHO') {
  return `${prefix}-NOM-${Date.now()}-${randomId(8).toUpperCase()}`;
}

function createCashfreeOrderId() {
  return `soho_${Date.now()}_${randomId(8)}`;
}

function createReceiptId() {
  return `soho_receipt_${Date.now()}_${randomId(8)}`;
}

function normalizePhone(input) {
  const digits = String(input || '').replace(/\D+/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function getPaymentTokenSecret() {
  return process.env.PAYMENT_TOKEN_SECRET || process.env.INTERNAL_SIGNING_SECRET || '';
}

function getProviderConfig(requestedProvider) {
  const provider = String(requestedProvider || process.env.NOMINATION_PAYMENT_PROVIDER || 'razorpay').trim().toLowerCase();
  if (!['razorpay', 'cashfree'].includes(provider)) throw new Error('Unsupported payment provider');
  return provider;
}

function getNominationFeeInr() {
  const raw = Number(process.env.NOMINATION_FEE_INR || 100);
  if (!Number.isFinite(raw) || raw <= 0) return 100;
  return Math.round(raw * 100) / 100;
}

function getCashfreeApiBase() {
  const environment = String(process.env.CASHFREE_ENVIRONMENT || process.env.NOMINATION_PAYMENT_MODE || 'sandbox').toLowerCase();
  return environment === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

function getCashfreeMode() {
  const environment = String(process.env.CASHFREE_ENVIRONMENT || process.env.NOMINATION_PAYMENT_MODE || 'sandbox').toLowerCase();
  return environment === 'production' ? 'production' : 'sandbox';
}

function getRazorpayBase() {
  return 'https://api.razorpay.com/v1';
}

function inferSiteUrl(pageUrl) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  if (!pageUrl) return '';
  try {
    const parsed = new URL(pageUrl);
    return parsed.origin.replace(/\/$/, '');
  } catch (err) {
    return '';
  }
}

function buildCashfreeReturnUrl(pageUrl) {
  const siteUrl = inferSiteUrl(pageUrl);
  const path = (process.env.PAYMENT_RETURN_PATH || '/nomination-form.html').startsWith('/')
    ? (process.env.PAYMENT_RETURN_PATH || '/nomination-form.html')
    : `/${process.env.PAYMENT_RETURN_PATH}`;
  const query = 'payment_provider=cashfree&order_id={order_id}';
  if (siteUrl) return `${siteUrl}${path}?${query}`;
  return `${path}?${query}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (err) {
    body = text;
  }
  if (!response.ok) {
    const message = body && typeof body === 'object'
      ? body.error?.description || body.message || body.error || JSON.stringify(body)
      : text || `Request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

module.exports = {
  hmacSha256Hex,
  hmacSha256Base64,
  secureEqual,
  issueSignedToken,
  verifySignedToken,
  createNominationReference,
  createCashfreeOrderId,
  createReceiptId,
  normalizePhone,
  getPaymentTokenSecret,
  getProviderConfig,
  getNominationFeeInr,
  getCashfreeApiBase,
  getCashfreeMode,
  getRazorpayBase,
  buildCashfreeReturnUrl,
  fetchJson,
  inferSiteUrl,
  randomId
};
