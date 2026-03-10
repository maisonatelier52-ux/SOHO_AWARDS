const { json, parseBody, postWebhook, sendMail, renderRows, validateRequired, escapeHtml } = require('./_lib/utils');
const { getSql } = require('./_lib/db');
const { createPrivacyRequest } = require('./_lib/repository');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });

  const data = await parseBody(req);
  if (!data) return json(res, 400, { message: 'Invalid request body' });

  try {
    getSql();
  } catch (err) {
    return json(res, 500, { message: err.message });
  }

  const required = ['fullName', 'email', 'relationship', 'requestType', 'description'];
  const missing = validateRequired(data, required);
  if (missing.length) return json(res, 400, { message: `Missing required fields: ${missing.join(', ')}` });

  const ticket = await createPrivacyRequest(data);

  const subject = `Privacy / grievance request | ${ticket.request_reference} | ${data.requestType} | ${data.fullName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#132220;">
      <h2 style="margin:0 0 12px;">SOHO Awards 2026 — Privacy / Grievance Request</h2>
      <p>A new privacy request or grievance has been submitted through the website.</p>
      <p><strong>Reference:</strong> ${escapeHtml(ticket.request_reference)}</p>
      <p><strong>Priority:</strong> ${escapeHtml(ticket.priority)}</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">${renderRows(data)}</table>
    </div>`;

  const target = process.env.PRIVACY_TO || process.env.SMTP_TO || process.env.SMTP_FROM;
  if (!target && !process.env.NOTIFICATION_WEBHOOK_URL) {
    return json(res, 500, { message: 'Privacy workflow is not fully configured yet. Set PRIVACY_TO and SMTP settings or NOTIFICATION_WEBHOOK_URL.' });
  }

  const deliveries = [];
  if (target) deliveries.push(await sendMail({ to: target, subject, html, replyTo: data.email }));
  if (process.env.NOTIFICATION_WEBHOOK_URL) deliveries.push(await postWebhook({ type: 'privacy-request', subject, data, ticket }));

  if ((process.env.ACK_EMAIL_ENABLED || '').toLowerCase() === 'true' && data.email) {
    const ackHtml = `<div style="font-family:Arial,sans-serif;color:#132220;"><p>Hello ${escapeHtml(data.fullName)},</p><p>We have received your request concerning <strong>SOHO Awards 2026</strong>.</p><p><strong>Reference:</strong> ${escapeHtml(ticket.request_reference)}</p><p>We aim to acknowledge requests within 3 business days and respond or issue a status update within 30 calendar days of receiving a complete request.</p><p>Regards,<br>Privacy / Grievance Desk</p></div>`;
    await sendMail({ to: data.email, subject: `We have received your request | ${ticket.request_reference} | SOHO Awards 2026`, html: ackHtml, replyTo: target || process.env.SMTP_FROM });
  }

  return json(res, 200, {
    message: `Your request has been logged successfully. Reference: ${ticket.request_reference}. A confirmation response should follow from the connected workflow.`,
    deliveries,
    requestReference: ticket.request_reference,
    dueAt: ticket.due_at
  });
};
