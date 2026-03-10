# SOHO Awards 2026 - Live Website Bundle

## What changed in this build
- Switched the bundle to relative routing so it can deploy under any owned domain
- Added a live `nomination-form.html` submission page
- Added a live `partner-inquiry.html` submission page
- Kept the privacy / grievance form live and wired
- Added serverless API handlers for:
  - `/api/nominations`
  - `/api/privacy-requests`
  - `/api/partner-inquiries`
  - `/api/payments/create-order`
  - `/api/payments/verify`
  - `/api/payments/webhook-razorpay`
  - `/api/payments/webhook-cashfree`
- Added `package.json`, `.env.example`, and `vercel.json`
- Added a sitemap generation script so the final domain can be inserted cleanly

## Recommended deployment mode
This bundle is **Vercel-ready** as a static site plus API routes.

### Fast deployment path
1. Upload the entire folder to a Vercel project or connect the repo
2. Add the environment variables from `.env.example`
3. Update visible contact details in `assets/js/config.js`
4. Set the real `siteUrl` in `assets/js/config.js`
5. Choose your default payment gateway in `assets/js/config.js`
6. Run `npm install`
7. Run `npm run build:sitemap`
8. Redeploy

## Forms included
### Nomination form
Page: `nomination-form.html`
Submission endpoint: `window.SOHO_CONFIG.nominationEndpoint`
Default path: `/api/nominations`

### Payment endpoints used by the nomination form
Create order endpoint: `window.SOHO_CONFIG.nominationPaymentCreateOrderEndpoint`
Verify payment endpoint: `window.SOHO_CONFIG.nominationPaymentVerifyEndpoint`
Default paths:
- `/api/payments/create-order`
- `/api/payments/verify`

### Privacy / grievance form
Page: `data-requests-grievance.html`
Endpoint: `window.SOHO_CONFIG.privacyRequestEndpoint`
Default path: `/api/privacy-requests`

### Partner inquiry form
Page: `partner-inquiry.html`
Endpoint: `window.SOHO_CONFIG.partnerInquiryEndpoint`
Default path: `/api/partner-inquiries`

## Email / webhook delivery
Each API route supports:
- SMTP delivery using the SMTP variables in `.env.example`
- optional parallel or fallback delivery to `NOTIFICATION_WEBHOOK_URL`
- optional applicant acknowledgment emails when `ACK_EMAIL_ENABLED=true`

If no SMTP target or webhook is configured, the form will fail clearly instead of pretending the workflow is live.

## Contact and legal details still requiring your real values
These remain intentionally unresolved because they were not provided:
- owned production domain (defaulted here to sohoawards.com)
- organizer legal entity name
- full registered address
- grievance officer full name
- live inbox addresses
- phone number

Update them in `assets/js/config.js` before launch.

## Sitemap and robots
`robots.txt` is safe but generic.
`sitemap.xml` is intentionally blank until your real domain is known.
After setting `siteUrl` in `assets/js/config.js`, run:

```bash
npm install
npm run build:sitemap
```

## Notes on the live nomination form
To keep the site deployable without a complex file-upload stack, the nomination form uses an **Evidence Pack URL** field rather than direct file uploads.

Recommended practice:
- create a secure Drive / OneDrive / Dropbox folder per applicant
- require one evidence-pack link in the form
- move shortlisted applicants into your internal operating pack and review flow

## Integrated nomination fee workflow
This build includes a **₹100 nomination fee** and a native payment-gateway flow.

### How it works
1. The applicant fills the minimum nomination details
2. The site calls `/api/payments/create-order`
3. The applicant completes payment through **Razorpay** or **Cashfree**
4. The server verifies the payment through `/api/payments/verify`
5. The site stores a signed verification token in the form
6. Final nomination submission is unlocked only after verification succeeds
7. `/api/nominations` validates the signed token before accepting the nomination

### Gateway behavior
- **Razorpay** opens Standard Checkout on-page
- **Cashfree** uses hosted checkout and can redirect the applicant back to `nomination-form.html` for final verification
- Both gateways have dedicated webhook endpoints for optional asynchronous notifications and reconciliation

## Required environment variables
### Common
- `SITE_URL`
- `PAYMENT_RETURN_PATH`
- `NOMINATION_PAYMENT_PROVIDER`
- `NOMINATION_FEE_INR`
- `PAYMENT_TOKEN_SECRET`

### Razorpay
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

### Cashfree
- `CASHFREE_CLIENT_ID`
- `CASHFREE_CLIENT_SECRET`
- `CASHFREE_API_VERSION`
- `CASHFREE_ENVIRONMENT`

## Razorpay setup checklist
- generate test keys and later live keys in the Razorpay dashboard
- put the key ID and key secret into environment variables
- configure the Razorpay webhook URL to point to `/api/payments/webhook-razorpay`
- set a strong `RAZORPAY_WEBHOOK_SECRET`
- test the checkout and server-side signature verification before live launch

## Cashfree setup checklist
- generate App ID and Secret Key in Cashfree
- whitelist your live domain in Cashfree before live web checkout
- put the client ID and client secret into environment variables
- configure the Cashfree webhook URL to point to `/api/payments/webhook-cashfree`
- set `CASHFREE_ENVIRONMENT=sandbox` for testing and `production` for live use
- test the redirect-return flow and the order-status verification step before live launch

## Suggested next integration
If you want fully hosted file uploads next, the cleanest upgrade is:
- S3 / R2 / Cloudinary signed uploads
- CRM or Airtable / Sheets sync
- automatic ticket creation for privacy grievances
- transactional email provider such as Resend / Postmark / SMTP relay
- persistence for consumed payment tokens if you want stricter duplicate-submission controls


## Database-backed ops dashboard

This bundle now includes a private admin dashboard at `/admin/` and PostgreSQL-backed storage for nominations, payments, privacy tickets, partner inquiries, webhook receipts, and audit events.

### Additional setup

1. Provision PostgreSQL and run `database/schema.sql`.
2. Set `DATABASE_URL` and `ADMIN_API_KEY`.
3. Keep `DATABASE_SSL=require` unless your provider explicitly tells you otherwise.
4. Open `/admin/` and use the admin API key to connect.

### Included admin routes

- `/api/admin/dashboard`
- `/api/admin/nominations`
- `/api/admin/payments`
- `/api/admin/privacy-tickets`
- `/api/admin/partner-inquiries`

### Notes

- nomination submissions now check the verified payment against the database and prevent duplicate reuse of the same verified payment
- privacy requests and partner inquiries now create persistent reference IDs
- payment webhooks are recorded to `payment_webhooks` and reflected into the `payments` ledger
