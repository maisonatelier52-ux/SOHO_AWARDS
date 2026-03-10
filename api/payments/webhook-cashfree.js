const { json, parseRawBody, postWebhook, sendMail } = require('../_lib/utils');
const { getSql } = require('../_lib/db');
const { recordPaymentWebhook, updatePaymentFromWebhook } = require('../_lib/repository');
const { hmacSha256Base64, secureEqual } = require('../_lib/payment');

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });

  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if (!clientSecret) return json(res, 500, { message: 'Set CASHFREE_CLIENT_SECRET.' });

  try {
    getSql();
  } catch (err) {
    return json(res, 500, { message: err.message });
  }

  const rawBody = await parseRawBody(req);
  const timestamp = req.headers['x-webhook-timestamp'] || req.headers['X-Webhook-Timestamp'];
  const signature = req.headers['x-webhook-signature'] || req.headers['X-Webhook-Signature'];
  if (!timestamp || !signature) return json(res, 400, { message: 'Missing Cashfree webhook headers.' });

  const expected = hmacSha256Base64(`${timestamp}${rawBody}`, clientSecret);
  if (!secureEqual(expected, signature)) {
    await recordPaymentWebhook({ provider: 'cashfree', eventType: 'invalid-signature', signatureValid: false, status: 'rejected', notes: 'Invalid signature', payload: { rawBody } });
    return json(res, 400, { message: 'Invalid Cashfree webhook signature.' });
  }

  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (err) {
    return json(res, 400, { message: 'Invalid JSON payload.' });
  }

  const orderId = payload?.data?.order?.order_id || payload?.order_id || null;
  const paymentId = payload?.data?.payment?.cf_payment_id || null;
  const gatewayStatus = payload?.data?.payment?.payment_status || payload?.data?.order?.order_status || null;
  const paymentMethod = payload?.data?.payment?.payment_group || null;

  await recordPaymentWebhook({
    provider: 'cashfree',
    eventType: payload.type || payload.event || null,
    eventId: payload?.data?.payment?.cf_payment_id || orderId,
    orderId,
    paymentId,
    signatureValid: true,
    status: 'received',
    payload
  });

  await updatePaymentFromWebhook({
    provider: 'cashfree',
    orderId,
    paymentId,
    gatewayStatus,
    paymentMethod,
    gatewayOrderId: payload?.data?.payment?.payment_gateway_details?.gateway_order_id || payload?.data?.order?.cf_order_id || null,
    gatewayPaymentId: payload?.data?.payment?.payment_gateway_details?.gateway_payment_id || null
  });

  const subject = `Cashfree webhook | ${payload.type || payload.event || 'event'} | ${orderId || 'no-order-id'}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#132220;"><h2>SOHO Awards payment webhook</h2><p><strong>Provider:</strong> Cashfree</p><p><strong>Type:</strong> ${String(payload.type || payload.event || '')}</p><p><strong>Order ID:</strong> ${String(orderId || '')}</p><pre style="white-space:pre-wrap;background:#f7faf9;border:1px solid #d8e1df;padding:12px;border-radius:12px;">${JSON.stringify(payload, null, 2)}</pre></div>`;

  const awardsTo = process.env.AWARDS_TO || process.env.SMTP_TO || process.env.SMTP_FROM;
  try {
    if (awardsTo) await sendMail({ to: awardsTo, subject, html, replyTo: awardsTo });
    if (process.env.NOTIFICATION_WEBHOOK_URL) {
      await postWebhook({ type: 'payment-webhook', provider: 'cashfree', payload, orderId, paymentId });
    }
  } catch (err) {
    return json(res, 500, { message: err.message || 'Webhook relay failed.' });
  }

  return json(res, 200, { received: true, provider: 'cashfree' });
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
