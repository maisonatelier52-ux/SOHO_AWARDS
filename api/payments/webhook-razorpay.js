const { json, parseRawBody, postWebhook, sendMail } = require('../_lib/utils');
const { getSql } = require('../_lib/db');
const { recordPaymentWebhook, updatePaymentFromWebhook } = require('../_lib/repository');
const { hmacSha256Hex, secureEqual } = require('../_lib/payment');

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return json(res, 500, { message: 'Set RAZORPAY_WEBHOOK_SECRET.' });

  try {
    getSql();
  } catch (err) {
    return json(res, 500, { message: err.message });
  }

  const rawBody = await parseRawBody(req);
  const signature = req.headers['x-razorpay-signature'] || req.headers['X-Razorpay-Signature'];
  const eventId = req.headers['x-razorpay-event-id'] || req.headers['X-Razorpay-Event-Id'] || '';
  if (!signature) return json(res, 400, { message: 'Missing Razorpay signature header.' });

  const expected = hmacSha256Hex(rawBody, webhookSecret);
  if (!secureEqual(expected, signature)) {
    await recordPaymentWebhook({ provider: 'razorpay', eventType: 'invalid-signature', eventId, signatureValid: false, status: 'rejected', notes: 'Invalid signature', payload: { rawBody } });
    return json(res, 400, { message: 'Invalid Razorpay webhook signature.' });
  }

  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (err) {
    return json(res, 400, { message: 'Invalid JSON payload.' });
  }

  const paymentEntity = payload?.payload?.payment?.entity || payload?.payload?.order?.entity || {};
  const orderId = paymentEntity.order_id || payload?.payload?.order?.entity?.id || null;
  const paymentId = paymentEntity.id || null;
  const gatewayStatus = paymentEntity.status || null;
  const paymentMethod = paymentEntity.method || null;

  await recordPaymentWebhook({
    provider: 'razorpay',
    eventType: payload.event || null,
    eventId,
    orderId,
    paymentId,
    signatureValid: true,
    status: 'received',
    payload
  });

  await updatePaymentFromWebhook({
    provider: 'razorpay',
    orderId,
    paymentId,
    gatewayStatus,
    paymentMethod,
    gatewayOrderId: orderId,
    gatewayPaymentId: paymentId
  });

  const subject = `Razorpay webhook | ${payload.event || 'event'} | ${eventId || 'no-event-id'}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#132220;"><h2>SOHO Awards payment webhook</h2><p><strong>Provider:</strong> Razorpay</p><p><strong>Event:</strong> ${String(payload.event || '')}</p><p><strong>Event ID:</strong> ${String(eventId)}</p><p><strong>Order ID:</strong> ${String(orderId || '')}</p><pre style="white-space:pre-wrap;background:#f7faf9;border:1px solid #d8e1df;padding:12px;border-radius:12px;">${JSON.stringify(payload, null, 2)}</pre></div>`;

  const awardsTo = process.env.AWARDS_TO || process.env.SMTP_TO || process.env.SMTP_FROM;
  try {
    if (awardsTo) await sendMail({ to: awardsTo, subject, html, replyTo: awardsTo });
    if (process.env.NOTIFICATION_WEBHOOK_URL) {
      await postWebhook({ type: 'payment-webhook', provider: 'razorpay', eventId, payload, orderId, paymentId });
    }
  } catch (err) {
    return json(res, 500, { message: err.message || 'Webhook relay failed.' });
  }

  return json(res, 200, { received: true, provider: 'razorpay', eventId });
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
