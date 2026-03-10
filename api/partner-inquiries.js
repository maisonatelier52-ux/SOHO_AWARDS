const { json, parseBody, postWebhook, sendMail, renderRows, validateRequired, escapeHtml } = require('./_lib/utils');
const { getSql } = require('./_lib/db');
const { createPartnerInquiry } = require('./_lib/repository');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });

  const data = await parseBody(req);
  if (!data) return json(res, 400, { message: 'Invalid request body' });

  try {
    getSql();
  } catch (err) {
    return json(res, 500, { message: err.message });
  }

  const required = ['companyName', 'contactName', 'contactEmail', 'contactPhone', 'interestType', 'message'];
  const missing = validateRequired(data, required);
  if (missing.length) return json(res, 400, { message: `Missing required fields: ${missing.join(', ')}` });

  const inquiry = await createPartnerInquiry(data);

  const subject = `Partner inquiry | ${inquiry.inquiry_reference} | ${data.companyName} | ${data.interestType}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#132220;">
      <h2 style="margin:0 0 12px;">SOHO Awards 2026 — Partner Inquiry</h2>
      <p>A new partner inquiry has been submitted through the website.</p>
      <p><strong>Reference:</strong> ${escapeHtml(inquiry.inquiry_reference)}</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">${renderRows(data)}</table>
    </div>`;

  const target = process.env.PARTNERSHIPS_TO || process.env.AWARDS_TO || process.env.SMTP_TO || process.env.SMTP_FROM;
  if (!target && !process.env.NOTIFICATION_WEBHOOK_URL) {
    return json(res, 500, { message: 'Partner workflow is not fully configured yet. Set PARTNERSHIPS_TO and SMTP settings or NOTIFICATION_WEBHOOK_URL.' });
  }

  const deliveries = [];
  if (target) deliveries.push(await sendMail({ to: target, subject, html, replyTo: data.contactEmail }));
  if (process.env.NOTIFICATION_WEBHOOK_URL) deliveries.push(await postWebhook({ type: 'partner-inquiry', subject, data, inquiry }));

  if ((process.env.ACK_EMAIL_ENABLED || '').toLowerCase() === 'true' && data.contactEmail) {
    const ackHtml = `<div style="font-family:Arial,sans-serif;color:#132220;"><p>Hello ${escapeHtml(data.contactName)},</p><p>We have received your partnership inquiry for <strong>${escapeHtml(data.companyName)}</strong>.</p><p><strong>Reference:</strong> ${escapeHtml(inquiry.inquiry_reference)}</p><p>The SOHO Awards Secretariat should respond through the connected workflow after reviewing your interest type and message.</p><p>Regards,<br>SOHO Awards Secretariat</p></div>`;
    await sendMail({ to: data.contactEmail, subject: `Partner inquiry received | ${inquiry.inquiry_reference} | SOHO Awards 2026`, html: ackHtml, replyTo: target || process.env.SMTP_FROM });
  }

  return json(res, 200, {
    message: `Your partner inquiry has been recorded. Reference: ${inquiry.inquiry_reference}. The Awards Secretariat should follow up from the connected workflow.`,
    deliveries,
    inquiryReference: inquiry.inquiry_reference
  });
};
