const { getSql } = require('./db');
const { randomId } = require('./payment');

function createReference(prefix) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${randomId(6).toUpperCase()}`;
}

function buildNominationReference() {
  return createReference('SOHO-NOM');
}

function buildPrivacyReference() {
  return createReference('SOHO-PRV');
}

function buildPartnerReference() {
  return createReference('SOHO-PAR');
}

function buildLike(term) {
  return `%${String(term || '').trim()}%`;
}

function normalizeLimit(value, fallback = 25, max = 200) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function normalizeOffset(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function derivePrivacyPriority(data) {
  const requestType = String(data.requestType || '').toLowerCase();
  const urgent = String(data.urgent || '').toLowerCase();
  const description = String(data.description || '').toLowerCase();
  const actionRequested = String(data.actionRequested || '').toLowerCase();
  const text = `${requestType} ${description} ${actionRequested}`;
  if (urgent === 'yes' || /unauthorized disclosure|account compromise|public exposure|security|wrong winner|misuse/.test(text)) return 'p1';
  if (/public content|deletion|removal|grievance|privacy/.test(text)) return 'p2';
  return 'p3';
}

function derivePrivacyFlags(data) {
  const text = `${String(data.requestType || '')} ${String(data.description || '')} ${String(data.actionRequested || '')}`.toLowerCase();
  return {
    publicContentFlag: /public|listing|winner page|photo|video|recap|published|logo/.test(text),
    securityIncidentFlag: /security|compromise|unauthorized|exposed|breach|leak/.test(text)
  };
}

async function appendAudit(actor, entry) {
  const sql = getSql();
  await sql.unsafe(
    `insert into admin_audit_log (entity_type, entity_id, action, actor_name, actor_identifier, metadata)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [entry.entityType, String(entry.entityId), entry.action, actor?.name || null, actor?.identifier || null, JSON.stringify(entry.metadata || {})]
  );
}

async function createOrUpdatePaymentOrder(record) {
  const sql = getSql();
  const rows = await sql.unsafe(
    `insert into payments (
        gateway_provider, payment_scope, provider_label, nomination_reference, legal_name, award_category,
        customer_name, customer_email, customer_phone, order_id, amount_inr, currency,
        verification_status, gateway_status, site_url, payload
      ) values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        'order_created', 'created', $13, $14::jsonb
      )
      on conflict (gateway_provider, order_id)
      do update set
        nomination_reference = excluded.nomination_reference,
        legal_name = excluded.legal_name,
        award_category = excluded.award_category,
        customer_name = excluded.customer_name,
        customer_email = excluded.customer_email,
        customer_phone = excluded.customer_phone,
        amount_inr = excluded.amount_inr,
        currency = excluded.currency,
        provider_label = excluded.provider_label,
        site_url = excluded.site_url,
        payload = excluded.payload,
        updated_at = now()
      returning *`,
    [
      record.gatewayProvider,
      record.paymentScope || 'nomination-fee',
      record.providerLabel || null,
      record.nominationReference || buildNominationReference(),
      record.legalName,
      record.awardCategory,
      record.customerName,
      record.customerEmail,
      record.customerPhone || null,
      record.orderId,
      record.amountInr,
      record.currency || 'INR',
      record.siteUrl || null,
      JSON.stringify(record.payload || {})
    ]
  );
  return rows[0];
}

async function markPaymentVerified(record) {
  const sql = getSql();
  const rows = await sql.unsafe(
    `insert into payments (
        gateway_provider, payment_scope, provider_label, nomination_reference, legal_name, award_category,
        customer_name, customer_email, customer_phone, order_id, payment_id, gateway_order_id,
        gateway_payment_id, amount_inr, currency, verification_status, gateway_status,
        payment_method, site_url, payload, verified_payload, verified_at
      ) values (
        $1, 'nomination-fee', $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, 'verified', $15,
        $16, $17, $18::jsonb, $19::jsonb, now()
      )
      on conflict (gateway_provider, order_id)
      do update set
        payment_id = excluded.payment_id,
        gateway_order_id = excluded.gateway_order_id,
        gateway_payment_id = excluded.gateway_payment_id,
        verification_status = 'verified',
        gateway_status = excluded.gateway_status,
        payment_method = excluded.payment_method,
        verified_payload = excluded.verified_payload,
        verified_at = now(),
        updated_at = now()
      returning *`,
    [
      record.provider,
      record.providerLabel || null,
      record.nominationReference || buildNominationReference(),
      record.legalName || 'Unknown applicant',
      record.awardCategory || 'Unspecified category',
      record.customerName || record.legalName || 'Unknown contact',
      record.email || null,
      record.contact || null,
      record.orderId,
      record.paymentId,
      record.gatewayOrderId || null,
      record.gatewayPaymentId || null,
      record.amountInr,
      record.currency || 'INR',
      record.paymentStatus || 'verified',
      record.paymentMethod || null,
      record.siteUrl || null,
      JSON.stringify(record.rawPayload || {}),
      JSON.stringify(record.verifiedPayload || record)
    ]
  );
  return rows[0];
}

async function createNominationFromSubmission(data, verifiedPayment) {
  const sql = getSql();
  const result = await sql.begin(async (tx) => {
    const paymentRows = await tx.unsafe(
      `select * from payments
       where gateway_provider = $1 and order_id = $2 and payment_id = $3
       for update`,
      [String(verifiedPayment.provider).toLowerCase(), String(data.paymentOrderId), String(data.paymentId)]
    );

    if (!paymentRows.length) {
      throw new Error('No verified payment record was found in the database for this nomination.');
    }

    const payment = paymentRows[0];
    if (payment.nomination_id) {
      throw new Error('This verified payment has already been used for a nomination submission.');
    }

    if (!['verified', 'webhook_paid'].includes(String(payment.verification_status || '').toLowerCase())) {
      throw new Error('This payment is not in a verified state yet.');
    }

    const nominationReference = payment.nomination_reference || buildNominationReference();
    const insertRows = await tx.unsafe(
      `insert into nominations (
        nomination_reference, applicant_type, award_category, legal_name, brand_name,
        registration_type, registration_id, year_started, city, state, country,
        website, linkedin, instagram, primary_contact_name, primary_contact_role,
        primary_contact_phone, primary_contact_email, business_summary, key_metrics,
        evidence_pack_url, authorized_signatory_name, authorized_signatory_designation,
        status, screening_status, payment_provider, payment_order_id, payment_id,
        payment_status, payment_amount_inr, payment_verified_at, payload
      ) values (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23,
        'submitted', 'payment_verified', $24, $25, $26,
        $27, $28, $29, $30::jsonb
      ) returning *`,
      [
        nominationReference,
        data.applicantType,
        data.awardCategory,
        data.legalName,
        data.brandName || null,
        data.registrationType,
        data.registrationId,
        data.yearStarted,
        data.city,
        data.state,
        data.country || 'India',
        data.website || null,
        data.linkedin || null,
        data.instagram || null,
        data.primaryContactName,
        data.primaryContactRole,
        data.primaryContactPhone,
        data.primaryContactEmail,
        data.businessSummary,
        data.keyMetrics,
        data.evidencePackUrl,
        data.authorizedSignatoryName,
        data.authorizedSignatoryDesignation,
        String(verifiedPayment.provider).toLowerCase(),
        data.paymentOrderId,
        data.paymentId,
        data.paymentStatus,
        verifiedPayment.amountInr,
        verifiedPayment.verifiedAt || new Date().toISOString(),
        JSON.stringify(data)
      ]
    );

    const nomination = insertRows[0];

    await tx.unsafe(
      `update payments
       set nomination_id = $1,
           verification_status = 'linked_to_nomination',
           gateway_status = coalesce($2, gateway_status),
           updated_at = now()
       where id = $3`,
      [nomination.id, verifiedPayment.paymentStatus || payment.gateway_status || null, payment.id]
    );

    await tx.unsafe(
      `insert into admin_audit_log (entity_type, entity_id, action, actor_name, actor_identifier, metadata)
       values ('nomination', $1, 'nomination_submitted', 'System', 'public-form', $2::jsonb)`,
      [nomination.id, JSON.stringify({ nominationReference, paymentId: data.paymentId, orderId: data.paymentOrderId })]
    );

    return nomination;
  });
  return result;
}

async function createPrivacyRequest(data) {
  const sql = getSql();
  const flags = derivePrivacyFlags(data);
  const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const requestReference = buildPrivacyReference();
  const rows = await sql.unsafe(
    `insert into privacy_requests (
      request_reference, request_type, priority, status, full_name, email, phone,
      organization, relationship, edition, category, urgent, url, submission_reference,
      description, action_requested, preferred_contact, supporting_url, due_at,
      public_content_flag, security_incident_flag, payload
    ) values (
      $1, $2, $3, 'new', $4, $5, $6,
      $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18,
      $19, $20, $21::jsonb
    ) returning *`,
    [
      requestReference,
      data.requestType,
      derivePrivacyPriority(data),
      data.fullName,
      data.email,
      data.phone || null,
      data.organization || null,
      data.relationship,
      data.edition || null,
      data.category || null,
      data.urgent || null,
      data.url || null,
      data.reference || null,
      data.description,
      data.actionRequested || null,
      data.preferredContact || null,
      data.supportingUrl || null,
      dueAt,
      flags.publicContentFlag,
      flags.securityIncidentFlag,
      JSON.stringify(data)
    ]
  );
  return rows[0];
}

async function createPartnerInquiry(data) {
  const sql = getSql();
  const inquiryReference = buildPartnerReference();
  const rows = await sql.unsafe(
    `insert into partner_inquiries (
      inquiry_reference, company_name, contact_name, contact_designation,
      contact_email, contact_phone, interest_type, message, payload
    ) values (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9::jsonb
    ) returning *`,
    [
      inquiryReference,
      data.companyName,
      data.contactName,
      data.contactDesignation || null,
      data.contactEmail,
      data.contactPhone,
      data.interestType,
      data.message,
      JSON.stringify(data)
    ]
  );
  return rows[0];
}

async function recordPaymentWebhook(entry) {
  const sql = getSql();
  const rows = await sql.unsafe(
    `insert into payment_webhooks (
      provider, event_type, event_id, order_id, payment_id,
      signature_valid, status, notes, payload, processed_at
    ) values (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9::jsonb, now()
    ) returning *`,
    [
      entry.provider,
      entry.eventType || null,
      entry.eventId || null,
      entry.orderId || null,
      entry.paymentId || null,
      !!entry.signatureValid,
      entry.status || 'received',
      entry.notes || null,
      JSON.stringify(entry.payload || {})
    ]
  );
  return rows[0];
}

async function updatePaymentFromWebhook(entry) {
  const sql = getSql();
  if (!entry.orderId) return null;
  const rows = await sql.unsafe(
    `update payments
     set payment_id = coalesce($1, payment_id),
         gateway_order_id = coalesce($2, gateway_order_id),
         gateway_payment_id = coalesce($3, gateway_payment_id),
         gateway_status = coalesce($4, gateway_status),
         payment_method = coalesce($5, payment_method),
         verification_status = case
           when verification_status = 'linked_to_nomination' then verification_status
           when $4 in ('captured', 'PAID', 'SUCCESS') then 'webhook_paid'
           else verification_status
         end,
         updated_at = now()
     where gateway_provider = $6 and order_id = $7
     returning *`,
    [
      entry.paymentId || null,
      entry.gatewayOrderId || null,
      entry.gatewayPaymentId || null,
      entry.gatewayStatus || null,
      entry.paymentMethod || null,
      entry.provider,
      entry.orderId
    ]
  );
  return rows[0] || null;
}

async function getDashboardData(limitValue = 12) {
  const sql = getSql();
  const limit = normalizeLimit(limitValue, 12, 50);
  const [nominationMetrics] = await sql.unsafe(
    `select
      count(*)::int as total_nominations,
      count(*) filter (where status = 'submitted')::int as submitted_nominations,
      count(*) filter (where screening_status = 'ready_for_jury')::int as ready_for_jury,
      count(*) filter (where screening_status = 'verification_hold')::int as verification_hold,
      count(*) filter (where status = 'winner')::int as winners
     from nominations`
  );
  const [paymentMetrics] = await sql.unsafe(
    `select
      count(*)::int as total_payments,
      count(*) filter (where verification_status = 'verified')::int as verified_unlinked_payments,
      count(*) filter (where verification_status = 'linked_to_nomination')::int as linked_payments,
      count(*) filter (where verification_status in ('failed', 'refunded'))::int as payment_exceptions
     from payments`
  );
  const [privacyMetrics] = await sql.unsafe(
    `select
      count(*)::int as total_privacy_requests,
      count(*) filter (where status in ('new', 'acknowledged', 'in_review', 'awaiting_verification', 'awaiting_internal_action'))::int as open_privacy_requests,
      count(*) filter (where priority = 'p1')::int as p1_privacy_requests,
      count(*) filter (where due_at is not null and due_at < now() and status not in ('resolved', 'closed'))::int as overdue_privacy_requests
     from privacy_requests`
  );
  const [partnerMetrics] = await sql.unsafe(
    `select
      count(*)::int as total_partner_inquiries,
      count(*) filter (where status = 'new')::int as new_partner_inquiries
     from partner_inquiries`
  );

  const nominations = await sql.unsafe(
    `select id, nomination_reference, legal_name, award_category, status, screening_status,
            assigned_owner, payment_provider, payment_status, payment_amount_inr,
            primary_contact_email, created_at
     from nominations
     order by created_at desc
     limit $1`,
    [limit]
  );

  const payments = await sql.unsafe(
    `select id, gateway_provider, order_id, payment_id, legal_name, award_category,
            verification_status, gateway_status, amount_inr, nomination_reference,
            customer_email, created_at, verified_at
     from payments
     order by created_at desc
     limit $1`,
    [limit]
  );

  const privacyTickets = await sql.unsafe(
    `select id, request_reference, full_name, request_type, priority, status, owner_name,
            due_at, public_content_flag, security_incident_flag, created_at
     from privacy_requests
     order by created_at desc
     limit $1`,
    [limit]
  );

  const partnerInquiries = await sql.unsafe(
    `select id, inquiry_reference, company_name, contact_name, interest_type, status,
            contact_email, created_at
     from partner_inquiries
     order by created_at desc
     limit $1`,
    [limit]
  );

  const audit = await sql.unsafe(
    `select id, entity_type, entity_id, action, actor_name, actor_identifier, metadata, created_at
     from admin_audit_log
     order by created_at desc
     limit $1`,
    [limit]
  );

  return {
    metrics: {
      nominations: nominationMetrics,
      payments: paymentMetrics,
      privacy: privacyMetrics,
      partners: partnerMetrics
    },
    nominations,
    payments,
    privacyTickets,
    partnerInquiries,
    audit
  };
}

async function listNominations(filters = {}) {
  const sql = getSql();
  const conditions = [];
  const params = [];
  let i = 1;
  if (filters.status) {
    conditions.push(`status = $${i++}`);
    params.push(filters.status);
  }
  if (filters.screeningStatus) {
    conditions.push(`screening_status = $${i++}`);
    params.push(filters.screeningStatus);
  }
  if (filters.q) {
    conditions.push(`(nomination_reference ilike $${i} or legal_name ilike $${i} or award_category ilike $${i} or primary_contact_email ilike $${i})`);
    params.push(buildLike(filters.q));
    i += 1;
  }
  const limit = normalizeLimit(filters.limit, 25, 200);
  const offset = normalizeOffset(filters.offset);
  params.push(limit, offset);
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const rows = await sql.unsafe(
    `select id, nomination_reference, legal_name, award_category, status, screening_status,
            assigned_owner, due_at, payment_provider, payment_status, payment_amount_inr,
            primary_contact_name, primary_contact_email, created_at, updated_at, notes
     from nominations
     ${where}
     order by created_at desc
     limit $${i++} offset $${i++}`,
    params
  );
  return rows;
}

async function updateNomination(id, patch, actor) {
  const sql = getSql();
  const rows = await sql.unsafe(
    `update nominations
     set status = coalesce($1, status),
         screening_status = coalesce($2, screening_status),
         assigned_owner = coalesce($3, assigned_owner),
         due_at = coalesce($4::timestamptz, due_at),
         notes = case when $5 is null or $5 = '' then notes else $5 end,
         updated_at = now()
     where id = $6
     returning *`,
    [patch.status || null, patch.screeningStatus || null, patch.assignedOwner || null, patch.dueAt || null, patch.notes || null, id]
  );
  const updated = rows[0] || null;
  if (updated) {
    await appendAudit(actor, {
      entityType: 'nomination',
      entityId: updated.id,
      action: 'nomination_status_updated',
      metadata: patch
    });
  }
  return updated;
}

async function listPayments(filters = {}) {
  const sql = getSql();
  const conditions = [];
  const params = [];
  let i = 1;
  if (filters.provider) {
    conditions.push(`gateway_provider = $${i++}`);
    params.push(filters.provider);
  }
  if (filters.verificationStatus) {
    conditions.push(`verification_status = $${i++}`);
    params.push(filters.verificationStatus);
  }
  if (filters.q) {
    conditions.push(`(order_id ilike $${i} or coalesce(payment_id, '') ilike $${i} or legal_name ilike $${i} or customer_email ilike $${i})`);
    params.push(buildLike(filters.q));
    i += 1;
  }
  const limit = normalizeLimit(filters.limit, 25, 200);
  const offset = normalizeOffset(filters.offset);
  params.push(limit, offset);
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  return sql.unsafe(
    `select id, gateway_provider, order_id, payment_id, legal_name, award_category,
            amount_inr, currency, verification_status, gateway_status, payment_method,
            nomination_reference, customer_email, verified_at, created_at, updated_at
     from payments
     ${where}
     order by created_at desc
     limit $${i++} offset $${i++}`,
    params
  );
}

async function listPrivacyRequests(filters = {}) {
  const sql = getSql();
  const conditions = [];
  const params = [];
  let i = 1;
  if (filters.status) {
    conditions.push(`status = $${i++}`);
    params.push(filters.status);
  }
  if (filters.priority) {
    conditions.push(`priority = $${i++}`);
    params.push(filters.priority);
  }
  if (filters.q) {
    conditions.push(`(request_reference ilike $${i} or full_name ilike $${i} or email ilike $${i} or request_type ilike $${i})`);
    params.push(buildLike(filters.q));
    i += 1;
  }
  const limit = normalizeLimit(filters.limit, 25, 200);
  const offset = normalizeOffset(filters.offset);
  params.push(limit, offset);
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  return sql.unsafe(
    `select id, request_reference, request_type, priority, status, full_name, email, phone,
            organization, relationship, due_at, owner_name, public_content_flag,
            security_incident_flag, description, action_requested, notes, created_at, updated_at
     from privacy_requests
     ${where}
     order by created_at desc
     limit $${i++} offset $${i++}`,
    params
  );
}

async function updatePrivacyRequest(id, patch, actor) {
  const sql = getSql();
  const rows = await sql.unsafe(
    `update privacy_requests
     set status = coalesce($1, status),
         priority = coalesce($2, priority),
         owner_name = coalesce($3, owner_name),
         due_at = coalesce($4::timestamptz, due_at),
         identity_verified = coalesce($5, identity_verified),
         authority_verified = coalesce($6, authority_verified),
         notes = case when $7 is null or $7 = '' then notes else $7 end,
         updated_at = now()
     where id = $8
     returning *`,
    [
      patch.status || null,
      patch.priority || null,
      patch.ownerName || null,
      patch.dueAt || null,
      typeof patch.identityVerified === 'boolean' ? patch.identityVerified : null,
      typeof patch.authorityVerified === 'boolean' ? patch.authorityVerified : null,
      patch.notes || null,
      id
    ]
  );
  const updated = rows[0] || null;
  if (updated) {
    await appendAudit(actor, {
      entityType: 'privacy_request',
      entityId: updated.id,
      action: 'privacy_ticket_updated',
      metadata: patch
    });
  }
  return updated;
}

async function listPartnerInquiries(filters = {}) {
  const sql = getSql();
  const conditions = [];
  const params = [];
  let i = 1;
  if (filters.status) {
    conditions.push(`status = $${i++}`);
    params.push(filters.status);
  }
  if (filters.q) {
    conditions.push(`(inquiry_reference ilike $${i} or company_name ilike $${i} or contact_name ilike $${i} or contact_email ilike $${i})`);
    params.push(buildLike(filters.q));
    i += 1;
  }
  const limit = normalizeLimit(filters.limit, 25, 200);
  const offset = normalizeOffset(filters.offset);
  params.push(limit, offset);
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  return sql.unsafe(
    `select id, inquiry_reference, company_name, contact_name, contact_designation,
            contact_email, contact_phone, interest_type, message, status, owner_name, created_at, updated_at
     from partner_inquiries
     ${where}
     order by created_at desc
     limit $${i++} offset $${i++}`,
    params
  );
}

module.exports = {
  appendAudit,
  createOrUpdatePaymentOrder,
  markPaymentVerified,
  createNominationFromSubmission,
  createPrivacyRequest,
  createPartnerInquiry,
  recordPaymentWebhook,
  updatePaymentFromWebhook,
  getDashboardData,
  listNominations,
  updateNomination,
  listPayments,
  listPrivacyRequests,
  updatePrivacyRequest,
  listPartnerInquiries,
  buildNominationReference,
  buildPrivacyReference,
  buildPartnerReference
};
