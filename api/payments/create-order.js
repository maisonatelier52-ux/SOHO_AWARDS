const { json, parseBody } = require('../_lib/utils');
const { getSql } = require('../_lib/db');
const { createOrUpdatePaymentOrder } = require('../_lib/repository');
const {
  createNominationReference,
  createCashfreeOrderId,
  createReceiptId,
  normalizePhone,
  getProviderConfig,
  getNominationFeeInr,
  getCashfreeApiBase,
  getCashfreeMode,
  getRazorpayBase,
  buildCashfreeReturnUrl,
  fetchJson
} = require('../_lib/payment');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });

  const data = await parseBody(req);
  if (!data) return json(res, 400, { message: 'Invalid request body' });

  const required = ['awardCategory', 'legalName', 'primaryContactName', 'primaryContactPhone', 'primaryContactEmail'];
  const missing = required.filter((field) => !String(data[field] || '').trim());
  if (missing.length) {
    return json(res, 400, { message: `Complete these fields before payment: ${missing.join(', ')}` });
  }

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

  const nominationFeeInr = getNominationFeeInr();
  const nominationReference = createNominationReference('SOHO');
  const feeDescription = `SOHO Awards nomination fee - ${data.awardCategory}`;

  try {
    if (provider === 'razorpay') {
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        return json(res, 500, { message: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' });
      }

      const amountPaise = Math.round(nominationFeeInr * 100);
      const order = await fetchJson(`${getRazorpayBase()}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt: createReceiptId(),
          notes: {
            nomination_reference: nominationReference,
            legal_name: data.legalName,
            award_category: data.awardCategory,
            contact_email: data.primaryContactEmail,
            contact_phone: normalizePhone(data.primaryContactPhone)
          }
        })
      });

      const stored = await createOrUpdatePaymentOrder({
        gatewayProvider: 'razorpay',
        providerLabel: 'Razorpay',
        nominationReference,
        legalName: data.legalName,
        awardCategory: data.awardCategory,
        customerName: data.primaryContactName,
        customerEmail: data.primaryContactEmail,
        customerPhone: normalizePhone(data.primaryContactPhone),
        orderId: order.id,
        amountInr: nominationFeeInr,
        currency: order.currency || 'INR',
        siteUrl: data.pageUrl || null,
        payload: { formContext: data, order }
      });

      return json(res, 200, {
        provider: 'razorpay',
        providerLabel: 'Razorpay',
        nominationReference: stored.nomination_reference,
        amount: order.amount,
        currency: order.currency || 'INR',
        amountInr: nominationFeeInr,
        orderId: order.id,
        publicKey: keyId,
        description: feeDescription,
        prefill: {
          name: data.primaryContactName,
          email: data.primaryContactEmail,
          contact: normalizePhone(data.primaryContactPhone)
        },
        notes: {
          applicant_name: data.legalName,
          award_category: data.awardCategory
        }
      });
    }

    if (provider === 'cashfree') {
      const clientId = process.env.CASHFREE_CLIENT_ID;
      const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
      const apiVersion = process.env.CASHFREE_API_VERSION || '2025-01-01';
      if (!clientId || !clientSecret) {
        return json(res, 500, { message: 'Cashfree is not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET.' });
      }

      const orderId = createCashfreeOrderId();
      const phone = normalizePhone(data.primaryContactPhone);
      if (phone.length < 10) {
        return json(res, 400, { message: 'Enter a valid 10-digit contact number before starting payment.' });
      }

      const order = await fetchJson(`${getCashfreeApiBase()}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-version': apiVersion,
          'x-client-id': clientId,
          'x-client-secret': clientSecret
        },
        body: JSON.stringify({
          order_id: orderId,
          order_currency: 'INR',
          order_amount: nominationFeeInr,
          customer_details: {
            customer_id: nominationReference.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 45),
            customer_name: data.primaryContactName,
            customer_email: data.primaryContactEmail,
            customer_phone: phone
          },
          order_meta: {
            return_url: buildCashfreeReturnUrl(data.pageUrl)
          },
          order_note: feeDescription,
          order_tags: {
            nomination_reference: nominationReference,
            applicant_name: data.legalName,
            award_category: data.awardCategory
          }
        })
      });

      const stored = await createOrUpdatePaymentOrder({
        gatewayProvider: 'cashfree',
        providerLabel: 'Cashfree',
        nominationReference,
        legalName: data.legalName,
        awardCategory: data.awardCategory,
        customerName: data.primaryContactName,
        customerEmail: data.primaryContactEmail,
        customerPhone: phone,
        orderId: order.order_id,
        amountInr: nominationFeeInr,
        currency: 'INR',
        siteUrl: data.pageUrl || null,
        payload: { formContext: data, order }
      });

      return json(res, 200, {
        provider: 'cashfree',
        providerLabel: 'Cashfree',
        nominationReference: stored.nomination_reference,
        amountInr: nominationFeeInr,
        currency: 'INR',
        orderId: order.order_id,
        cfOrderId: order.cf_order_id,
        paymentSessionId: order.payment_session_id,
        mode: getCashfreeMode(),
        returnUrl: buildCashfreeReturnUrl(data.pageUrl),
        description: feeDescription
      });
    }

    return json(res, 400, { message: 'Unsupported payment provider' });
  } catch (err) {
    return json(res, err.status || 500, { message: err.message || 'Could not start payment order' });
  }
};
