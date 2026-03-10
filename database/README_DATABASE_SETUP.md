# SOHO Awards database and admin setup

This site now expects a PostgreSQL database for live nominations, payments, privacy tickets, partner inquiries, webhook receipts, and the admin audit trail.

## 1. Provision Postgres

Use any managed PostgreSQL provider. Recommended serverless-friendly options:
- Supabase Postgres
- Neon Postgres
- Vercel Marketplace Postgres integration
- Self-managed PostgreSQL with SSL enabled

## 2. Run the schema

Apply `database/schema.sql` to your database.

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

## 3. Configure environment variables

Add these at minimum:

```bash
DATABASE_URL=
DATABASE_SSL=require
ADMIN_API_KEY=
ADMIN_DASHBOARD_EMAIL=ops@sohoawards.com
PAYMENT_TOKEN_SECRET=
```

Keep your existing SMTP + payment gateway variables.

## 4. Admin dashboard access

Open `/admin/` and sign in with:
- Admin display name
- Admin API key (`ADMIN_API_KEY`)

The dashboard uses same-origin admin APIs and sends the API key in the request header.

## 5. First-use checklist

- create the database
- run `database/schema.sql`
- set `DATABASE_URL`
- set `ADMIN_API_KEY`
- deploy the updated site
- test create-order, verify, nomination submit, privacy ticket submit, and one admin status update

## 6. Suggested statuses

### Nominations
- submitted
- shortlisted
- finalist
- winner
- rejected
- withdrawn

### Screening status
- payment_verified
- screening_pending
- verification_hold
- ready_for_jury
- jury_review
- closed

### Payments
- order_created
- verified
- linked_to_nomination
- webhook_paid
- failed
- refunded

### Privacy tickets
- new
- acknowledged
- awaiting_verification
- in_review
- awaiting_internal_action
- awaiting_requester_response
- resolved
- closed
- rejected

## 7. Operational note

The nomination submission route now checks the verified payment against the database and prevents reusing the same verified payment for multiple nominations.
