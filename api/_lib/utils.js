const nodemailer = require('nodemailer');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function parseRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf-8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch (err) { return null; }
  }
  const raw = await parseRawBody(req);
  try { return raw ? JSON.parse(raw) : null; } catch (err) { return null; }
}

async function postWebhook(payload) {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) return { delivered: false, channel: 'webhook-disabled' };
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Webhook delivery failed');
  return { delivered: true, channel: 'webhook' };
}

async function sendMail({ to, subject, html, replyTo }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !pass || !from) {
    return { delivered: false, channel: 'smtp-disabled' };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  await transporter.sendMail({ from, to, subject, html, replyTo });
  return { delivered: true, channel: 'smtp' };
}

function renderRows(data) {
  return Object.entries(data)
    .map(([key, value]) => {
      const normalizedValue = Array.isArray(value) ? value.join(', ') : String(value ?? '');
      return `<tr><td style="padding:8px 12px;border:1px solid #d8e1df;font-weight:600;background:#f7faf9;vertical-align:top;">${escapeHtml(key)}</td><td style="padding:8px 12px;border:1px solid #d8e1df;">${escapeHtml(normalizedValue)}</td></tr>`;
    })
    .join('');
}

function validateRequired(data, fields) {
  const missing = fields.filter((field) => !String(data[field] ?? '').trim());
  return missing;
}

module.exports = {
  json,
  escapeHtml,
  parseBody,
  parseRawBody,
  postWebhook,
  sendMail,
  renderRows,
  validateRequired
};
