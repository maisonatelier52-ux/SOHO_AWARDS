const { json, parseBody } = require('../_lib/utils');
const { getSql } = require('../_lib/db');
const { markPaymentVerified } = require('../_lib/repository');
const {
  hmacSha256Hex,
  secureEqual,
  issueSignedToken,
  getPaymentTokenSecret,
  getProviderConfig,
  getNominationFeeInr,
  getCashfreeApiBase,
  getRazorpayBase,
  fetchJson
} = require('../_lib/payment');

function buildVerifiedPayload(base) {
  return Object.assign({}, base, {
    paymentScope: 'nomination-fee',
    verifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });
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

  let provider;
  try {
    provider = getProviderConfig(data.provider);
  } catch (err) {
    return json(res, 400, { message: err.message });
  }

  const tokenSecret = getPaymentTokenSecret();
  if (!tokenSecret) {
    return json(res, 500, { message: 'Set PAYMENT_TOKEN_SECRET before using payment verification.' });
  }

  const nominationFeeInr = getNominationFeeInr();

  try {
    if (provider === 'razorpay') {
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        return json(res, 500, { message: 'Razorpay is not configured.' });
      }

      const orderId = String(data.orderId || '').trim();
      const paymentId = String(data.paymentId || '').trim();
      const signature = String(data.signature || '').trim();
      if (!orderId || !paymentId || !signature) {
        return json(res, 400, { message: 'Missing Razorpay payment details.' });
      }

      const generated = hmacSha256Hex(`${orderId}|${paymentId}`, keySecret);
      if (!secureEqual(generated, signature)) {
        return json(res, 400, { message: 'Razorpay payment signature verification failed.' });
      }

      let paymentDetails = null;
      try {
        paymentDetails = await fetchJson(`${getRazorpayBase()}/payments/${paymentId}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`
          }
        });
      } catch (err) {
        paymentDetails = null;
      }

      if (paymentDetails && paymentDetails.amount && Number(paymentDetails.amount) !== Math.round(nominationFeeInr * 100)) {
        return json(res, 400, { message: 'Razorpay payment amount does not match the nomination fee.' });
      }
      if (paymentDetails && paymentDetails.status && ['authorized', 'captured'].indexOf(String(paymentDetails.status).toLowerCase()) === -1) {
        return json(res, 400, { message: 'Razorpay payment is not in an authorized or captured state.' });
      }

      const payload = buildVerifiedPayload({
        provider: 'razorpay',
        providerLabel: 'Razorpay',
        orderId,
        paymentId,
        paymentReference: paymentId,
        gatewayOrderId: String(data.gatewayOrderId || '').trim() || orderId,
        amountInr: nominationFeeInr,
        amountMinor: Number(paymentDetails?.amount || Math.round(nominationFeeInr * 100)),
        currency: paymentDetails?.currency || 'INR',
        paymentStatus: paymentDetails?.status || 'captured_or_authorized',
        paymentMethod: paymentDetails?.method || '',
        customerName: String(data.primaryContactName || '').trim(),
        email: String(data.email || '').trim(),
        contact: String(data.contact || '').trim(),
        legalName: String(data.legalName || '').trim(),
        awardCategory: String(data.awardCategory || '').trim(),
        nominationReference: String(data.nominationReference || '').trim(),
        siteUrl: String(data.pageUrl || '').trim(),
        rawPayload: { request: data, gateway: paymentDetails }
      });

      const stored = await markPaymentVerified(payload);
      payload.nominationReference = stored.nomination_reference;

      return json(res, 200, {
        paid: true,
        paymentStatus: payload.paymentStatus,
        paymentLabel: `Razorpay payment ${paymentId}`,
        verifiedToken: issueSignedToken(payload, tokenSecret),
        payment: payload
      });
    }

    if (provider === 'cashfree') {
      const clientId = process.env.CASHFREE_CLIENT_ID;
      const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
      const apiVersion = process.env.CASHFREE_API_VERSION || '2025-01-01';
      if (!clientId || !clientSecret) {
        return json(res, 500, { message: 'Cashfree is not configured.' });
      }

      const orderId = String(data.orderId || '').trim();
      if (!orderId) return json(res, 400, { message: 'Missing Cashfree order ID.' });

      const headers = {
        'x-api-version': apiVersion,
        'x-client-id': clientId,
        'x-client-secret': clientSecret
      };

      const order = await fetchJson(`${getCashfreeApiBase()}/orders/${encodeURIComponent(orderId)}`, { headers });
      if (Number(order.order_amount || nominationFeeInr) !== nominationFeeInr) {
        return json(res, 400, { message: 'Cashfree order amount does not match the nomination fee.' });
      }
      if (String(order.order_status || '').toUpperCase() !== 'PAID') {
        return json(res, 409, {
          paid: false,
          paymentStatus: order.order_status || 'ACTIVE',
          message: `Cashfree order is currently ${order.order_status || 'ACTIVE'}. Complete the payment and retry.`
        });
      }

      let payments = [];
      try {
        payments = await fetchJson(`${getCashfreeApiBase()}/orders/${encodeURIComponent(orderId)}/payments`, { headers });
      } catch (err) {
        payments = [];
      }
      const successfulPayment = Array.isArray(payments)
        ? payments.find((item) => String(item.payment_status || '').toUpperCase() === 'SUCCESS') || payments[0]
        : null;

      const payload = buildVerifiedPayload({
        provider: 'cashfree',
        providerLabel: 'Cashfree',
        orderId,
        paymentId: successfulPayment?.cf_payment_id || order.cf_order_id || orderId,
        paymentReference: successfulPayment?.cf_payment_id || order.cf_order_id || orderId,
        gatewayOrderId: successfulPayment?.payment_gateway_details?.gateway_order_id || order.cf_order_id || '',
        gatewayPaymentId: successfulPayment?.payment_gateway_details?.gateway_payment_id || '',
        amountInr: nominationFeeInr,
        amountMinor: Math.round(Number(successfulPayment?.payment_amount || order.order_amount || nominationFeeInr) * 100),
        currency: order.order_currency || 'INR',
        paymentStatus: successfulPayment?.payment_status || order.order_status || 'PAID',
        paymentMethod: successfulPayment?.payment_group || '',
        customerName: String(order.customer_details?.customer_name || data.primaryContactName || '').trim(),
        email: String(order.customer_details?.customer_email || data.email || '').trim(),
        contact: String(order.customer_details?.customer_phone || data.contact || '').trim(),
        legalName: String(data.legalName || '').trim() || String(order.order_tags?.applicant_name || '').trim(),
        awardCategory: String(data.awardCategory || '').trim() || String(order.order_tags?.award_category || '').trim(),
        nominationReference: String(data.nominationReference || '').trim() || String(order.order_tags?.nomination_reference || '').trim(),
        siteUrl: String(data.pageUrl || '').trim(),
        rawPayload: { request: data, gateway: { order, payments } }
      });

      const stored = await markPaymentVerified(payload);
      payload.nominationReference = stored.nomination_reference;

      return json(res, 200, {
        paid: true,
        paymentStatus: payload.paymentStatus,
        paymentLabel: `Cashfree payment ${payload.paymentId}`,
        verifiedToken: issueSignedToken(payload, tokenSecret),
        payment: payload
      });
    }

    return json(res, 400, { message: 'Unsupported payment provider' });
  } catch (err) {
    return json(res, err.status || 500, { message: err.message || 'Could not verify payment' });
  }
};
