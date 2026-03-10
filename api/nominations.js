const { json, parseBody, postWebhook, sendMail, renderRows, validateRequired, escapeHtml } = require('./_lib/utils');
const { createNominationFromSubmission } = require('./_lib/repository');
const { verifySignedToken, getPaymentTokenSecret, getNominationFeeInr } = require('./_lib/payment');
const { getSql } = require('./_lib/db');

function normalizePhone(input) {
  return String(input || '').replace(/\D+/g, '').slice(-10);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });

  const data = await parseBody(req);
  if (!data) return json(res, 400, { message: 'Invalid request body' });

  try {
    getSql();
  } catch (err) {
    return json(res, 500, { message: err.message });
  }

  const nominationFee = getNominationFeeInr();
  const required = [
    'applicantType',
    'awardCategory',
    'legalName',
    'registrationType',
    'registrationId',
    'yearStarted',
    'city',
    'state',
    'primaryContactName',
    'primaryContactRole',
    'primaryContactPhone',
    'primaryContactEmail',
    'businessSummary',
    'keyMetrics',
    'evidencePackUrl',
    'authorizedSignatoryName',
    'authorizedSignatoryDesignation',
    'paymentProvider',
    'paymentOrderId',
    'paymentId',
    'paymentStatus',
    'paymentVerifiedToken'
  ];
  const missing = validateRequired(data, required);
  if (missing.length) return json(res, 400, { message: `Missing required fields: ${missing.join(', ')}` });

  const tokenSecret = getPaymentTokenSecret();
  if (!tokenSecret) {
    return json(res, 500, { message: 'Payment signing secret is missing. Set PAYMENT_TOKEN_SECRET.' });
  }

  let verifiedPayment;
  try {
    verifiedPayment = verifySignedToken(data.paymentVerifiedToken, tokenSecret);
  } catch (err) {
    return json(res, 400, { message: `Payment verification token is invalid: ${err.message}` });
  }

  if (String(verifiedPayment.paymentScope || '') !== 'nomination-fee') {
    return json(res, 400, { message: 'Payment token scope is invalid for nomination submission.' });
  }
  if (new Date(verifiedPayment.expiresAt || 0).getTime() < Date.now()) {
    return json(res, 400, { message: 'The verified payment token has expired. Please complete payment verification again.' });
  }
  if (String(verifiedPayment.provider || '').toLowerCase() !== String(data.paymentProvider || '').toLowerCase()) {
    return json(res, 400, { message: 'Payment provider mismatch.' });
  }
  if (String(verifiedPayment.orderId || '') !== String(data.paymentOrderId || '')) {
    return json(res, 400, { message: 'Payment order mismatch.' });
  }
  if (String(verifiedPayment.paymentId || '') !== String(data.paymentId || '')) {
    return json(res, 400, { message: 'Payment ID mismatch.' });
  }
  if (verifiedPayment.legalName && String(verifiedPayment.legalName).trim() !== String(data.legalName || '').trim()) {
    return json(res, 400, { message: 'Nomination legal name does not match the verified payment record.' });
  }
  if (verifiedPayment.awardCategory && String(verifiedPayment.awardCategory).trim() !== String(data.awardCategory || '').trim()) {
    return json(res, 400, { message: 'Nomination category does not match the verified payment record.' });
  }
  if (verifiedPayment.email && String(verifiedPayment.email).trim().toLowerCase() !== String(data.primaryContactEmail || '').trim().toLowerCase()) {
    return json(res, 400, { message: 'Primary contact email does not match the verified payment record.' });
  }
  if (verifiedPayment.contact && normalizePhone(verifiedPayment.contact) && normalizePhone(verifiedPayment.contact) !== normalizePhone(data.primaryContactPhone || '')) {
    return json(res, 400, { message: 'Primary contact phone does not match the verified payment record.' });
  }

  let nomination;
  try {
    nomination = await createNominationFromSubmission(data, verifiedPayment);
  } catch (err) {
    return json(res, 409, { message: err.message || 'Could not create the nomination record.' });
  }

  const nominationPayload = Object.assign({}, data, {
    nominationReference: nomination.nomination_reference,
    paymentVerifiedAt: verifiedPayment.verifiedAt,
    paymentAmountInr: verifiedPayment.amountInr,
    paymentMethod: verifiedPayment.paymentMethod || '',
    paymentReference: verifiedPayment.paymentReference || verifiedPayment.paymentId,
    gatewayOrderId: verifiedPayment.gatewayOrderId || '',
    gatewayPaymentId: verifiedPayment.gatewayPaymentId || ''
  });

  const subject = `New nomination submission | ${nomination.nomination_reference} | ${data.legalName} | ${data.awardCategory}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#132220;">
      <h2 style="margin:0 0 12px;">SOHO Awards 2026 — Nomination Submission</h2>
      <p>A new nomination has been submitted through the live website form.</p>
      <p><strong>Nomination reference:</strong> ${escapeHtml(nomination.nomination_reference)}</p>
      <p><strong>Nomination fee:</strong> ₹${nominationFee} per submission</p>
      <p><strong>Verified payment:</strong> ${escapeHtml(String(verifiedPayment.providerLabel || verifiedPayment.provider || ''))} | ${escapeHtml(String(verifiedPayment.paymentId || ''))} | ${escapeHtml(String(verifiedPayment.orderId || ''))}</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">${renderRows(nominationPayload)}</table>
    </div>`;

  const deliveries = [];
  const awardsTo = process.env.AWARDS_TO || process.env.SMTP_TO || process.env.SMTP_FROM;
  if (!awardsTo && !process.env.NOTIFICATION_WEBHOOK_URL) {
    return json(res, 500, { message: 'Nomination workflow is not fully configured yet. Set AWARDS_TO and SMTP settings or NOTIFICATION_WEBHOOK_URL.' });
  }

  if (awardsTo) deliveries.push(await sendMail({ to: awardsTo, subject, html, replyTo: data.primaryContactEmail }));
  if (process.env.NOTIFICATION_WEBHOOK_URL) deliveries.push(await postWebhook({ type: 'nomination', subject, data: nominationPayload, verifiedPayment, nominationRecord: nomination }));

  if ((process.env.ACK_EMAIL_ENABLED || '').toLowerCase() === 'true' && data.primaryContactEmail) {
    const ackHtml = `<div style="font-family:Arial,sans-serif;color:#132220;"><p>Hello ${escapeHtml(data.primaryContactName)},</p><p>We have received your nomination for <strong>${escapeHtml(data.awardCategory)}</strong> under the name <strong>${escapeHtml(data.legalName)}</strong>.</p><p><strong>Nomination reference:</strong> ${escapeHtml(nomination.nomination_reference)}</p><p><strong>Nomination fee payment verified:</strong> ₹${nominationFee} | <strong>Gateway:</strong> ${escapeHtml(String(verifiedPayment.providerLabel || verifiedPayment.provider || ''))} | <strong>Payment ID:</strong> ${escapeHtml(String(verifiedPayment.paymentId || ''))}</p><p>Your submission will now proceed to completeness review, category eligibility screening, evidence review, and verification where required under the SOHO Awards process.</p><p>Regards,<br>SOHO Awards Secretariat</p></div>`;
    await sendMail({ to: data.primaryContactEmail, subject: `Nomination received | ${nomination.nomination_reference} | SOHO Awards 2026`, html: ackHtml, replyTo: awardsTo || process.env.SMTP_FROM });
  }

  return json(res, 200, {
    message: `Your nomination has been submitted successfully. Reference: ${nomination.nomination_reference}. The Awards Secretariat should acknowledge receipt through the connected workflow.`,
    deliveries,
    nominationReference: nomination.nomination_reference,
    payment: {
      provider: verifiedPayment.provider,
      paymentId: verifiedPayment.paymentId,
      orderId: verifiedPayment.orderId
    }
  });
};
